"""`fundamentals_pit` job: İş Yatırım line items stamped with when KAP made them public (07 P3, FR-41).

    stats = await run_fundamentals(conn, now, client=polite)               # the KAP issuers in the universe
    stats = await run_fundamentals(conn, now, client=polite, tickers=["THYAO"], quarters=8)

`available_at` of a period = the earliest KAP "Finansal Rapor" disclosure of that company (any code of
its rename chain), fiscal year and period, published after the period end (`available_at_basis =
'kap_fr_publish'`, `source_disclosure` = its index). Without one: period end + the legal filing
deadline (`period_end_plus_legal_deadline`, conservative: 3/9 months 40 days, 6 months 60, annual 70;
SPK II-14.1 consolidated deadlines [~]); once the KAP row arrives a later run replaces that estimate.
TMS 29 (inflation accounting) applies from the 31.12.2023 statements on (`is_inflation_adj`).
Two requests per ticker for 8 quarters (4 periods per request), paced by the shared `PoliteClient`.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Final

from kaptan.fundamentals.isyatirim import Item, Period, derive, fetch_statements, period_end, recent_periods
from kaptan.prices.calendar import IST, istanbul_date
from kaptan.prices.http import PoliteClient, SourceError
from kaptan.reference._sql import Conn, execute, execute_many, fetch_all

log = logging.getLogger("kaptan.fundamentals")

TMS29_FROM: Final = date(2023, 12, 31)
LEGAL_DEADLINE_DAYS: Final[dict[int, int]] = {3: 40, 6: 60, 9: 40, 12: 70}
DEFAULT_QUARTERS: Final = 8
RULE_TYPE_MONTHS: Final[dict[str, int]] = {"3 aylık": 3, "6 aylık": 6, "9 aylık": 9, "yıllık": 12, "12 aylık": 12}

FR_SQL: Final = """
SELECT disclosure_index, fin_year, fin_period, raw, published_at, available_at FROM core.disclosures
 WHERE origin = 'kap' AND disclosure_class = 'FR' AND primary_ticker = ANY(core.ticker_codes(%s))
   AND fin_year = ANY(%s::int[]) AND available_at < %s
 ORDER BY available_at, disclosure_index
"""
UPSERT_SQL: Final = """
INSERT INTO core.fundamentals_pit (ticker, period_end, item, value, currency, is_inflation_adj, source,
  source_disclosure, available_at, available_at_basis, fetched_at)
VALUES (%s, %s, %s, %s, 'TRY', %s, 'isyatirim', %s, %s, %s, %s)
ON CONFLICT (ticker, period_end, item, available_at) DO UPDATE SET value = EXCLUDED.value,
  is_inflation_adj = EXCLUDED.is_inflation_adj, source_disclosure = EXCLUDED.source_disclosure,
  available_at_basis = EXCLUDED.available_at_basis, fetched_at = EXCLUDED.fetched_at
"""
#: Once a period has its KAP publication time, the conservative estimate row of it goes.
DROP_ESTIMATES_SQL: Final = """
DELETE FROM core.fundamentals_pit e
 WHERE e.ticker = %s AND e.available_at_basis = 'period_end_plus_legal_deadline'
   AND EXISTS (SELECT 1 FROM core.fundamentals_pit k
                WHERE k.ticker = e.ticker AND k.period_end = e.period_end AND k.item = e.item
                  AND k.available_at_basis = 'kap_fr_publish')
"""
TICKERS_SQL: Final = "SELECT ticker FROM core.issuers WHERE origin = 'kap' AND in_universe ORDER BY ticker"


@dataclass(frozen=True, slots=True)
class Stamp:
    available_at: datetime
    basis: str
    source_disclosure: int | None


@dataclass(frozen=True, slots=True)
class FundamentalsStats:
    tickers: int
    rows: int
    failed: tuple[str, ...]


def report_months(row: dict[str, Any]) -> int | None:
    """Fiscal months (3/6/9/12) of a KAP FR row: list rows carry `donem` 1–4, query rows `period` / `ruleType`."""
    raw = row.get("raw") or {}
    basic = raw.get("disclosureBasic") if isinstance(raw, dict) else None
    for candidate in ((basic or {}).get("donem"), raw.get("period") if isinstance(raw, dict) else None):
        if isinstance(candidate, int) and 1 <= candidate <= 4:
            return 3 * candidate
        if isinstance(candidate, str) and candidate.strip() in {"1", "2", "3", "4"}:
            return 3 * int(candidate)
    rule = str((raw.get("ruleType") if isinstance(raw, dict) else None) or row.get("fin_period") or "").strip()
    return RULE_TYPE_MONTHS.get(rule.lower())


def deadline_stamp(p: Period) -> Stamp:
    end = period_end(p)
    deadline = end + timedelta(days=LEGAL_DEADLINE_DAYS[p[1]] + 1)
    return Stamp(datetime.combine(deadline, time(0), IST), "period_end_plus_legal_deadline", None)


async def publication_stamps(conn: Conn, ticker: str, periods: Sequence[Period], now: datetime) -> dict[Period, Stamp]:
    years = sorted({y for y, _ in periods})
    stamps: dict[Period, Stamp] = {}
    for r in await fetch_all(conn, FR_SQL, (ticker, years, now)):
        months = report_months(r)
        if months is None or r["fin_year"] is None:
            continue
        p = (int(r["fin_year"]), months)
        if p in stamps or istanbul_date(r["published_at"]) <= period_end(p):
            continue
        stamps[p] = Stamp(r["available_at"], "kap_fr_publish", int(r["disclosure_index"]))
    return stamps


def _rows(ticker: str, items: Sequence[Item], stamps: dict[Period, Stamp], now: datetime) -> list[tuple[Any, ...]]:
    out = []
    for it in items:
        p = (it.period_end.year, it.period_end.month)
        stamp = stamps.get(p) or deadline_stamp(p)
        out.append(
            (
                ticker, it.period_end, it.item, it.value, it.period_end >= TMS29_FROM, stamp.source_disclosure,
                stamp.available_at, stamp.basis, now,
            )
        )  # fmt: skip
    return out


async def store_ticker(conn: Conn, ticker: str, items: Sequence[Item], now: datetime) -> int:
    periods = sorted({(it.period_end.year, it.period_end.month) for it in items})
    stamps = await publication_stamps(conn, ticker, periods, now)
    async with conn.transaction():
        n = await execute_many(conn, UPSERT_SQL, _rows(ticker, items, stamps, now))
        await execute(conn, DROP_ESTIMATES_SQL, (ticker,))
    return n


async def run_fundamentals(
    conn: Conn,
    now: datetime,
    *,
    client: PoliteClient,
    tickers: Sequence[str] | None = None,
    quarters: int = DEFAULT_QUARTERS,
) -> FundamentalsStats:
    """Fetch, derive and store the last `quarters` quarters per ticker; a failing ticker is skipped."""
    names = list(tickers) if tickers is not None else [r["ticker"] for r in await fetch_all(conn, TICKERS_SQL)]
    periods = recent_periods(istanbul_date(now), quarters)
    rows, failed = 0, []
    for ticker in names:
        try:
            statements = await fetch_statements(client, ticker, periods)
        except SourceError as exc:
            log.warning("fundamentals %s: %s", ticker, exc)
            failed.append(ticker)
            continue
        rows += await store_ticker(conn, ticker, derive(statements), now)
    return FundamentalsStats(len(names), rows, tuple(failed))
