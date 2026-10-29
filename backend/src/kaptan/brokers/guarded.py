"""GuardedBroker (FR-28, 04 §8.2, 09 §8): the last checks before any send, outside the agent graph.

- kill switch on → no buy (exits still go: X5, positions are managed by X1–X4);
- the daily −1 % halt → no buy;
- P8 cooldown after a stop → no buy in that symbol;
- hard cap: a buy's notional ≤ min(trading.yaml hard_cap_try, max_position_pct × equity);
- a LIVE inner adapter needs all three keys and a real broker (`LiveNotArmed`).
`route()` picks the adapter mode for a send: paper, unless live is asked for and every key is there;
a refused live request falls back to paper and the fallback is audited (`broker.live_fallback`).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.audit.writer import AuditDraft
from kaptan.brokers import live_arm
from kaptan.brokers.base import Broker, BrokerMode, LiveNotArmed, OrderAck, OrderIntent, OrderRefused
from kaptan.brokers.config import ExecConfig
from kaptan.brokers.ledger import run_audit
from kaptan.portfolio.pnl import last_live_point
from kaptan.risk.cooldown import COOLDOWN_TR, cooldown_active

#: The demo desk's equity (explain-builder.ts) when there is no P&L series.
DEMO_EQUITY_TRY: Final = Decimal(1_016_480)
#: Canonical P2 position cap when the limits table has no max_position_pct.
DEFAULT_POSITION_PCT: Final = Decimal("0.10")

RISK_SQL: Final = "SELECT kill_switch, halted_today FROM trading.risk_state WHERE id = 1"
LIMIT_SQL: Final = """
SELECT l.value FROM trading.limits l JOIN trading.limit_versions v ON v.version = l.version
WHERE v.status = 'active' AND l.key = 'max_position_pct' ORDER BY v.version DESC LIMIT 1
"""


async def hard_cap(conn: AsyncConnection[Any], cfg: ExecConfig) -> Decimal:
    """min(trading.yaml hard_cap_try, active max_position_pct × the desk's last equity)."""
    async with conn.cursor() as cur:
        await cur.execute(LIMIT_SQL)
        row = await cur.fetchone()
    pct = Decimal(str(row["value"])) if row else DEFAULT_POSITION_PCT
    last = await last_live_point(conn)
    fallback = DEMO_EQUITY_TRY if cfg.demo_mode else cfg.paper_capital_try
    equity = Decimal(str(last[0])) if last is not None else fallback
    cap = pct * equity
    return cap if cfg.trading.hard_cap_try is None else min(cap, cfg.trading.hard_cap_try)


class GuardedBroker:
    """Wraps any Broker; every check runs again at send, whatever the graph decided."""

    def __init__(self, inner: Broker, conn: AsyncConnection[Any], now: datetime, cfg: ExecConfig) -> None:
        self.inner = inner
        self.name = f"guarded:{inner.name}"
        self.mode = inner.mode
        self._conn = conn
        self._now = now
        self._cfg = cfg

    async def check(self, intent: OrderIntent) -> None:
        async with self._conn.cursor() as cur:
            await cur.execute(RISK_SQL)
            risk = await cur.fetchone()
        kill = risk is not None and risk["kill_switch"] == "on"
        if intent.side == "buy":
            if kill:
                raise OrderRefused("kill_switch", "Her şey durduruldu: emir gönderilmedi.")
            if risk is not None and risk["halted_today"]:
                raise OrderRefused("halted", "Günlük −%1 durdurması: bugün yeni emir verilemez.")
            if await cooldown_active(self._conn, intent.ticker, self._now):
                raise OrderRefused("cooldown", COOLDOWN_TR)
            cap = await hard_cap(self._conn, self._cfg)
            if intent.notional > cap:
                raise OrderRefused("hard_cap", "Emir tutarı emir başına sert tavanı aşıyor: gönderilmedi.")
        if self.mode == BrokerMode.LIVE:
            state = await live_arm.read_state(self._conn)
            missing = live_arm.missing_keys(self._cfg, state, self._now, kill=kill)
            if missing:
                raise LiveNotArmed(f"live mode blocked: {', '.join(missing)}")

    async def submit_order(self, intent: OrderIntent) -> OrderAck:
        await self.check(intent)
        return await self.inner.submit_order(intent)

    async def get_order(self, client_order_id: str) -> OrderAck | None:
        return await self.inner.get_order(client_order_id)

    async def cancel_order(self, client_order_id: str) -> None:
        await self.inner.cancel_order(client_order_id)

    async def cancel_all(self) -> int:
        return await self.inner.cancel_all()


async def route(
    conn: AsyncConnection[Any], cfg: ExecConfig, now: datetime, *, order_id: str, run_id: str | None
) -> tuple[BrokerMode, AuditDraft | None]:
    """The mode a send goes out in. Paper unless live is asked for (K1); a live request without every
    key or without a real broker falls back to paper, with an audit draft saying what was missing."""
    if not cfg.live_requested:
        return BrokerMode.PAPER, None
    state = await live_arm.read_state(conn)
    missing = live_arm.missing_keys(cfg, state, now, kill=await live_arm.kill_on(conn))
    if not missing:  # pragma: no cover - unreachable while REAL_BROKERS is empty
        return BrokerMode.LIVE, None
    payload = {"order_id": order_id, "missing": missing, "mode": "paper"}
    return BrokerMode.PAPER, run_audit(
        "system:guarded_broker", "broker.live_fallback", "order", order_id, payload, run_id
    )
