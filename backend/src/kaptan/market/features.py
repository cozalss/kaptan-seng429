"""The live merge node's market inputs (LLM_MODE=live only; replay never calls this module).

`load_merge_inputs` runs the point-in-time SQL once (notices for E1/E2, `fundamentals_pit` for E4, the
TCMB rate for a foreign-currency E3 amount); `live_features` turns them into MergedFeatures fields.
`as_of` is the disclosure's `available_at`: everything strictly before it, plus the disclosure itself.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Final

from kaptan.market import fundamentals, notices
from kaptan.market.fx_store import currency_code, rate_at
from kaptan.market.ticks import price_limits

Conn = notices.Conn
DIGITS: Final = Decimal("0.000001")
CENT: Final = Decimal("0.01")
#: Amounts written in a foreign currency (R14 cross-check of an E3 amount the Reader read in USD/EUR).
_NUM: Final = r"(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?"
FX_WORDS: Final[dict[str, str]] = {
    "USD": r"USD|ABD\s+Doları|Amerikan\s+Doları|Dolar|\$",
    "EUR": r"EUR|Avro|Euro|€",
    "GBP": r"GBP|İngiliz\s+Sterlini|Sterlin|£",
}


@dataclass(frozen=True, slots=True)
class MergeInputs:
    notices: tuple[notices.Notice, ...] = ()
    fundamentals: tuple[fundamentals.FundamentalRow, ...] | None = None
    currency: str | None = None
    fx_rate: Decimal | None = None  # TRY per unit of `currency`; None = unknown (or not needed)


async def load_merge_inputs(
    conn: Conn,
    *,
    ticker: str,
    disclosure_index: int,
    published_at: datetime,
    available_at: datetime,
    event_type: str,
    reader: Mapping[str, Any] | None,
) -> MergeInputs:
    rows: tuple[notices.Notice, ...] = ()
    if event_type in ("E1", "E2"):
        since = notices.lookback_start(published_at)
        rows = tuple(await notices.load_notices(conn, ticker, since, available_at, disclosure_index))
    fund = None
    if event_type == "E4":
        loaded = await fundamentals.load_rows(conn, ticker, available_at, disclosure_index)
        fund = None if loaded is None else tuple(loaded)
    currency, rate = None, None
    if event_type == "E3" and reader is not None:
        currency = currency_code(reader.get("currency"))
        if currency is not None and currency != "TRY":
            rate = await rate_at(conn, currency, available_at)
    return MergeInputs(rows, fund, currency, rate)


def _f(x: Decimal | None) -> float | None:
    return None if x is None else float(x.quantize(DIGITS, rounding=ROUND_HALF_UP))


def _money(x: Decimal | None) -> float | int | None:
    if x is None:
        return None
    m = x.quantize(CENT, rounding=ROUND_HALF_UP)
    return int(m) if m == m.to_integral_value() else float(m)


def live_features(
    inputs: MergeInputs,
    *,
    event_type: str,
    ticker: str,
    disclosure_index: int,
    published_at: datetime,
    available_at: datetime,
    reader: Mapping[str, Any] | None,
    paid_in_capital: Decimal | None,
    free_float_mcap: Decimal | None,
) -> dict[str, Any]:
    """E1 / E2 / E4 MergedFeatures fields; whatever the data cannot give stays None ("unknown")."""
    if event_type == "E1":
        b = notices.buyback_features(inputs.notices, disclosure_index, published_at, ticker, paid_in_capital, reader)
        return {
            "e1_nature": (reader or {}).get("nature"),
            "new_buyback_rows": b.new_rows,
            "buyback_10d_capital_pct": _f(b.capital_pct),
            "buyback_10d_notice_count": b.notice_count,
            "buyback_sale_within_20d": b.sale_within_20d,
        }
    if event_type == "E2":
        i = notices.insider_features(inputs.notices, disclosure_index, available_at, reader)
        ff = None if i.net_value_try is None or not free_float_mcap else i.net_value_try / free_float_mcap
        return {
            "insider_role_class": (reader or {}).get("role"),
            "insider_open_market": (reader or {}).get("open_market"),
            "insider_net_buy_value_try": _money(i.net_value_try),
            "insider_buy_to_ff_mcap": _f(ff),
            "insider_cluster_30d": i.cluster_30d,
        }
    if event_type == "E4":
        return {"e4": fundamentals.e4_features(inputs.fundamentals)}
    return {}


def amount_try(inputs: MergeInputs, reader: Mapping[str, Any], amount: Decimal) -> Decimal | None:
    """An E3 amount in TL: the TL figure the text states, else amount × TCMB rate (unknown rate → None)."""
    stated = reader.get("amount_try_stated")
    if stated is not None:
        return Decimal(str(stated))
    if inputs.currency in (None, "TRY"):
        return amount
    return None if inputs.fx_rate is None else amount * inputs.fx_rate


def fx_text_amounts(text: str, currency: str | None) -> list[Decimal]:
    """Amounts the text writes in `currency` ("12.500.000 USD", "€ 3.000.000"), for R14."""
    words = FX_WORDS.get(currency or "")
    if words is None:
        return []
    after = re.compile(rf"{_NUM}\s*(?:{words})", re.IGNORECASE)
    before = re.compile(rf"(?:{words})\s*{_NUM}", re.IGNORECASE)
    found: list[Decimal] = []
    for rx in (after, before):
        for whole, frac in rx.findall(text):
            value = Decimal(whole.replace(".", "") + (f".{frac}" if frac else ""))
            if value > 0 and value not in found:
                found.append(value)
    return found


def limits_of(base: Decimal) -> tuple[float | int | None, float | int | None]:
    """(lower, upper) of the next/current session from the last known close (BIST ±10 %, tick grid)."""
    lower, upper = price_limits(base)
    return _money(lower), _money(upper)
