"""SQL inputs of the live sizer (reads only, parametrised), all known at the decision time `t_dec`.

- prices: the last raw mark at t_pub and at t_dec (`kaptan.prices.reads.latest_mark`: 15-min delayed
  open, 18:30 close), the adjusted daily bars of the 21 sessions closed before t_dec (high/low/close
  of İş Yatırım rows through `core.prices_daily_adj`), ADV20 known at the next open;
- evidence: the market-model event study of the type market-wide and of the company alone
  (`kaptan.evidence`), as of the publication like the evidence card, so both see the same events.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg.rows import dict_row

from kaptan.evidence import repo
from kaptan.evidence.params import DEFAULT_HORIZONS
from kaptan.evidence.service import study_events
from kaptan.evidence.sessions import last_known_session
from kaptan.prices.calendar import next_session
from kaptan.prices.reads import adv20, latest_mark
from kaptan.sizing.costs import HLC
from kaptan.sizing.params import DEFAULT_SIZING
from kaptan.sizing.plan import SizingInputs

Conn = repo.Conn

BARS_SQL: Final = """
SELECT d, adj_high, adj_low, adj_close, raw_close FROM core.prices_daily_adj
 WHERE ticker = %s AND source = 'isyatirim' AND d <= %s
 ORDER BY d DESC LIMIT %s
"""


def _f(x: Any) -> float | None:
    return None if x is None else float(x)


async def bars_until(conn: Conn, ticker: str, t_dec: datetime, n: int) -> tuple[tuple[HLC, ...], Decimal | None]:
    """(oldest-first adjusted bars of the last `n` sessions closed before t_dec, raw close of the last)."""
    session = last_known_session(t_dec)
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(BARS_SQL, (ticker, session, n))
        rows = list(reversed(await cur.fetchall()))
    bars = tuple(HLC(_f(r["adj_high"]), _f(r["adj_low"]), float(r["adj_close"])) for r in rows)
    return bars, (rows[-1]["raw_close"] if rows else None)


async def load_sizing_inputs(
    conn: Conn,
    *,
    ticker: str,
    event_type: str,
    t_pub: datetime,
    t_dec: datetime,
    self_index: int,
) -> SizingInputs:
    now_mark = await latest_mark(conn, ticker, t_dec)
    pre_mark = await latest_mark(conn, ticker, t_pub)
    bars, raw_last = await bars_until(conn, ticker, t_dec, DEFAULT_SIZING.atr_window + 1)
    adv = await adv20(conn, ticker, next_session(last_known_session(t_dec)))
    firm_events = await repo.past_events(conn, event_type, t_pub, self_index, ticker=ticker)
    type_events = await repo.past_events(conn, event_type, t_pub, self_index)
    firm = await study_events(conn, firm_events, t_pub, DEFAULT_HORIZONS) if firm_events else None
    kind = await study_events(conn, type_events, t_pub, DEFAULT_HORIZONS) if type_events else None
    return SizingInputs(
        event_type=event_type,
        t_pub=t_pub,
        t_dec=t_dec,
        ref_price=None if now_mark is None else now_mark.price,
        p_pre=None if pre_mark is None else pre_mark.price,
        bars=bars,
        raw_last_close=raw_last,
        adv20_try=adv,
        type_study=kind,
        firm_study=firm,
    )
