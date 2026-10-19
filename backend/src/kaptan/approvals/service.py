"""Write side: decide a proposal, add a note, mark an order ticket (mock-api.ts / enterprise.ts parity).

Each function runs its checks and writes inside one transaction (state + audit entry) and returns
the response body plus the desk events to publish after commit (`Outcome`). Status codes, `code`s
and the Turkish `detail` texts are the mock's.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.approvals.execute import Event, FillJob, execute_approved, run_audit
from kaptan.approvals.reads import RiskFlags, card_from_row, card_rows, risk_flags, ticket_from_row, ticket_rows
from kaptan.approvals.ticket_doc import parse_iso
from kaptan.audit.writer import append
from kaptan.domain.schemas import ApprovalDecision, iso_ms
from kaptan.domain.schemas.trading import TicketMarkEntered, TicketMarkInput
from kaptan.portfolio.positions import open_position
from kaptan.risk.at_send import check_at_send
from kaptan.settings import get_settings

NOT_FOUND_PROPOSAL: Final = "Öneri bulunamadı."
NOT_FOUND_TICKET: Final = "Fiş bulunamadı."
MARKABLE: Final = frozenset({"awaiting", "expired"})


@dataclass(frozen=True, slots=True)
class Outcome:
    body: dict[str, Any]
    events: list[Event] = field(default_factory=list)
    fill: FillJob | None = None


async def _card_or_404(
    conn: AsyncConnection[Any], proposal_id: str, *, now: datetime, wall: datetime, lock: bool
) -> tuple[dict[str, Any], RiskFlags]:
    flags = await risk_flags(conn, lock=lock)
    rows = await card_rows(conn, now=now, wall=wall, proposal_id=proposal_id, lock=lock)
    if not rows:
        raise ApiError(404, "not_found", NOT_FOUND_PROPOSAL)
    return card_from_row(rows[0], kill_on=flags.kill_on, now=now), flags


def _check_decision(card: dict[str, Any], d: ApprovalDecision, *, kill_on: bool, halted: bool) -> None:
    # The stops block new entries only: a SELL exit keeps managing the position (06 X5).
    is_buy = card.get("side", "buy") == "buy"
    if kill_on and is_buy:
        raise ApiError(409, "kill_switch", "Her şey durduruldu: yeni emir onaylanamaz.")
    if card["status"] != "pending":
        raise ApiError(409, "conflict", "Bu öneri zaten karara bağlandı ya da süresi doldu.")
    if d.approved_notional_try is not None and d.approved_notional_try > card["final_notional_try"]:
        raise ApiError(422, "grow_not_allowed", "Tutar yalnızca küçültülebilir; büyütme yok.")
    if d.decision == "approve" and halted and is_buy:
        raise ApiError(409, "halted", "Günlük −%1 durdurması: bugün yeni emir verilemez.")


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
    conn: AsyncConnection[Any], proposal_id: str, d: ApprovalDecision, actor: Actor, *, now: datetime, wall: datetime
) -> Outcome:
    """decideApproval(): approve (optionally smaller) or reject; an approval executes right away.

    A real run's approval first passes R16 at send time (`_at_send_block`); a failure is audited and
    committed, the card stays pending and the caller gets 409 (kill_switch / halted / conflict)."""
    blocked: ApiError | None = None
    async with conn.transaction():
        card, flags = await _card_or_404(conn, proposal_id, now=now, wall=wall, lock=True)
        _check_decision(card, d, kill_on=flags.kill_on, halted=flags.halted)
        if d.decision == "approve":
            blocked = await _at_send_block(conn, card, actor, now)
        if blocked is None:
            outcome = await _record_decision(conn, proposal_id, card, d, actor, now)
    if blocked is not None:
        raise blocked
    return outcome


LIVE_RUN_SQL: Final = "SELECT run_set FROM trading.agent_runs WHERE run_id = %s"
AT_SEND_CODES: Final = {"R01": "kill_switch", "R02": "halted"}


async def _at_send_block(
    conn: AsyncConnection[Any], card: dict[str, Any], actor: Actor, now: datetime
) -> ApiError | None:
    """R16 with the desk as it is now, for cards of real runs only (demo cards: M1's path, unchanged)."""
    async with conn.cursor() as cur:
        await cur.execute(LIVE_RUN_SQL, (card["run_id"],))
        run = await cur.fetchone()
    if run is None or run["run_set"] != "live":
        return None
    check = await check_at_send(conn, card, now, capital=get_settings().paper_capital_try)
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
    return ApiError(409, AT_SEND_CODES.get(check.failed_rule or "", "conflict"), check.result.detail_tr)


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
        "decided_role": actor.role,
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
    fill = None
    if approve:
        more, fill = await execute_approved(conn, updated, now)
        events += more
    return Outcome(updated, events, fill)


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
    conn: AsyncConnection[Any], proposal_id: str, body: str, actor: Actor, *, now: datetime, wall: datetime
) -> dict[str, Any]:
    """addNote(): id `not-<n>`, audit `note.added` {ticker, company, role}."""
    async with conn.transaction():
        card, _ = await _card_or_404(conn, proposal_id, now=now, wall=wall, lock=False)
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


