"""`GET /me/overview` (single-user dashboard): the existing services read once and folded into MeOverview.

- equity_now: `/risk/status` equity (the marked book);
- capital_start: PAPER_CAPITAL_TRY; pnl_abs / pnl_pct against it;
- equity_series: the live strategy's daily closes (`/portfolio/pnl`, strategy kaptan:v1.1-fwd);
- allocations: the paper book's open positions at their last price (`/portfolio/positions`), weight of equity;
- cash: equity_now − the allocations (never below zero);
- open_suggestions: the pending approval cards (`/approvals`): buy → "al", sell → "sat"; `confidence` is the
  card's skeptic size multiplier (1, 0.75, 0.5, 0.25). "tut" (hold) is in the contract for the panel; no
  card proposes it, so the backend never sends it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from psycopg import AsyncConnection

from kaptan.api.errors import ApiError
from kaptan.approvals.reads import list_cards
from kaptan.audit.writer import AuditDraft, append
from kaptan.portfolio.pnl import LIVE_STRATEGY, list_pnl
from kaptan.portfolio.positions import list_positions
from kaptan.risk.status import risk_status


def _allocations(positions: list[dict[str, Any]], equity: float) -> list[dict[str, Any]]:
    out = []
    for p in positions:
        amount = round(float(p["qty"]) * float(p["last_price"]), 2)
        out.append(
            {
                "symbol": p["ticker"],
                "name": p["company_name"],
                "amount": amount,
                "weight": round(amount / equity, 4) if equity > 0 else 0.0,
                "pnl_pct": round(float(p["last_price"]) / float(p["avg_cost"]) - 1, 4),
            }
        )
    return sorted(out, key=lambda a: -a["amount"])


def _suggestions(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": c["proposal_id"],
            "symbol": c["ticker"],
            "action": "sat" if c["side"] == "sell" else "al",
            "reason_short": c["headline_tr"],
            "confidence": max(0.0, min(1.0, float(c["size_multiplier"]))),
            "expires_at": c["expires_at"],
        }
        for c in cards
        if c["status"] == "pending" and not str(c["run_id"]).startswith("run-hist")
    ]


async def me_overview(
    conn: AsyncConnection[Any],
    *,
    now: datetime,
    prices_live: bool,
    capital: float,
) -> dict[str, Any]:
    status = await risk_status(conn, now, capital=capital)
    equity = float(status["equity"])
    paper = [p for p in await list_positions(conn, now, live=prices_live) if p["book"] == "paper"]
    allocations = _allocations(paper, equity)
    series = [p for p in await list_pnl(conn, None, None) if p["strategy"] == LIVE_STRATEGY]
    pnl_abs = round(equity - capital, 2)
    return {
        "capital_start": capital,
        "equity_now": equity,
        "cash": max(0.0, round(equity - sum(a["amount"] for a in allocations), 2)),
        "pnl_abs": pnl_abs,
        "pnl_pct": round(pnl_abs / capital, 6),
        "equity_series": [{"date": p["d"], "equity": float(p["equity"])} for p in series],
        "allocations": allocations,
        "open_suggestions": _suggestions(await list_cards(conn, now=now)),
    }


SUGGESTION_SQL = "SELECT run_id, card->>'ticker' AS ticker FROM trading.approvals WHERE proposal_id = %s"
NOT_FOUND = "Öneri bulunamadı."


async def hold_suggestion(
    conn: AsyncConnection[Any], suggestion_id: str, *, kind: str, note: str, actor: str, role: str, now: datetime
) -> dict[str, Any]:
    """Record "Tut" (keep as is) or "Geç" (skip) for a suggestion: audit `suggestion.held` / `suggestion.skipped`.
    The card itself is not decided (it still expires at its 09:50); 404 for an unknown id."""
    async with conn.transaction():
        async with conn.cursor() as cur:
            await cur.execute(SUGGESTION_SQL, (suggestion_id,))
            row = await cur.fetchone()
        if row is None:
            raise ApiError(404, "not_found", NOT_FOUND)
        draft = AuditDraft(
            actor=actor,
            action=f"suggestion.{kind}",
            entity_type="proposal",
            entity_id=suggestion_id,
            run_id=row["run_id"],
            payload={"ticker": row["ticker"], "role": role, "note": bool(note.strip())},
            occurred_at=now,
        )
        await append(conn, [draft], now=now)
    return {"id": suggestion_id, "kind": kind, "at": now}
