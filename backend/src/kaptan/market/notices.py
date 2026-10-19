"""E1 / E2 history features of the merge node (06 §3.1, §3.2; FR-41), point in time.

E1:  buyback_ratio_10 = Σ nominal bought (trade date in the last 10 sessions) / paid-in capital
     n_notices_10     = the company's E1 notices in the last 10 sessions (this one included)
     sale_within_20d  = a "geri alınan payların satışı / elden çıkarılması" notice in the last 20 sessions
E2:  net_buy_value    = (Σ buy − Σ sell nominal) × avg price (mid of the stated range, else the trades' prices)
     cluster_30       = distinct insiders with a net buy > 0 in the last 30 calendar days

Only rows known before the decision are read: `available_at < as_of`, plus the disclosure itself (it
*is* the event). Trades come from the deterministic parser (`core.disclosures.parsed`); for the
current notice the Reader's extraction is the fallback. The same trade quoted by two notices counts
once (date, nominal, price). Person names are never stored (KVKK), so an insider is identified by the
holding chain of his filings: one filing's day-end holding is the next one's day-start holding.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.rows import dict_row

from kaptan.prices.calendar import IST, add_sessions, is_trading_day, prev_session
from kaptan.text.turkish import norm_key

Conn = AsyncConnection[Any]

E1_SESSIONS: Final = 10  # 06 §13 events.E1.lookback_sessions
SALE_SESSIONS: Final = 20  # 06 §13 events.E1.exclude_if_sale_within_sessions
CLUSTER_DAYS: Final = 30  # 06 §13 events.E2.strong.cluster_days
SALE_MARKERS: Final = tuple(norm_key(s) for s in ("Elden Çıkarılması", "Elden Çıkarma", "satış", "satışı"))

NOTICES_SQL: Final = """
SELECT disclosure_index, published_at, available_at, subject, subject_route, parsed
  FROM core.disclosures
 WHERE origin = 'kap' AND primary_ticker = %(ticker)s AND reason <> 'CANC'
   AND published_at >= %(since)s
   AND (available_at < %(as_of)s OR disclosure_index = %(self)s)
 ORDER BY published_at, disclosure_index
"""


@dataclass(frozen=True, slots=True)
class Notice:
    index: int
    published_at: datetime
    subject: str
    route: str
    parsed: Mapping[str, Any] | None


def dec(x: Any) -> Decimal | None:
    if x is None or isinstance(x, bool):
        return None
    try:
        return Decimal(str(x))
    except InvalidOperation:
        return None


def day(x: Any) -> date | None:
    if isinstance(x, date):
        return x
    try:
        return date.fromisoformat(str(x)[:10])
    except ValueError:
        return None


def session_of(ts: datetime) -> date:
    """The last session on or before the notice's Istanbul date."""
    d = ts.astimezone(IST).date()
    return d if is_trading_day(d) else prev_session(d)


async def load_notices(conn: Conn, ticker: str, since: datetime, as_of: datetime, self_index: int) -> list[Notice]:
    params = {"ticker": ticker, "since": since, "as_of": as_of, "self": self_index}
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(NOTICES_SQL, params)
        rows = await cur.fetchall()
    return [
        Notice(int(r["disclosure_index"]), r["published_at"], r["subject"], r["subject_route"], r["parsed"])
        for r in rows
    ]


def lookback_start(published_at: datetime) -> datetime:
    """Earliest publication time any window needs (20 sessions, 30 days), as a tz-aware bound."""
    end = session_of(published_at)
    first = min(add_sessions(end, -(SALE_SESSIONS - 1)), (published_at - timedelta(days=CLUSTER_DAYS)).date())
    return datetime.combine(first, datetime.min.time(), IST)


# ── E1 ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class BuybackFeatures:
    nominal_10d: Decimal
    capital_pct: Decimal | None  # fraction of paid-in capital (0.0025 = 0.25 %)
    notice_count: int
    sale_within_20d: bool
    new_rows: int | None


def is_sale(n: Notice) -> bool:
    nature = norm_key(str((n.parsed or {}).get("nature") or ""))
    subject = norm_key(n.subject)
    return any(m in subject for m in SALE_MARKERS[:2]) or any(m in nature for m in SALE_MARKERS)


def _txns(n: Notice, reader: Mapping[str, Any] | None, current: int) -> list[tuple[date, Decimal, Decimal | None, Any]]:
    parsed = n.parsed or {}
    rows = parsed.get("transactions") if parsed.get("kind") == "buyback" else None
    out = []
    for t in rows or []:
        d, nominal = day(t.get("date")), dec(t.get("nominal_try"))
        if d is not None and nominal is not None:
            out.append((d, nominal, dec(t.get("price_try")), t.get("ticker")))
    if not out and n.index == current and reader is not None:
        for t in reader.get("transactions") or []:
            d, nominal = day(t.get("trade_date")), dec(t.get("nominal_tl"))
            if d is not None and nominal is not None:
                out.append((d, nominal, dec(t.get("price_tl")), None))
    return out


