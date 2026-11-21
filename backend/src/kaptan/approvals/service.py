"""Write side: decide a proposal, add a note, mark an order ticket (mock-api.ts / enterprise.ts parity).

Each function runs its checks and writes inside one transaction (state + audit entry) and returns
the response body plus the desk events to publish after commit (`Outcome`). Status codes, `code`s
and the Turkish `detail` texts are the mock's.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.approvals.execute import Event, execute_approved, run_audit
from kaptan.approvals.reads import card_from_row, card_rows, ticket_from_row, ticket_rows
from kaptan.approvals.ticket_doc import parse_iso
from kaptan.audit.writer import append
from kaptan.brokers.costs import commission_of
from kaptan.domain.schemas import ApprovalDecision, iso_ms
from kaptan.domain.schemas.trading import TicketCorrectInput, TicketMarkEntered, TicketMarkInput
from kaptan.portfolio import fee, fill_fix, ledger
from kaptan.portfolio.ledger import cents
from kaptan.portfolio.positions import open_position
from kaptan.risk.at_send import check_at_send

NOT_FOUND_PROPOSAL: Final = "Öneri bulunamadı."
NOT_FOUND_TICKET: Final = "İşlem bulunamadı."
MARKABLE: Final = frozenset({"awaiting", "expired"})


@dataclass(frozen=True, slots=True)
class Outcome:
    body: dict[str, Any]
    events: list[Event] = field(default_factory=list)


async def _card_or_404(conn: AsyncConnection[Any], proposal_id: str, *, now: datetime, lock: bool) -> dict[str, Any]:
    rows = await card_rows(conn, proposal_id=proposal_id, lock=lock)
    if not rows:
        raise ApiError(404, "not_found", NOT_FOUND_PROPOSAL)
    return card_from_row(rows[0], now=now)


def _check_decision(card: dict[str, Any], d: ApprovalDecision) -> None:
    if card["status"] != "pending":
        raise ApiError(409, "conflict", "Bu öneri zaten karara bağlandı ya da süresi doldu.")
    if d.approved_notional_try is not None and d.approved_notional_try > card["final_notional_try"]:
        raise ApiError(422, "grow_not_allowed", "Tutar yalnızca küçültülebilir; büyütme yok.")


DECIDE_SQL: Final = """
UPDATE trading.approvals SET status = %s, decided_by = %s, decided_role = %s, decided_at = %s,
  decision_comment = %s, approved_notional_try = %s, row_version = row_version + 1