def _check_entered(ticket: dict[str, Any], m: TicketMarkEntered) -> None:
    if m.filled_qty > ticket["qty"]:
        raise ApiError(422, "over_qty", "Gerçekleşen adet fişteki adetten büyük olamaz.")
    if m.avg_price > ticket["limit_price"]:
        raise ApiError(422, "over_limit", "Limit emirde ortalama fiyat limit fiyatı aşamaz.")
    if m.filled_at > parse_iso(ticket["valid_until"]):
        raise ApiError(422, "after_ttl", "Fişin geçerlilik süresinden sonra girilen emir sayılmaz (R16).")


MARK_SQL: Final = """
UPDATE trading.order_tickets SET entry_status = %s, filled_qty = %s, avg_price = %s, filled_at = %s, note = %s,
  marked_at = %s WHERE ticket_no = %s
"""


async def mark_ticket(
    conn: AsyncConnection[Any], ticket_no: str, m: TicketMarkInput, actor: Actor, *, now: datetime
) -> Outcome:
    """markTicket(): girildi / dolmadı / iptal; an entered ticket becomes a `personal` position."""
    async with conn.transaction():
        rows = await ticket_rows(conn, ticket_no=ticket_no, lock=True)
        if not rows:
            raise ApiError(404, "not_found", NOT_FOUND_TICKET)
        ticket = ticket_from_row(rows[0], now)
        if ticket["entry"]["status"] not in MARKABLE:
            raise ApiError(409, "already_marked", "Bu fiş zaten işaretlendi.")
        entered = m if isinstance(m, TicketMarkEntered) else None
        if entered is not None:
            _check_entered(ticket, entered)
        note = (m.note or "").strip() or None
        entry = {
            "status": m.mark,
            "filled_qty": entered.filled_qty if entered else None,
            "avg_price": entered.avg_price if entered else None,
            "filled_at": iso_ms(entered.filled_at) if entered else None,
            "note": note,
            "marked_at": iso_ms(now),
        }
        filled_at = entered.filled_at if entered else None
        async with conn.cursor() as cur:
            await cur.execute(
                MARK_SQL, (m.mark, entry["filled_qty"], entry["avg_price"], filled_at, note, now, ticket_no)
            )
        payload = {"qty": entered.filled_qty, "price": entered.avg_price} if entered else {}
        draft = run_audit(actor.audit_actor, f"ticket.{m.mark}", "order_ticket", ticket_no, payload, ticket["run_id"])
        await append(conn, [draft], now=now)
        if entered is not None:
            await open_position(
                conn,
                book="personal",
                proposal_id=ticket["proposal_id"],
                run_id=ticket["run_id"],
                qty=entered.filled_qty,
                avg_cost=entered.avg_price,
                opened_at=entered.filled_at,
            )
        updated = {**ticket, "entry": entry}
    return Outcome(updated, [("ticket", updated)])
