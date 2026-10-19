"""The end-of-day exit job (FR-29, 06 §6): `await run_exits(conn, day)` after the 18:30 EOD prices.

Per open position (paper and personal books of one source proposal are one position here):
X6 raises the stop to break-even; X2 (close ≤ stop), X3 (N1: a new tedbir / restriction or an
avoid-route disclosure), X4 (E1: sale of bought-back shares; E2: insiders sold ≥ 50 % of the
original purchase) and X1 (time) raise one SELL proposal through the normal approval flow
(trading.agent_runs + trade_proposals + approvals, audit `proposal.created`). Only data known at
18:30 of `day` is read (bars of sessions ≤ day, disclosures/restrictions available before then).
Idempotent per position, rule and day; a position with an exit still pending (or approved and not
filled) gets no new one; an exit whose approval expired is raised again at the escalate level
(R15); a rejected exit is not raised again for the same rule.
The caller commits and publishes SSE `approval.requested` with `ExitReport.cards`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.audit.writer import append
from kaptan.brokers import config as broker_config
from kaptan.brokers.costs import limit_down
from kaptan.brokers.ledger import run_audit
from kaptan.portfolio import exit_docs
from kaptan.portfolio.exit_facts import PositionRow, gather_facts
from kaptan.portfolio.exit_rules import ExitRule, evaluate
from kaptan.prices.calendar import close_known_at
from kaptan.rules.calendar import approval_expiry

ACTOR: Final = "system:exit_engine"

POSITIONS_SQL: Final = """
SELECT p.book, p.ticker, p.company_name, p.qty, p.avg_cost, p.last_price, p.opened_at, p.source_proposal,
       p.run_id, p.event_type, p.strategy_version, p.stop_price, p.stop_pct,
       tp.doc AS source_doc, r.disclosure_index, r.explain AS source_explain, a.card AS source_card
FROM trading.positions p
JOIN trading.trade_proposals tp ON tp.proposal_id = p.source_proposal
JOIN trading.agent_runs r ON r.run_id = p.run_id
LEFT JOIN trading.approvals a ON a.proposal_id = p.source_proposal
WHERE p.opened_at < %s
ORDER BY p.source_proposal, (p.book <> 'paper')
"""
LAST_EXIT_SQL: Final = """
SELECT s.proposal_id, s.rule, a.status, a.expires_at,
       (SELECT o.status FROM trading.orders o WHERE o.proposal_id = s.proposal_id LIMIT 1) AS order_status
FROM trading.exit_signals s JOIN trading.approvals a ON a.proposal_id = s.proposal_id
WHERE s.source_proposal = %s ORDER BY s.created_at DESC, s.proposal_id DESC
"""
RESTRICTED_SQL: Final = "SELECT 1 FROM core.restricted_securities WHERE ticker = %s AND kind <> 'team_insider' LIMIT 1"
RUN_INSERT: Final = """
INSERT INTO trading.agent_runs (run_id, disclosure_index, ticker, company_name, event_type, kind, status, outcome,
  mode, run_set, visible, strategy_version, is_fixture, started_at, finished_at, explain)