WHERE proposal_id = %s
"""
DECISION_LOG_SQL: Final = """
INSERT INTO trading.approval_decisions (proposal_id, uid, name, role, decision, approved_notional_try, comment,
  decided_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""


async def decide(
    conn: AsyncConnection[Any], proposal_id: str, d: ApprovalDecision, actor: Actor, *, now: datetime
) -> Outcome:
    """decideApproval(): approve (optionally smaller) or reject; an approval executes right away.

    A real run's approval first passes R16 at send time (`_at_send_block`); a failure is audited and
    committed, the card stays pending and the caller gets 409 (conflict)."""
    blocked: ApiError | None = None
    async with conn.transaction():
        card = await _card_or_404(conn, proposal_id, now=now, lock=True)
        _check_decision(card, d)
        if d.decision == "approve":
            blocked = await _at_send_block(conn, card, actor, now)
        if blocked is None:
            outcome = await _record_decision(conn, proposal_id, card, d, actor, now)
    if blocked is not None:
        raise blocked
    return outcome


LIVE_RUN_SQL: Final = "SELECT run_set FROM trading.agent_runs WHERE run_id = %s"


async def _at_send_block(
    conn: AsyncConnection[Any], card: dict[str, Any], actor: Actor, now: datetime
) -> ApiError | None:
    """R16 with the desk as it is now, for cards of real runs only (recorded cards: M1's path, unchanged)."""
    async with conn.cursor() as cur:
        await cur.execute(LIVE_RUN_SQL, (card["run_id"],))
        run = await cur.fetchone()
    if run is None or run["run_set"] != "live":
        return None
    check = await check_at_send(conn, card, now)
    if check.ok:
        return None
    payload = {
        "ticker": card["ticker"],
        "company": card["company_name"],
        "rule_code": "R16",
        "failed_rule": check.failed_rule,
        "detail_tr": check.result.detail_tr,
        "role": actor.role,
        "limits_version": check.limits_version,
    }
    draft = run_audit(
        "system:risk_gate", "risk.rejected", "trade_proposal", card["proposal_id"], payload, card["run_id"]
    )
    await append(conn, [draft], now=now)
    return ApiError(409, "conflict", check.result.detail_tr)


async def _record_decision(
    conn: AsyncConnection[Any],
    proposal_id: str,
    card: dict[str, Any],
    d: ApprovalDecision,
    actor: Actor,
    now: datetime,
) -> Outcome:
    """The decision itself (state + audit `approval.decided`) and, for an approval, the order."""
    approve = d.decision == "approve"
    notional = d.approved_notional_try if approve else None
    comment = d.comment or None
    updated = {
        **card,
        "status": "approved" if approve else "rejected",
        "decided_by": actor.uid,
        "decided_at": iso_ms(now),
        "decision_comment": comment,
        "approved_notional_try": notional,
    }
    async with conn.cursor() as cur:
        await cur.execute(DECIDE_SQL, (updated["status"], actor.uid, actor.role, now, comment, notional, proposal_id))
        await cur.execute(
            DECISION_LOG_SQL, (proposal_id, actor.uid, actor.name, actor.role, d.decision, notional, comment, now)
        )
    payload = {
        "ticker": card["ticker"],
        "company": card["company_name"],
        "decision": d.decision,
        "role": actor.role,
        "note": len(d.comment) > 0,
    }
    draft = run_audit(actor.audit_actor, "approval.decided", "trade_proposal", proposal_id, payload, card["run_id"])
    await append(conn, [draft], now=now)
    events: list[Event] = [("approval.decided", updated)]
    if approve:
        events += await execute_approved(conn, updated, now)
    return Outcome(updated, events)


NOTES_SQL: Final = """
SELECT id, proposal_id, uid, name, role, body, created_at FROM trading.proposal_notes WHERE proposal_id = %s
ORDER BY created_at, length(id), id
"""


def _note_doc(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "created_at": iso_ms(row["created_at"])}


async def list_notes(conn: AsyncConnection[Any], proposal_id: str) -> list[dict[str, Any]]:
    """listNotes(): the proposal's notes, oldest first (no 404 for an unknown proposal, like the mock)."""
    async with conn.cursor() as cur:
        await cur.execute(NOTES_SQL, (proposal_id,))
        return [_note_doc(r) for r in await cur.fetchall()]


async def add_note(
    conn: AsyncConnection[Any], proposal_id: str, body: str, actor: Actor, *, now: datetime
) -> dict[str, Any]:
    """addNote(): id `not-<n>`, audit `note.added` {ticker, company, role}."""
    async with conn.transaction():
        card = await _card_or_404(conn, proposal_id, now=now, lock=False)
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO trading.proposal_notes (proposal_id, uid, name, role, body, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, proposal_id, uid, name, role, body, created_at""",
                (proposal_id, actor.uid, actor.name, actor.role, body, now),
            )
            row = await cur.fetchone()
        assert row is not None
        payload = {"ticker": card["ticker"], "company": card["company_name"], "role": actor.role}
        draft = run_audit(actor.audit_actor, "note.added", "trade_proposal", proposal_id, payload, card["run_id"])
        await append(conn, [draft], now=now)
    return _note_doc(row)


def _check_fill(ticket: dict[str, Any], qty: int, price: float) -> None:
    """The ticket's own rules for a recorded fill: adet within the ticket, price within its limit."""
    if qty > ticket["qty"]:
        raise ApiError(422, "over_qty", "Gerçekleşen adet, işlemdeki adetten büyük olamaz.")
    if ticket.get("side", "buy") == "sell":
        # A sell limit is a floor: the average may not fall under it (06 R09 SELL: limit ≥ taban).
        if price < ticket["limit_price"]:
            raise ApiError(422, "under_limit", "Satışta ortalama fiyat, yazdığın en düşük fiyatın altında olamaz.")
    elif price > ticket["limit_price"]:
        raise ApiError(422, "over_limit", "Ortalama fiyat, yazdığın en yüksek fiyatı aşamaz.")
    # A fill after `valid_until` is still the person's real fill: it is recorded (flagged late), never refused.


def _check_entered(ticket: dict[str, Any], m: TicketMarkEntered) -> None:
    _check_fill(ticket, m.filled_qty, m.avg_price)


@dataclass(frozen=True, slots=True)
class Charged:
    """The commission of a fill and where it came from."""

    amount: Decimal
    estimated: bool
    #: The broker rate an estimate used (None when the person typed the commission).
    rate: Decimal | None
    own_rate: bool


async def _commission(conn: AsyncConnection[Any], typed: float | None, qty: int, price: float) -> Charged:
    """What the bank charged, as typed; else the cost model's estimate (commission + BSMV) at the person's own
    broker rate when they entered one, else the built-in default; `estimated` and the rate say so."""
    if typed is not None:
        return Charged(cents(typed), False, None, False)
    in_force = await fee.in_force(conn)
    broker, bsmv = commission_of(Decimal(str(price)) * qty, in_force.costs)
    return Charged(broker + bsmv, True, in_force.rate, in_force.own)


MARK_SQL: Final = """
UPDATE trading.order_tickets SET entry_status = %s, filled_qty = %s, avg_price = %s, filled_at = %s, note = %s,
  marked_at = %s, commission_try = %s, commission_estimated = %s, late = %s, commission_rate = %s,
  commission_rate_own = %s WHERE ticket_no = %s
"""


async def mark_ticket(
    conn: AsyncConnection[Any], ticket_no: str, m: TicketMarkInput, actor: Actor, *, now: datetime
) -> Outcome:
    """markTicket(): girildi / dolmadı / iptal; an entered ticket is the person's real fill: a buy opens the position
    and takes `qty x price + commission` out of cash, a sell closes it and adds `qty x price - commission`."""
    async with conn.transaction():
        rows = await ticket_rows(conn, ticket_no=ticket_no, lock=True)
        if not rows:
            raise ApiError(404, "not_found", NOT_FOUND_TICKET)
        ticket = ticket_from_row(rows[0], now)
        if ticket["entry"]["status"] not in MARKABLE:
            raise ApiError(409, "already_marked", "Bunu zaten işaretledin.")
        entered = m if isinstance(m, TicketMarkEntered) else None
        commission, estimated, late = Decimal(0), False, False
        charged = Charged(Decimal(0), False, None, False)
        if entered is not None:
            _check_entered(ticket, entered)
            charged = await _commission(conn, entered.commission_try, entered.filled_qty, entered.avg_price)
            commission, estimated = charged.amount, charged.estimated
            late = entered.filled_at > parse_iso(ticket["valid_until"])
            await ledger.lock(conn)  # one writer of the book at a time
        note = (m.note or "").strip() or None
        entry = {
            "status": m.mark,
            "filled_qty": entered.filled_qty if entered else None,
            "avg_price": entered.avg_price if entered else None,
            "filled_at": iso_ms(entered.filled_at) if entered else None,
            "note": note,
            "marked_at": iso_ms(now),
            "commission_try": float(commission),
            "commission_estimated": estimated,
            "late": late,
            "commission_rate": None if charged.rate is None else float(charged.rate),
            "commission_rate_own": charged.own_rate,
            "corrected": False,
        }
        filled_at = entered.filled_at if entered else None
        async with conn.cursor() as cur:
            await cur.execute(
                MARK_SQL,
                (m.mark, entry["filled_qty"], entry["avg_price"], filled_at, note, now, commission, estimated, late,
                 entry["commission_rate"], charged.own_rate, ticket_no),
            )  # fmt: skip
        payload: dict[str, Any] = (
            {
                "qty": entered.filled_qty,
                "price": entered.avg_price,
                "commission_try": float(commission),
                "commission_estimated": estimated,
                "commission_rate": entry["commission_rate"],
                "late": late,
            }
            if entered
            else {}
        )
        if ticket.get("side") == "sell":
            payload = {**payload, "side": "sell"}
        draft = run_audit(actor.audit_actor, f"ticket.{m.mark}", "order_ticket", ticket_no, payload, ticket["run_id"])
        await append(conn, [draft], now=now)
        if entered is not None:
            await open_position(
                conn,
                proposal_id=ticket["proposal_id"],
                run_id=ticket["run_id"],
                qty=entered.filled_qty,
                avg_cost=entered.avg_price,
                opened_at=entered.filled_at,
                commission=commission,
                commission_estimated=estimated,
                ticket_no=ticket_no,
                now=now,
            )
        updated = {**ticket, "entry": entry}
    return Outcome(updated, [("ticket", updated)])


CORRECT_SQL: Final = """
UPDATE trading.order_tickets SET filled_qty = %s, avg_price = %s, commission_try = %s, commission_estimated = %s,
  commission_rate = %s, commission_rate_own = %s, corrected_at = %s WHERE ticket_no = %s
"""


async def correct_fill(
    conn: AsyncConnection[Any], ticket_no: str, c: TicketCorrectInput, actor: Actor, *, now: datetime
) -> Outcome:
    """POST /tickets/{ticket_no}/correct: the fill recorded on an entered ticket was typed wrong. The ticket's own
    rules still hold; cash and the position are recomputed from a correction row, audited `ticket.corrected` with the
    old and the new adet, price and commission. 404 not_found, 409 not_entered / not_recorded / sold_since,
    422 over_qty / over_limit / under_limit / sell_qty / no_change / over_cash."""
    async with conn.transaction():
        rows = await ticket_rows(conn, ticket_no=ticket_no, lock=True)
        if not rows:
            raise ApiError(404, "not_found", NOT_FOUND_TICKET)
        ticket = ticket_from_row(rows[0], now)
        if ticket["entry"]["status"] != "entered":
            raise ApiError(409, "not_entered", "Önce işlemi girdim diye işaretlemelisin.")
        _check_fill(ticket, c.filled_qty, c.avg_price)
        await ledger.lock(conn)
        charged = await _commission(conn, c.commission_try, c.filled_qty, c.avg_price)
        change = await fill_fix.apply(
            conn, ticket=ticket, qty=c.filled_qty, price=Decimal(str(c.avg_price)), commission=charged.amount,
            estimated=charged.estimated, now=now,
        )  # fmt: skip
        rate = None if charged.rate is None else float(charged.rate)
        async with conn.cursor() as cur:
            await cur.execute(
                CORRECT_SQL,
                (c.filled_qty, c.avg_price, charged.amount, charged.estimated, rate, charged.own_rate, now, ticket_no),
            )  # fmt: skip
        payload: dict[str, Any] = {
            "side": ticket.get("side", "buy"),
            "old": {
                "qty": change.old_qty, "price": float(change.old_price), "commission_try": float(change.old_commission)
            },
            "new": {"qty": c.filled_qty, "price": c.avg_price, "commission_try": float(charged.amount)},
            "commission_estimated": charged.estimated,
        }  # fmt: skip
        draft = run_audit(actor.audit_actor, "ticket.corrected", "order_ticket", ticket_no, payload, ticket["run_id"])
        await append(conn, [draft], now=now)
        entry = {
            **ticket["entry"],
            "filled_qty": c.filled_qty,
            "avg_price": c.avg_price,
            "commission_try": float(charged.amount),
            "commission_estimated": charged.estimated,
            "commission_rate": rate,
            "commission_rate_own": charged.own_rate,
            "corrected": True,
        }
        updated = {**ticket, "entry": entry}
    return Outcome(updated, [("ticket", updated)])
