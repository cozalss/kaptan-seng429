"""Renamed BIST codes (FR-06, 07 §6 [V]): `core.ticker_history`, e.g. KOZAL → TRALT.

The price sources serve a renamed company's whole history under its *new* code only (İş Yatırım and
Yahoo both answer TRALT back to 2010, KOZAL is a 404), while older KAP disclosures carry the old code.
The price reads (`kaptan.prices.reads`, `kaptan.evidence.repo`) therefore match every code of the chain
through the SQL function `core.ticker_codes(code)`; this module is the Python side:

    await ticker_codes(conn, "KOZAL")      # ['KOZAL', 'TRALT'] (the code itself first)
    await current_code(conn, "KOZAL")      # 'TRALT' (follows old → new to the end)
    await add_rename(conn, "KOZAL", "TRALT", changed_on=None, source="manual")

Migration 0016 seeds the one rename the docs list (KOZAL → TRALT) with `changed_on` NULL: its first
TRALT session is not verified yet. A rename without a date is still a mapping (prices join up); only
`code_on()` needs the date.
"""

from __future__ import annotations

from datetime import date
from typing import Final, Literal

from kaptan.prices.models import normalise_ticker
from kaptan.reference._sql import Conn, execute, fetch_all, fetch_one

RenameSource = Literal["kap", "isyatirim", "manual"]
MAX_CHAIN: Final = 10

CODES_SQL: Final = "SELECT core.ticker_codes(%s) AS codes"
NEXT_SQL: Final = "SELECT new_ticker, changed_on FROM core.ticker_history WHERE old_ticker = %s ORDER BY changed_on"
UPSERT_SQL: Final = """
INSERT INTO core.ticker_history (old_ticker, new_ticker, changed_on, source, source_disclosure, note)
VALUES (%s, %s, %s, %s, %s, %s)
ON CONFLICT (old_ticker, new_ticker) DO UPDATE SET
  changed_on = COALESCE(EXCLUDED.changed_on, core.ticker_history.changed_on),
  source = EXCLUDED.source,
  source_disclosure = COALESCE(EXCLUDED.source_disclosure, core.ticker_history.source_disclosure),
  note = COALESCE(EXCLUDED.note, core.ticker_history.note)
"""


async def ticker_codes(conn: Conn, ticker: str) -> list[str]:
    """Every code of `ticker`'s rename chain, `ticker` first (just `[ticker]` without a rename)."""
    row = await fetch_one(conn, CODES_SQL, (ticker,))
    codes = None if row is None else row["codes"]
    return list(codes) if codes else [ticker]


async def current_code(conn: Conn, ticker: str) -> str:
    """The newest code of the chain (old → new until a code has no successor)."""
    code, seen = ticker, {ticker}
    for _ in range(MAX_CHAIN):
        nxt = await fetch_all(conn, NEXT_SQL, (code,))
        if not nxt:
            return code
        candidate = str(nxt[-1]["new_ticker"])
        if candidate in seen:  # a cycle in hand-entered data: stop where we are
            return code
        seen.add(candidate)
        code = candidate
    return code


async def code_on(conn: Conn, ticker: str, d: date) -> str:
    """The code the company traded under on `d`; renames without a verified date never apply."""
    code, seen = ticker, {ticker}
    for _ in range(MAX_CHAIN):
        nxt = [r for r in await fetch_all(conn, NEXT_SQL, (code,)) if r["changed_on"] is not None]
        step = [r for r in nxt if r["changed_on"] <= d]
        if not step or str(step[-1]["new_ticker"]) in seen:
            return code
        code = str(step[-1]["new_ticker"])
        seen.add(code)
    return code


async def add_rename(
    conn: Conn,
    old: str,
    new: str,
    *,
    changed_on: date | None,
    source: RenameSource,
    source_disclosure: int | None = None,
    note: str | None = None,
) -> None:
    """Record (or refresh) a rename; codes are validated like every other ticker."""
    old_t, new_t = normalise_ticker(old), normalise_ticker(new)
    if old_t == new_t:
        raise ValueError("a rename needs two different codes")
    await execute(conn, UPSERT_SQL, (old_t, new_t, changed_on, source, source_disclosure, note))
