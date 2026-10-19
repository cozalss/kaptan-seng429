"""What the exit rules need about one position, read point in time (06 §6; no look-ahead).

Prices: raw İş Yatırım closes of the sessions from entry to `day`. News: disclosures of the ticker
available after the entry and before `as_of` (18:30 of `day`), restrictions added in that window.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.exit_rules import E2_REVERSAL_SHARE, ExitFacts
from kaptan.prices.calendar import istanbul_date, sessions_between
from kaptan.text.turkish import tr_lower

PositionRow = dict[str, Any]

CLOSES_SQL: Final = """
SELECT d, close FROM core.prices_daily
WHERE ticker = %s AND source = 'isyatirim' AND price_basis = 'raw' AND d BETWEEN %s AND %s ORDER BY d
"""
NEWS_SQL: Final = """
SELECT disclosure_index, subject, summary, subject_route, parsed FROM core.disclosures
WHERE (primary_ticker = %(t)s OR %(t)s = ANY(stock_codes)) AND available_at > %(from)s AND available_at < %(to)s
  AND reason <> 'CANC'
ORDER BY available_at, disclosure_index
"""
RESTRICTIONS_SQL: Final = """
SELECT kind FROM core.restricted_securities
WHERE ticker = %s AND kind <> 'team_insider' AND added_at > %s AND added_at < %s ORDER BY added_at LIMIT 1
"""
SOURCE_PARSED_SQL: Final = "SELECT parsed FROM core.disclosures WHERE disclosure_index = %s"


def _stop_pct(pos: PositionRow) -> float | None:
    if pos["stop_pct"] is not None:
        return float(pos["stop_pct"])
    doc = pos["source_doc"] or {}
    stop, ref = doc.get("stop_price"), doc.get("ref_price")
    if stop and ref and 0 < stop < ref:
        return 1 - float(stop) / float(ref)
    return None


def _nominal(parsed: dict[str, Any] | None, key: str) -> Decimal:
    rows = (parsed or {}).get("rows") or []
    return sum((Decimal(str(r.get(key) or 0)) for r in rows), Decimal(0))


def is_buyback_sale(item: dict[str, Any]) -> bool:
    """E1 reversal: a disclosure about selling the bought-back shares."""
    parsed = item.get("parsed") or {}
    nature = tr_lower(str(parsed.get("nature") or ""))
    text = tr_lower(f"{item.get('subject') or ''} {item.get('summary') or ''}")
    return ("geri alınan" in text and "satış" in text) or (parsed.get("kind") == "buyback" and "satış" in nature)


def reversal(event_type: str, news: list[dict[str, Any]], source_parsed: dict[str, Any] | None) -> str | None:
    """X4: E1 bought-back shares sold; E2 insiders sold ≥ 50 % of the original purchase."""
    if event_type == "E1":
        hit = next((n for n in news if is_buyback_sale(n)), None)
        return None if hit is None else f"buyback sale idx {hit['disclosure_index']}"
    if event_type == "E2":
        bought = _nominal(source_parsed, "buy_nominal_try")
        sold = sum(
            (
                _nominal(n["parsed"], "sell_nominal_try")
                for n in news
                if (n["parsed"] or {}).get("kind") == "insider_trade"
            ),
            Decimal(0),
        )
        if bought > 0 and sold >= bought * Decimal(str(E2_REVERSAL_SHARE)):
            return f"insider net sale {sold} >= 50% of {bought}"
    return None


async def gather_facts(
    conn: AsyncConnection[Any], pos: PositionRow, day: date, as_of: datetime
) -> tuple[ExitFacts, float | None]:
    opened: datetime = pos["opened_at"]
    entry_day = istanbul_date(opened)
    async with conn.cursor() as cur:
        await cur.execute(CLOSES_SQL, (pos["ticker"], entry_day, day))
        closes = {r["d"]: float(r["close"]) for r in await cur.fetchall()}
        await cur.execute(NEWS_SQL, {"t": pos["ticker"], "from": opened, "to": as_of})
        news = [dict(r) for r in await cur.fetchall()]
        await cur.execute(RESTRICTIONS_SQL, (pos["ticker"], opened, as_of))
        restriction = await cur.fetchone()
        await cur.execute(SOURCE_PARSED_SQL, (pos["disclosure_index"],))
        src = await cur.fetchone()
    avoid = next((n for n in news if str(n["subject_route"] or "").startswith("avoid:")), None)
    negative = (
        f"restriction {restriction['kind']}"
        if restriction is not None
        else (f"{avoid['subject_route']} idx {avoid['disclosure_index']}" if avoid is not None else None)
    )
    doc = pos["source_doc"] or {}
    last_close = closes.get(day)
    facts = ExitFacts(
        event_type=pos["event_type"],
        avg_cost=float(pos["avg_cost"]),
        stop_price=None if pos["stop_price"] is None else float(pos["stop_price"]),
        stop_pct=_stop_pct(pos),
        held_sessions=len(sessions_between(entry_day, day)),
        hold_min=int(doc.get("holding_days_min") or 1),
        hold_max=int(doc.get("holding_days_max") or doc.get("holding_days_min") or 1),
        last_close=last_close,
        max_close=max(closes.values()) if closes else None,
        same_type_event=any(n["subject_route"] == pos["event_type"] for n in news),
        negative_news=negative,
        reversal=reversal(pos["event_type"], news, src["parsed"] if src else None),
    )
    return facts, last_close