def buyback_features(
    notices: Sequence[Notice],
    current: int,
    published_at: datetime,
    ticker: str,
    capital: Decimal | None,
    reader: Mapping[str, Any] | None,
) -> BuybackFeatures:
    end = session_of(published_at)
    lo10, lo20 = add_sessions(end, -(E1_SESSIONS - 1)), add_sessions(end, -(SALE_SESSIONS - 1))
    trades: dict[tuple[date, Decimal, Decimal | None], Decimal] = {}
    counted: set[int] = set()
    new_rows: int | None = None
    sale = False
    if all(n.index != current for n in notices):  # the event itself, even when not stored (yet)
        notices = [*notices, Notice(current, published_at, "", "E1", None)]
    for n in notices:
        if n.index != current and lo20 <= session_of(n.published_at) <= end and is_sale(n):
            sale = True
        if n.route != "E1" or is_sale(n):
            continue
        txns = [t for t in _txns(n, reader, current) if t[3] in (None, ticker)]
        if n.index == current:
            new_rows = len(txns)
        in_window = [t for t in txns if lo10 <= t[0] <= end]
        for d, nominal, price, _ in in_window:
            trades[(d, nominal, price)] = nominal
        if n.index == current or (in_window and lo10 <= session_of(n.published_at) <= end):
            counted.add(n.index)
    total = sum(trades.values(), Decimal(0))
    pct = total / capital if capital else None
    return BuybackFeatures(total, pct, len(counted | {current}), sale, new_rows)


# ── E2 ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class InsiderFeatures:
    net_nominal: Decimal | None
    avg_price: Decimal | None
    net_value_try: Decimal | None
    cluster_30d: int | None


@dataclass(frozen=True, slots=True)
class _Filing:
    index: int
    first_start: Decimal | None
    last_end: Decimal | None
    net: Decimal


def _filing(n: Notice) -> _Filing | None:
    parsed = n.parsed or {}
    rows = sorted(
        (r for r in parsed.get("rows") or [] if day(r.get("date")) is not None), key=lambda r: str(r.get("date"))
    )
    if parsed.get("kind") != "insider_trade" or not rows:
        return None
    buy = sum((dec(r.get("buy_nominal_try")) or Decimal(0) for r in rows), Decimal(0))
    sell = sum((dec(r.get("sell_nominal_try")) or Decimal(0) for r in rows), Decimal(0))
    return _Filing(n.index, dec(rows[0].get("start_nominal_try")), dec(rows[-1].get("end_nominal_try")), buy - sell)


def cluster(filings: Sequence[_Filing]) -> int:
    """Distinct holders with a net buy > 0; filings chain when one's day-end holding is another's day-start."""
    parent = list(range(len(filings)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, a in enumerate(filings):
        for j, b in enumerate(filings):
            if i != j and a.last_end is not None and a.last_end == b.first_start:
                parent[root(j)] = root(i)
    nets: dict[int, Decimal] = {}
    for i, f in enumerate(filings):
        nets[root(i)] = nets.get(root(i), Decimal(0)) + f.net
    return sum(1 for v in nets.values() if v > 0)


def _avg_price(parsed: Mapping[str, Any], reader: Mapping[str, Any] | None) -> Decimal | None:
    lo, hi = dec(parsed.get("price_low_try")), dec(parsed.get("price_high_try"))
    if lo is not None and hi is not None and lo > 0 and hi > 0:
        return (lo + hi) / 2  # 06 §3.2 orta_nokta(price_range)
    qty = value = Decimal(0)
    for t in (reader or {}).get("trades") or []:
        q, p = dec(t.get("qty")), dec(t.get("price_tl"))
        if q and p:
            qty, value = qty + q, value + q * p
    return value / qty if qty > 0 else None


def _reader_net(reader: Mapping[str, Any] | None) -> tuple[Decimal | None, Decimal | None]:
    """(net nominal, net value) from the Reader alone; a mixed filing without the table is unknown."""
    if not reader or reader.get("direction") not in ("buy", "sell"):
        return None, None
    sign = Decimal(1) if reader["direction"] == "buy" else Decimal(-1)
    qty = value = Decimal(0)
    for t in reader.get("trades") or []:
        q, p, v = dec(t.get("qty")), dec(t.get("price_tl")), dec(t.get("value_tl"))
        qty += q or Decimal(0)
        if v is None and q is not None and p is not None:
            v = q * p
        if v is None:
            return sign * qty if qty else None, None
        value += v
    return sign * qty, sign * value


def insider_features(
    notices: Sequence[Notice],
    current: int,
    as_of: datetime,
    reader: Mapping[str, Any] | None,
) -> InsiderFeatures:
    this = next((n for n in notices if n.index == current), None)
    own = _filing(this) if this is not None else None
    if own is not None:
        price = _avg_price((this.parsed if this else None) or {}, reader)
        net_nominal: Decimal | None = own.net
        net_value = None if price is None else own.net * price
    else:
        net_nominal, net_value = _reader_net(reader)
        price = None if not net_nominal or net_value is None else net_value / net_nominal
    since = as_of - timedelta(days=CLUSTER_DAYS)
    filings = [
        f
        for n in notices
        if n.route == "E2" and n.published_at >= since and n.index != current and (f := _filing(n)) is not None
    ]
    if own is not None:
        filings.append(own)
    elif net_nominal is not None:
        filings.append(_Filing(current, None, None, net_nominal))
    return InsiderFeatures(net_nominal, price, net_value, cluster(filings) if filings else None)
