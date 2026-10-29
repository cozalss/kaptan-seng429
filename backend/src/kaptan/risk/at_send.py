"""R16 before the order exists (06 R16, FR-28): the approval decision re-runs R01–R04, R09, R12, R13
with the desk as it is *now* (marked equity, kill switch, daily halt, restrictions and their age, the
latest price) and the active limit version, inside the decision's transaction.

Used by approvals/service.py for cards of real runs (`run_set = 'live'`); demo cards keep M1's path.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.market.segment import limit_pct_of
from kaptan.market.ticks import price_limits
from kaptan.prices.calendar import istanbul_date, prev_session
from kaptan.prices.reads import close_on
from kaptan.risk.active_limits import active_limits
from kaptan.risk.desk import live_desk
from kaptan.risk.gate import AT_SEND_RULES, CHECKS, GateContext, GateOrder, RiskResult, evaluate_at_send

ISSUER_SQL: Final = "SELECT in_universe, price, adv20_try FROM core.issuers WHERE ticker = %s"
RESTRICTIONS_SQL: Final = "SELECT kind FROM core.restricted_securities WHERE ticker = %s ORDER BY added_at, id"
STATE_SQL: Final = """
SELECT rs.kill_switch, rs.halted_today, rs.regime,
       COALESCE((SELECT armed FROM trading.live_arm WHERE id = 1), false) AS live_armed
  FROM trading.risk_state rs WHERE rs.id = 1
"""


@dataclass(frozen=True, slots=True)
class AtSendCheck:
    result: RiskResult  # R16 (pass / reject)
    failed_rule: str | None  # the at-send rule that did not pass; "R16" for an expired approval
    limits_version: int | None

    @property
    def ok(self) -> bool:
        return self.result.outcome == "pass"


async def _one(conn: AsyncConnection[Any], sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def _upper_limit(conn: AsyncConnection[Any], ticker: str, now: datetime) -> Decimal | None:
    """R09's tavan: the previous close + the band of the stock's market (06 §2 [V]; unknown → ±10 %)."""
    prev = await close_on(conn, ticker, prev_session(istanbul_date(now)))
    if prev is None:
        return None
    return price_limits(Decimal(str(prev)), await limit_pct_of(conn, ticker, now))[1]


async def check_at_send(
    conn: AsyncConnection[Any], card: dict[str, Any], now: datetime, *, capital: float
) -> AtSendCheck:
    """R16 for an approval card (ApprovalCard document) at `now`."""
    ticker = str(card["ticker"])
    active = await active_limits(conn)
    desk = await live_desk(conn, ticker, now, published_at=now, available_at=now, capital=capital)
    issuer = await _one(conn, ISSUER_SQL, (ticker,))
    state = await _one(conn, STATE_SQL) or {"kill_switch": "off", "halted_today": False, "live_armed": False}
    async with conn.cursor() as cur:
        await cur.execute(RESTRICTIONS_SQL, (ticker,))
        kinds = tuple(str(r["kind"]) for r in await cur.fetchall())
    last = desk.last_price or (Decimal(str(issuer["price"])) if issuer else Decimal(str(card["limit_price"])))
    order = GateOrder(
        ticker=ticker,
        event_type=str(card["event_type"]),
        qty=int(card["qty"]),
        limit_price=Decimal(str(card["limit_price"])),
        stop_pct=Decimal(0),
        side="sell" if card.get("side") == "sell" else "buy",  # an exit is gated as a sell (R04 etc. are buy-only)
    )
    expires = card.get("expires_at")
    ctx = GateContext(
        equity_try=desk.equity_try,
        last_price=last,
        adv20_try=Decimal(str(issuer["adv20_try"])) if issuer else Decimal(0),
        cash_free_try=desk.cash_free_try,
        upper_limit=await _upper_limit(conn, ticker, now),
        kill_switch_on=state["kill_switch"] == "on",
        drawdown_pct=desk.drawdown_pct,
        daily_pnl_pct=desk.daily_pnl_pct,
        halted_today=bool(state["halted_today"]),
        in_universe=bool(issuer["in_universe"]) if issuer else False,
        restrictions=kinds,
        restrictions_age_h=desk.restrictions_age_h,
        team_blocklisted="team_insider" in kinds,
        price_age_s=desk.price_age_s if card.get("entry") == "intraday_limit" else 0.0,
        holds_ticker=desk.holds_ticker,
        live_armed=bool(state["live_armed"]),
        approval_expired=expires is not None and now > datetime.fromisoformat(str(expires)),
    )
    result = evaluate_at_send(order, ctx, active.limits)
    failed = None
    if result.outcome != "pass":
        failed = (
            "R16"
            if ctx.approval_expired
            else next(
                (c for c in AT_SEND_RULES if CHECKS[c](order, ctx, active.limits, "at_send").outcome != "pass"), "R16"
            )
        )
    return AtSendCheck(result, failed, active.version)
