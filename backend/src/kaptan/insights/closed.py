"""Closed trades: every sale the ledger holds, with what it made, how long the shares were held, the win rate.

Derived from the recorded fills only (`kaptan.insights.replay`). Gain and percentage are after commissions.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.domain.schemas._base import iso_ms
from kaptan.insights.replay import Trade, replay_book

FEW: Final = 5
HAND_NOTE: Final = "Elle eklediğin hisselerde alış günü bilinmediği için elde tutma süresini yazmadım."
FEW_NOTE: Final = "Henüz çok az satış var; kazanma oranı için erken."


def _pct(gain: Decimal, cost: Decimal) -> float | None:
    return None if cost <= 0 else round(float(gain / cost * 100), 2)


def trade_view(t: Trade) -> dict[str, Any]:
    return {
        "id": t.id, "ticker": t.ticker, "company": t.company, "sold_at": iso_ms(t.sold_at), "qty": t.qty,
        "cost_try": round(float(t.cost), 2), "proceeds_try": round(float(t.proceeds), 2),
        "gain_try": round(float(t.gain), 2), "gain_pct": _pct(t.gain, t.cost), "days_held": t.days_held,
    }  # fmt: skip


def summarize(trades: list[Trade]) -> dict[str, Any]:
    wins = sum(1 for t in trades if t.gain > 0)
    losses = sum(1 for t in trades if t.gain < 0)
    days = [t.days_held for t in trades if t.days_held is not None]
    notes = []
    if any(t.days_held is None for t in trades):
        notes.append(HAND_NOTE)
    if 0 < len(trades) < FEW:
        notes.append(FEW_NOTE)
    return {
        "trades": [trade_view(t) for t in sorted(trades, key=lambda t: t.sold_at, reverse=True)],
        "wins": wins, "losses": losses,
        "win_rate_pct": round(wins / len(trades) * 100, 1) if trades else None,
        "total_gain_try": round(float(sum((t.gain for t in trades), Decimal(0))), 2),
        "avg_days_held": round(sum(days) / len(days), 1) if days else None,
        "note_tr": " ".join(notes) or None,
    }  # fmt: skip


async def closed_trades(conn: AsyncConnection[Any]) -> dict[str, Any]:
    trades, _ = await replay_book(conn)
    return summarize(trades)
