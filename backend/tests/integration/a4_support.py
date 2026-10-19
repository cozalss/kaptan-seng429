"""Shared inserts for the reference-data integration tests (all inside the `pg` fixture's transaction)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from kaptan.db import DictConn

DISC_SQL = (
    "INSERT INTO core.disclosures (disclosure_index, primary_ticker, stock_codes, related_stocks, company_name,"
    " disclosure_class, disclosure_type, subject, summary, reason, subject_route, subject_map_version, published_at,"
    " available_at, ingest_source, origin, visible, fin_year, raw)"
    " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'NEW', %s, 'subject_map.v1', %s, %s,"
    " 'backfill', 'kap', false, %s, %s)"
)


async def add_disclosure(
    conn: DictConn,
    idx: int,
    *,
    subject: str,
    published: datetime,
    ticker: str | None = None,
    related: list[str] | None = None,
    summary: str = "",
    cls: str = "ODA",
    route: str = "archive_only",
    fin_year: int | None = None,
    raw: Any = None,
    text: str | None = None,
) -> None:
    from psycopg.types.json import Jsonb

    await conn.execute(
        DISC_SQL,
        (
            idx, ticker, [ticker] if ticker else [], related or [], f"{ticker or 'BIST'} A.Ş.", cls, cls, subject,
            summary, route, published, published + timedelta(seconds=60), fin_year, Jsonb(raw or {}),
        ),
    )  # fmt: skip
    if text is not None:
        await conn.execute(
            "INSERT INTO core.disclosure_texts (disclosure_index, lang, body) VALUES (%s, 'tr', %s)", (idx, text)
        )


async def add_bars(conn: DictConn, ticker: str, days: list[date], close: float, turnover: float = 1e8,
                   source: str = "isyatirim") -> None:  # fmt: skip
    rows = [
        (ticker, d, Decimal(str(close)), Decimal(str(close)), Decimal(str(turnover)), Decimal(str(close * 1e9)),
         Decimal(str(close * 4e8)), Decimal(1_000_000_000), "raw" if source == "isyatirim" else "adjusted", source)
        for d in days
    ]  # fmt: skip
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO core.prices_daily (ticker, d, open, close, turnover_try, mcap_try, free_float_mcap_try,"
            " capital_try, price_basis, source) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            rows,
        )
