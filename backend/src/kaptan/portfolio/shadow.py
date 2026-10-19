"""Shadow returns of rejected and expired signals (FR-43, 08 §4 "Gölge izleme").

    await run_shadow_returns(conn, day)   # weekdays after the EOD prices (and event_returns)

1. Collect every signal that did not trade, with its reason code, into trading.shadow_signals:
   - risk gate rejection: the first `reject` risk check (`R06`, `R08`, …), source risk_gate;
   - Uyum veto (`COMPLIANCE_VETO`) and Şüpheci veto (`SKEPTIC_VETO`, only when the rule itself was met);
   - Risk Sorumlusu rejected the card (`RO_REJECTED`) or nobody signed it in time (`APPROVAL_EXPIRED`).
2. For each, the hypothetical trade enters at the first opening auction after the decision and the
   5- and 20-session adjusted returns (open → close, the event study's convention) and their excess
   over XU100 are written once that many sessions have closed by `day`. Exits (SELL) are not signals.
Idempotent: a signal is collected once (`signal_id`), a return is written once.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.brokers.fills import auction_day
from kaptan.prices.calendar import add_sessions, close_known_at
from kaptan.prices.reads import forward_return

BENCHMARK: Final = "XU100"
HORIZONS: Final = (5, 20)
EVENTS: Final = ("E1", "E2", "E3", "E4")

APPROVALS_SQL: Final = """
SELECT a.proposal_id, a.run_id, a.status, a.decided_at, a.expires_at, r.ticker, r.event_type, r.strategy_version
FROM trading.approvals a JOIN trading.agent_runs r ON r.run_id = a.run_id
WHERE r.event_type = ANY(%(ev)s) AND coalesce(a.card->>'side', 'buy') = 'buy'
  AND ((a.status = 'rejected' AND a.decided_at < %(asof)s)
       OR (a.status IN ('expired', 'pending') AND a.expires_at <= %(asof)s))
"""
RUNS_SQL: Final = """
SELECT r.run_id, r.ticker, r.event_type, r.strategy_version, coalesce(r.finished_at, r.started_at) AS decided_at,
       r.explain->'risk_checks' AS checks, r.explain->'compliance' AS compliance,
       r.explain->'rule_decision' AS rule_decision
FROM trading.agent_runs r
WHERE r.event_type = ANY(%(ev)s) AND coalesce(r.finished_at, r.started_at) < %(asof)s
  AND NOT EXISTS (SELECT 1 FROM trading.approvals a WHERE a.run_id = r.run_id)  -- a card = the gate passed
"""
INSERT_SQL: Final = """
INSERT INTO trading.shadow_signals (signal_id, run_id, proposal_id, ticker, event_type, strategy_version,
  reason_code, reason_source, decided_at, entry_day)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (signal_id) DO NOTHING
"""
OPEN_SQL: Final = """
SELECT signal_id, ticker, entry_day, return_5d FROM trading.shadow_signals
WHERE return_20d IS NULL AND entry_day <= %s ORDER BY entry_day, signal_id
"""
UPDATE_SQL: Final = """
UPDATE trading.shadow_signals SET return_5d = coalesce(return_5d, %s), excess_5d = coalesce(excess_5d, %s),
  return_20d = %s, excess_20d = %s, computed_at = %s WHERE signal_id = %s
"""


@dataclass(frozen=True, slots=True)
class ShadowReport:
    collected: int = 0
    updated: list[str] = field(default_factory=list)


def run_reason(checks: Any, compliance: Any, rule_decision: Any) -> tuple[str, str] | None:
    """(reason_code, source) of a run that produced a signal but no card; None = not a rejected signal."""
    for c in checks or []:
        if c.get("outcome") == "reject":
            return str(c.get("rule_code") or "RISK_GATE"), "risk_gate"
    if (compliance or {}).get("decision") == "veto":
        return "COMPLIANCE_VETO", "compliance"
    codes = [str(c) for c in (rule_decision or {}).get("reason_codes") or []]
    if "SKEPTIC_VETO" in codes and not any(c.endswith("_RULE_NOT_MET") for c in codes):
        return "SKEPTIC_VETO", "skeptic"
    return None


async def collect(conn: AsyncConnection[Any], as_of: datetime) -> int:
    rows: list[tuple[Any, ...]] = []
    async with conn.cursor() as cur:
        await cur.execute(APPROVALS_SQL, {"ev": list(EVENTS), "asof": as_of})
        for a in await cur.fetchall():
            rejected = a["status"] == "rejected"
            at: datetime = a["decided_at"] if rejected else a["expires_at"]
            code, source = ("RO_REJECTED", "risk_officer") if rejected else ("APPROVAL_EXPIRED", "expired")
            rows.append(
                (f"sh-{a['proposal_id']}", a["run_id"], a["proposal_id"], a["ticker"], a["event_type"],
                 a["strategy_version"], code, source, at, auction_day(at))
            )  # fmt: skip
        await cur.execute(RUNS_SQL, {"ev": list(EVENTS), "asof": as_of})
        for r in await cur.fetchall():
            reason = run_reason(r["checks"], r["compliance"], r["rule_decision"])
            if reason is None:
                continue
            rows.append(
                (f"sh-{r['run_id']}", r["run_id"], None, r["ticker"], r["event_type"], r["strategy_version"],
                 reason[0], reason[1], r["decided_at"], auction_day(r["decided_at"]))
            )  # fmt: skip
        if rows:
            await cur.executemany(INSERT_SQL, rows)
    return len(rows)


def _excess(ret: Decimal | None, bench: Decimal | None) -> float | None:
    return None if ret is None or bench is None else float(ret - bench)


async def _returns(conn: AsyncConnection[Any], ticker: str, entry: date, h: int) -> tuple[float | None, float | None]:
    ret = await forward_return(conn, ticker, entry, h, entry="open")
    bench = await forward_return(conn, BENCHMARK, entry, h, entry="open")
    return (None if ret is None else float(ret)), _excess(ret, bench)


async def run_shadow_returns(conn: AsyncConnection[Any], day: date, *, now: datetime | None = None) -> ShadowReport:
    """Collect new rejected/expired signals and write the shadow returns that matured by `day`'s close."""
    as_of = close_known_at(day)
    at = now or as_of
    collected = await collect(conn, as_of)
    async with conn.cursor() as cur:
        await cur.execute(OPEN_SQL, (day,))
        pending = await cur.fetchall()
    updated: list[str] = []
    for s in pending:
        entry: date = s["entry_day"]
        r5 = x5 = r20 = x20 = None
        if s["return_5d"] is None and add_sessions(entry, HORIZONS[0] - 1) <= day:
            r5, x5 = await _returns(conn, s["ticker"], entry, HORIZONS[0])
        if add_sessions(entry, HORIZONS[1] - 1) <= day:
            r20, x20 = await _returns(conn, s["ticker"], entry, HORIZONS[1])
        if r5 is None and r20 is None:
            continue
        await conn.execute(UPDATE_SQL, (r5, x5, r20, x20, at, s["signal_id"]))
        updated.append(s["signal_id"])
    return ShadowReport(collected=collected, updated=updated)
