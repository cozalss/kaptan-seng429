"""`GET /me/overview` (the person's home): the one book read once and folded into MeOverview.

- needs_setup: the starting money is not entered yet; every money field is 0 and the lists are empty;
- capital_start: the money put in so far (start + deposits - withdrawals + cost of holdings entered by hand);
- cash: the book's cash; equity_now: cash + holdings at their last known price (`kaptan.risk.book`);
  pnl_abs / pnl_pct: equity_now against capital_start (0 % while nothing is put in);
- prices_as_of: the oldest "known at" time among the prices used (null when no holding has a stored price);
- equity_series: the daily closes of the person's book (`/portfolio/pnl`, strategy kaptan:v1.1-fwd);
- allocations: the holdings per ticker at their last price, weight of equity, with their price time;
- open_suggestions: the pending approval cards (`/approvals`): buy -> "al", sell -> "sat"; `confidence` is the
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
from kaptan.risk.book import own_book


def _allocations(positions: list[dict[str, Any]], equity: float) -> list[dict[str, Any]]:
    """One allocation per ticker (a suggested and a hand-entered position of the same share are one holding)."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for p in positions:
        grouped.setdefault(p["ticker"], []).append(p)
    out = []
    for ticker, rows in grouped.items():
        amount = round(sum(float(p["qty"]) * float(p["last_price"]) for p in rows), 2)
        cost = sum(float(p["qty"]) * float(p["avg_cost"]) for p in rows)
        times = [p["price_as_of"] for p in rows if p["price_as_of"] is not None]
        out.append(
            {
                "symbol": ticker,
                "name": rows[0]["company_name"],
                "amount": amount,
                "weight": round(amount / equity, 4) if equity > 0 else 0.0,
                "pnl_pct": round(amount / cost - 1, 4) if cost > 0 else 0.0,
                "price_as_of": min(times) if len(times) == len(rows) else None,
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


def _empty() -> dict[str, Any]:
    return {
        "needs_setup": True,
        "capital_start": 0.0,
        "equity_now": 0.0,
        "cash": 0.0,
        "pnl_abs": 0.0,
        "pnl_pct": 0.0,
        "prices_as_of": None,
        "equity_series": [],
        "allocations": [],
        "open_suggestions": [],
    }


async def me_overview(conn: AsyncConnection[Any], *, now: datetime) -> dict[str, Any]:
    book = await own_book(conn, now)
    if not book.started:
        return _empty()
    equity, put_in = float(book.equity), float(book.put_in)
    allocations = _allocations(await list_positions(conn, now), equity)
    series = [p for p in await list_pnl(conn, None, None) if p["strategy"] == LIVE_STRATEGY]
    times = [h.mark_known_at for h in book.holdings if h.mark_known_at is not None]
    pnl_abs = round(equity - put_in, 2)
    return {
        "needs_setup": False,
        "capital_start": put_in,
        "equity_now": equity,
        "cash": float(book.cash),
        "pnl_abs": pnl_abs,
        "pnl_pct": round(pnl_abs / put_in, 6) if put_in > 0 else 0.0,
        "prices_as_of": min(times) if times else None,
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
