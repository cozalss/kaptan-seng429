"""The digest of one Istanbul day (GET /me/digest): the notable KAP disclosures of ALL companies, not only the
75 KAPtan follows. Read-only; nothing is fetched and no model is asked (see `kaptan.digest.kinds`).

Order: held companies first, then watched ones, then the rest; inside each, the kind order of `KIND_ORDER`, then
the newest. Corrections, updates and cancellations are not new events and are left out (reason NEW only).
A company outside the universe carries a tag: KAPtan gives no suggestion for it (thin trading), unless you watch
it: then KAPtan does analyse it, and the tag says that instead.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.clock import istanbul_date
from kaptan.digest.kinds import KIND_ORDER, KIND_TITLES, classify, headline_of
from kaptan.disclosures.listing import TICKER_SHAPE, day_bounds
from kaptan.domain.schemas._base import iso_ms
from kaptan.reference._sql import fetch_all
from kaptan.rules.calendar import is_trading_day

KAP_URL: Final = "https://www.kap.org.tr/tr/Bildirim/{}"
MAX_ITEMS: Final = 400
OUTSIDE_NOTE: Final = "KAPtan bu hisseye öneri vermez (işlem hacmi düşük)"
WATCHED_OUTSIDE_NOTE: Final = "Listenin dışında, ama izleme listende: KAPtan inceler (işlem hacmi düşük)"
CLOSED_NOTE: Final = "Borsa kapalı; son işlem gününün duyuruları."
CLOSED_DAY_NOTE: Final = "Bu gün borsa kapalıydı."

DAY_SQL: Final = """
SELECT d.disclosure_index, d.primary_ticker, d.stock_codes, d.company_name, d.subject, d.summary,
       d.subject_route, d.is_noise, d.published_at, d.fin_year, d.fin_period,
       jsonb_build_object(
         'status', d.parsed->>'status', 'direction', d.parsed->>'direction',
         'mentions_fund', d.parsed->'mentions_fund', 'latest', d.parsed->'latest', 'amounts', d.parsed->'amounts',
         'price_low_try', d.parsed->>'price_low_try', 'price_high_try', d.parsed->>'price_high_try') AS parsed
  FROM core.disclosures d
 WHERE d.origin = 'kap' AND d.reason = 'NEW' AND NOT d.is_noise AND d.subject_route <> 'noise'
   AND d.published_at >= %(start)s AND d.published_at < %(end)s
 ORDER BY d.published_at DESC, d.disclosure_index DESC
"""
HELD_SQL: Final = "SELECT DISTINCT ticker FROM trading.positions WHERE qty > 0"
WATCH_SQL: Final = "SELECT ticker FROM core.watchlist"
ISSUER_SQL: Final = "SELECT ticker FROM core.issuers WHERE in_universe"
WHY_RANK: Final = {"held": 0, "watched": 1, None: 2}


def previous_trading_day(day: date) -> date:
    d = day - timedelta(days=1)
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d


def next_trading_day_until(day: date, today: date) -> date | None:
    """The next trading day after `day`, or None when it is after `today` (nothing is published yet)."""
    d = day + timedelta(days=1)
    while d <= today:
        if is_trading_day(d):
            return d
        d += timedelta(days=1)
    return None


def default_day(today: date) -> tuple[date, bool]:
    """(the day to show, true when it is an earlier trading day because `today` the market is closed)."""
    if is_trading_day(today):
        return today, False
    return previous_trading_day(today), True


def ticker_of(row: dict[str, Any]) -> str | None:
    primary = row["primary_ticker"]
    if isinstance(primary, str) and TICKER_SHAPE.fullmatch(primary):
        return primary
    return next((c for c in row["stock_codes"] or [] if TICKER_SHAPE.fullmatch(c)), None)


def item_of(row: dict[str, Any], held: set[str], watched: set[str], universe: set[str]) -> dict[str, Any] | None:
    """One DigestItem document, or None (not notable / no usable ticker). Pure."""
    ticker = ticker_of(row)
    read = classify(row)
    if ticker is None or read is None:
        return None
    kind, line = read
    why = "held" if ticker in held else "watched" if ticker in watched else None
    outside = ticker not in universe
    note = None
    if outside:
        note = WATCHED_OUTSIDE_NOTE if ticker in watched else OUTSIDE_NOTE
    return {
        "disclosure_index": int(row["disclosure_index"]),
        "kind": kind,
        "ticker": ticker,
        "company_name": row["company_name"],
        "line": line,
        "headline": headline_of(str(row["summary"] or "")),
        "published_at": iso_ms(row["published_at"]),
        "source_url": KAP_URL.format(row["disclosure_index"]),
        "why": why,
        "outside_list": outside,
        "outside_note": note,
    }


def sort_key(item: dict[str, Any]) -> tuple[int, int, float, int]:
    ts = datetime.fromisoformat(item["published_at"]).timestamp()
    return (WHY_RANK[item["why"]], KIND_ORDER.index(item["kind"]), -ts, -item["disclosure_index"])


def build_items(
    rows: list[dict[str, Any]], held: set[str], watched: set[str], universe: set[str]
) -> list[dict[str, Any]]:
    items = [i for r in rows if (i := item_of(r, held, watched, universe)) is not None]
    return sorted(items, key=sort_key)


async def _tickers(conn: AsyncConnection[Any], sql: str) -> set[str]:
    return {str(r["ticker"]) for r in await fetch_all(conn, sql)}


async def digest(conn: AsyncConnection[Any], now: datetime, day: date | None = None) -> dict[str, Any]:
    today = istanbul_date(now)
    fell_back = False
    if day is None:
        day, fell_back = default_day(today)
    start, end = day_bounds(day)
    rows = await fetch_all(conn, DAY_SQL, {"start": start, "end": end})
    items = build_items(
        rows, await _tickers(conn, HELD_SQL), await _tickers(conn, WATCH_SQL), await _tickers(conn, ISSUER_SQL)
    )
    open_day = is_trading_day(day)
    counts = {k: sum(1 for i in items if i["kind"] == k) for k in KIND_ORDER}
    return {
        "day": day,
        "is_trading_day": open_day,
        "note": CLOSED_NOTE if fell_back else (None if open_day else CLOSED_DAY_NOTE),
        "prev_day": previous_trading_day(day),
        "next_day": next_trading_day_until(day, today),
        "total": len(items),
        "truncated": len(items) > MAX_ITEMS,
        "kinds": [{"kind": k, "title": KIND_TITLES[k], "count": n} for k, n in counts.items() if n],
        "items": items[:MAX_ITEMS],
    }