VALUES (%s, %s, %s, %s, %s, 'propose', 'completed', 'PROPOSE', 'paper', 'live', true, %s, false, %s, %s, %s)
ON CONFLICT (run_id) DO NOTHING
"""
PROPOSAL_INSERT: Final = """
INSERT INTO trading.trade_proposals (proposal_id, run_id, ticker, doc, created_at) VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (proposal_id) DO NOTHING
"""
APPROVAL_INSERT: Final = """
INSERT INTO trading.approvals (proposal_id, run_id, card, status, created_at, expires_at)
VALUES (%s, %s, %s, 'pending', %s, %s) ON CONFLICT (proposal_id) DO NOTHING
"""
SIGNAL_INSERT: Final = """
INSERT INTO trading.exit_signals (proposal_id, source_proposal, ticker, rule, evaluated_on, detail, created_at)
VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING proposal_id
"""
STOP_SQL: Final = """
UPDATE trading.positions SET stop_price = %s, stop_moved_at = %s
WHERE source_proposal = %s AND (stop_price IS NULL OR stop_price < %s)
"""


@dataclass(frozen=True, slots=True)
class ExitReport:
    cards: list[dict[str, Any]] = field(default_factory=list)
    stops_moved: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def _groups(rows: list[dict[str, Any]]) -> list[list[PositionRow]]:
    out: dict[str, list[PositionRow]] = {}
    for r in rows:
        out.setdefault(r["source_proposal"], []).append(r)
    return list(out.values())


async def _blocked(conn: AsyncConnection[Any], source: str, now: datetime) -> tuple[bool, set[str], bool]:
    """(an exit is still in flight, rules a human rejected, the last exit expired)."""
    async with conn.cursor() as cur:
        await cur.execute(LAST_EXIT_SQL, (source,))
        rows = await cur.fetchall()
    rejected = {r["rule"] for r in rows if r["status"] == "rejected"}
    if not rows:
        return False, rejected, False
    last = rows[0]
    pending = last["status"] == "pending" and last["expires_at"] > now
    in_flight = last["status"] == "approved" and last["order_status"] in ("pending_open", "accepted")
    expired = last["status"] == "expired" or (last["status"] == "pending" and last["expires_at"] <= now)
    return pending or in_flight, rejected, expired


async def _raise_exit(
    conn: AsyncConnection[Any], pos: PositionRow, rule: ExitRule, detail: str, day: date, now: datetime, *,
    held: int, last_close: float, escalate: bool,
) -> dict[str, Any] | None:  # fmt: skip
    costs = broker_config.current().trading.costs
    limit = float(limit_down(Decimal(str(last_close)), costs.price_limit_pct))
    async with conn.cursor() as cur:
        await cur.execute(RESTRICTED_SQL, (pos["ticker"],))
        restricted = await cur.fetchone() is not None
    reasons = ["RESTRICTED_SELL"] if restricted else []
    x = exit_docs.ExitInput(
        rule=rule,
        detail=detail,
        day=day,
        now=now,
        expires_at=approval_expiry(now),
        source_proposal=pos["source_proposal"],
        source_doc=pos["source_doc"] or {},
        source_card=pos["source_card"],
        source_explain=pos["source_explain"] or {},
        run={**pos, "disclosure_index": pos["disclosure_index"]},
        qty=int(pos["qty"]),
        ref_price=round(last_close, 2),
        limit_price=limit,
        stop_price=None if pos["stop_price"] is None else float(pos["stop_price"]),
        held_sessions=held,
        level="escalate" if (reasons or escalate) else "normal",
        escalation_reasons=reasons,
        est_cost_bps=float(2 * (costs.c_broker * (1 + costs.bsmv) + costs.fees_side) * 10_000),
    )
    run_id, proposal_id = exit_docs.ids(rule, pos["source_proposal"], day)
    async with conn.cursor() as cur:
        signal = (proposal_id, pos["source_proposal"], pos["ticker"], rule, day, Jsonb({"detail": detail}), now)
        proposal = exit_docs.proposal_doc(x, run_id, proposal_id)
        card = exit_docs.card_doc(x, proposal)
        explain = exit_docs.explain_doc(x, proposal, card)
        await cur.execute(
            RUN_INSERT,
            (run_id, pos["disclosure_index"], pos["ticker"], pos["company_name"], pos["event_type"],
             pos["strategy_version"], now, now, Jsonb(explain)),
        )  # fmt: skip
        await cur.execute(PROPOSAL_INSERT, (proposal_id, run_id, pos["ticker"], Jsonb(proposal), now))
        await cur.execute(APPROVAL_INSERT, (proposal_id, run_id, Jsonb(card), now, x.expires_at))
        await cur.execute(SIGNAL_INSERT, signal)
        if await cur.fetchone() is None:
            return None  # raised already (same position, rule, day)
    payload = {"ticker": pos["ticker"], "company": pos["company_name"], "side": "sell", "rule": rule}
    await append(conn, [run_audit(ACTOR, "proposal.created", "trade_proposal", proposal_id, payload, run_id)], now=now)
    return card


async def _move_stop(conn: AsyncConnection[Any], pos: PositionRow, new_stop: float, now: datetime) -> None:
    await conn.execute(STOP_SQL, (new_stop, now, pos["source_proposal"], new_stop))
    payload = {"ticker": pos["ticker"], "company": pos["company_name"], "stop": new_stop, "rule": "X6"}
    draft = run_audit(ACTOR, "position.stop_moved", "position", pos["source_proposal"], payload, pos["run_id"])
    await append(conn, [draft], now=now)


async def run_exits(conn: AsyncConnection[Any], day: date, *, now: datetime | None = None) -> ExitReport:
    """Evaluate X1–X6 for every open position after `day`'s close (caller's transaction)."""
    as_of = close_known_at(day)
    at = now or as_of
    async with conn.cursor() as cur:
        await cur.execute(POSITIONS_SQL, (as_of,))
        rows = [dict(r) for r in await cur.fetchall()]
    report = ExitReport()
    for group in _groups(rows):
        pos = group[0]  # the paper book's row when there is one
        facts, last_close = await gather_facts(conn, pos, day, as_of)
        decision = evaluate(facts)
        if decision.new_stop is not None:
            await _move_stop(conn, pos, decision.new_stop, at)
            report.stops_moved.append(pos["source_proposal"])
            pos = {**pos, "stop_price": decision.new_stop}
        if decision.rule is None or last_close is None:
            continue
        in_flight, rejected, expired = await _blocked(conn, pos["source_proposal"], at)
        if in_flight or decision.rule in rejected:
            report.skipped.append(pos["source_proposal"])
            continue
        card = await _raise_exit(
            conn, pos, decision.rule, decision.detail, day, at,
            held=facts.held_sessions, last_close=last_close, escalate=expired,
        )  # fmt: skip
        if card is not None:
            report.cards.append(card)
    return report
