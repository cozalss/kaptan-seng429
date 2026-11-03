"""R14's reference set (06 R14, 05 §4.2): the amounts the source document itself holds, read by code only.

The gate asks one question: is the Reader's figure among these, within ±0.5 %? This module never sees the Reader's
figure, so a model cannot influence what counts. What it reads, for E1 and E2:

- written: "<amount> TL" in the text, minus prices, plus the table's nominal cells. A real form puts "(TL)" in the column
  header and leaves the cells bare, so the cells are read by column: price, ratio and holding columns never count.
- derived: what the table implies but does not write, each kept apart so the trace can say so. The rows' sum, earlier
  programme total + last row (E1), nominal × the midpoint of the text's price (E2, 06 §3.2's `orta_nokta`).

A table is read only where the form puts one. Its heading must appear exactly once, in the notice's own body: a heading
planted in free text turns the table off and never adds to it. E3 and E4 read the text as they always did.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Final, Literal

from kaptan.agents.reader_facts import AttachmentFacts
from kaptan.ingest.parsers import buyback, insider
from kaptan.ingest.parsers.common import label_pattern
from kaptan.text.turkish import parse_tr_decimal, tr_lower

Basis = Literal["table_sum", "table_cumulative", "nominal_x_price"]

AMOUNT_TOLERANCE: Final = Decimal("0.005")
_AMOUNT: Final = re.compile(
    r"(?<![\d.,])"
    r"(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+\.\d+|\d{1,3}(?:,\d{3}){2,}|\d+(?:[.,]\d+)?)"
    r"\s*-?\s*(?:TL|₺)(?![A-Za-zÇĞİÖŞÜçğıöşü])"
)
_NUM: Final = r"\d[\d.]*(?:,\d+)?"
_PRICE_BEFORE: Final = re.compile(
    r"(?:fiyat[ıi]?|aralığı|ortalama(?:sı)?|başına|adet (?:pay|hisse)\w*)\s*:?\s*(?:[\d.,]+\s*(?:tl)?\s*[-–—]\s*)?$"
)
_PRICE_AFTER: Final = re.compile(
    r"^(?:\s*[-–—]\s*[\d.,]+\s*-?\s*(?:tl|₺))?"
    r"\s*(?:/\s*(?:adet|pay|hisse|lot)|['’](?:den|dan)\b|(?:ağırlıklı ortalama )?(?:fiyat(?! teklif)|aralığ))"
)
_CONTEXT: Final = 40
_PRICE_RANGE: Final = re.compile(rf"({_NUM})\s*(?:TL)?\s*[-–—]\s*({_NUM})\s*-?\s*TL\s+fiyat", re.I)
_PRICE_ONE: Final = re.compile(
    rf"({_NUM})\s*-?\s*TL\s+(?:ağırlıklı\s+ortalama\s+)?fiyat|fiyat[ıi]?\s*:?\s*({_NUM})\s*TL",
    re.I,
)
_E1_TABLE: Final = "Geri Alım İşlemlerinin Detayları"
_E2_TABLE: Final = "Pay Alım Satım Bilgileri"
_DATE_BREAK: Final = re.compile(r"(\d{1,2}/\d{1,2})\s*/\s*(\d{4})")
#: 2018-era layout: date, side, nominal, price, value, holding before, % before, holding after, % after.
_OLD_E2_ROW: Final = re.compile(
    rf"\d{{1,2}}/\d{{1,2}}/\d{{4}}\s+(?:Alım|Alış|Satım|Satış)\s*(?:\(\s*\w+\s*\)\s*)?"
    rf"(?P<nominal>{_NUM})\s+(?P<price>{_NUM})\s+(?P<value>{_NUM})\s+"
    rf"(?P<before>{_NUM})\s+%\s*{_NUM}\s+(?P<after>{_NUM})\s+%\s*{_NUM}"
)
_SUM_TOLERANCE: Final = Decimal(1)  # filers round kuruş in the holding columns


@dataclass(frozen=True, slots=True)
class SourceAmounts:
    written: tuple[Decimal, ...] = ()
    derived: tuple[tuple[Decimal, Basis], ...] = ()

    @property
    def values(self) -> tuple[Decimal, ...]:
        return (*self.written, *(value for value, _ in self.derived))


@dataclass(frozen=True, slots=True)
class _Table:
    cells: tuple[Decimal, ...] = ()
    derived: tuple[tuple[Decimal, Basis], ...] = ()
    prices: tuple[Decimal, ...] = ()


def _within(a: Decimal, amount: Decimal) -> bool:
    return abs(a - amount) <= abs(amount) * AMOUNT_TOLERANCE


def amount_basis(amount: Decimal | None, source: SourceAmounts) -> Literal["written"] | Basis | None:
    """Where a confirmed figure came from; the same comparison the gate runs. Written beats derived."""
    if amount is None:
        return None
    if any(_within(a, amount) for a in source.written):
        return "written"
    return next((how for value, how in source.derived if _within(value, amount)), None)


def _to_decimal(raw: str) -> Decimal:
    """1.480,50 and 1,480.50 and 1480.5 are one value. A lone "1.480" is Turkish thousands, "1,48" a decimal."""
    if "," in raw and "." in raw:
        last_comma = raw.rfind(",") > raw.rfind(".")
        return Decimal(raw.replace(".", "").replace(",", ".") if last_comma else raw.replace(",", ""))
    if raw.count(",") > 1:
        return Decimal(raw.replace(",", ""))
    if raw.count(".") > 1 or re.fullmatch(r"\d{1,3}\.\d{3}", raw):
        return Decimal(raw.replace(".", ""))
    return Decimal(raw.replace(",", "."))


def _is_price(flat: str, start: int, end: int) -> bool:
    before = tr_lower(flat[max(0, start - _CONTEXT) : start])
    after = tr_lower(flat[end : end + _CONTEXT])
    return bool(_PRICE_BEFORE.search(before) or _PRICE_AFTER.search(after))


def _unique(values: Iterable[Decimal]) -> tuple[Decimal, ...]:
    out: list[Decimal] = []
    for value in values:
        if value > 0 and value not in out:
            out.append(value)
    return tuple(out)


def text_amounts(text: str, *, skip_prices: bool = False) -> list[Decimal]:
    """The "<amount> TL" figures of a text. `skip_prices`: E1/E2, where "fiyat" can only mean a price per share."""
    flat = " ".join(text.split())
    found = (m for m in _AMOUNT.finditer(flat) if not (skip_prices and _is_price(flat, m.start(), m.end())))
    return list(_unique(_to_decimal(m.group(1)) for m in found))


def regex_amounts(text: str, duration_months: float | None = None) -> list[Decimal]:
    """TL amounts written in the text, plus their monthly equivalents when a duration is stated."""
    found = text_amounts(text)
    if not duration_months or duration_months <= 0:
        return found
    # A model may write the duration as a float (24.0, 24.5); go through str so Decimal stays exact.
    months = Decimal(str(duration_months))
    monthly = (value / months for value in found)
    return list(_unique([*found, *(m.quantize(Decimal(1), rounding=ROUND_HALF_UP) for m in monthly)]))


def _dec(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def _body(text: str) -> str:
    """The notice without its attachment blocks: a table is read from the form, an attachment's from its verified rows."""
    return text.split("[EK ", 1)[0]


def _one_table(body: str, heading: str) -> bool:
    return len(re.findall(label_pattern(heading), body)) == 1


def _buyback_table(body: str, ticker: str) -> _Table:
    if not _one_table(body, _E1_TABLE):
        return _Table()
    rows = [t for t in buyback.parse(body)["transactions"] if t["ticker"] == ticker and t["nominal_try"]]
    if not rows:
        return _Table()
    cells = tuple(t["nominal_try"] for t in rows)
    derived: list[tuple[Decimal, Basis]] = [(sum(cells, Decimal(0)), "table_sum")]
    if rows[-1]["prior_nominal_try"]:
        derived.append((rows[-1]["prior_nominal_try"] + rows[-1]["nominal_try"], "table_cumulative"))
    return _Table(cells, tuple(derived), tuple(t["price_try"] for t in rows if t["price_try"]))


def _old_insider_table(body: str) -> _Table | None:
    """The older form: its own value column, so nothing has to be derived. A row counts only when its sums hold."""
    rows = list(_OLD_E2_ROW.finditer(_DATE_BREAK.sub(r"\1/\2", " ".join(body.split()))))
    if not rows:
        return None
    cells: list[Decimal] = []
    prices: list[Decimal] = []
    for row in rows:
        nominal, price, value = (parse_tr_decimal(row[k]) or Decimal(0) for k in ("nominal", "price", "value"))
        before, after = (parse_tr_decimal(row[k]) or Decimal(0) for k in ("before", "after"))
        if abs(abs(after - before) - nominal) > _SUM_TOLERANCE or not _within(nominal * price, value):
            return _Table()
        cells += [nominal, value]
        prices.append(price)
    return _Table(tuple(cells), (), tuple(prices))


def _row_holds(row: Mapping[str, Any]) -> bool:
    buy, sell = _dec(row.get("buy_nominal_try")), _dec(row.get("sell_nominal_try"))
    net, start, end = (_dec(row.get(k)) for k in ("net_nominal_try", "start_nominal_try", "end_nominal_try"))
    if net is None or start is None or end is None or abs(start + net - end) > _SUM_TOLERANCE:
        return False
    return (buy is None and sell is None) or abs((buy or Decimal(0)) - (sell or Decimal(0)) - net) <= _SUM_TOLERANCE


def _price_mentions(body: str, attachment: AttachmentFacts | None) -> set[tuple[Decimal, Decimal]]:
    flat = " ".join(body.split())
    mentions: set[tuple[Decimal, Decimal]] = set()
    for low, high in _PRICE_RANGE.findall(flat):
        mentions.add((parse_tr_decimal(low) or Decimal(0), parse_tr_decimal(high) or Decimal(0)))
    for one, other in _PRICE_ONE.findall(_PRICE_RANGE.sub(" ", flat)):
        price = parse_tr_decimal(one or other) or Decimal(0)
        mentions.add((price, price))
    if attachment is not None and attachment.price_low is not None and attachment.price_high is not None:
        mentions.add((attachment.price_low, attachment.price_high))
    return mentions


def _nominal_table(rows: Iterable[Mapping[str, Any]], prices: set[tuple[Decimal, Decimal]]) -> _Table:
    """Trade columns only: bought, sold, net, their totals. Holdings are not an amount the Reader may report."""
    listed = list(rows)
    buys = [_dec(r.get("buy_nominal_try")) or Decimal(0) for r in listed]
    sells = [_dec(r.get("sell_nominal_try")) or Decimal(0) for r in listed]
    nets = [abs(_dec(r.get("net_nominal_try")) or Decimal(0)) for r in listed]
    cells = _unique([*buys, *sells, *nets])
    bought, sold = sum(buys, Decimal(0)), sum(sells, Decimal(0))
    totals = _unique((bought, sold, bought + sold, abs(bought - sold)))
    derived: list[tuple[Decimal, Basis]] = [(t, "table_sum") for t in totals if t not in cells]
    if len(prices) != 1:  # none, or the text gives two different ones: no value to compute
        return _Table(cells, tuple(derived), tuple(p for pair in prices for p in pair))
    low, high = next(iter(prices))
    derived += [(t * (low + high) / 2, "nominal_x_price") for t in totals]
    return _Table(cells, tuple(derived), (low, high))


def _insider_table(body: str, attachment: AttachmentFacts | None) -> _Table:
    prices = _price_mentions(body, attachment)
    if attachment is not None and attachment.rows:  # sums already checked by `ingest.parsers.insider_form`
        return _nominal_table(attachment.rows, prices)
    if not _one_table(body, _E2_TABLE):
        return _Table(prices=tuple(p for pair in prices for p in pair))
    old = _old_insider_table(body)
    if old is not None:
        return old
    rows = insider.parse(body)["rows"]
    if not rows or not all(_row_holds(r) for r in rows):
        return _Table(prices=tuple(p for pair in prices for p in pair))
    return _nominal_table(rows, prices)


def read_source(
    event: str,
    text: str,
    ticker: str,
    *,
    duration_months: float | None = None,
    attachment: AttachmentFacts | None = None,
) -> SourceAmounts:
    """Every amount R14 may confirm a Reader figure with, for one disclosure."""
    if event not in ("E1", "E2"):
        return SourceAmounts(written=tuple(regex_amounts(text, duration_months)))
    body = _body(text)
    table = _buyback_table(body, ticker) if event == "E1" else _insider_table(body, attachment)
    written = _unique(a for a in (*text_amounts(text, skip_prices=True), *table.cells) if a not in table.prices)
    derived = tuple((value, how) for value, how in table.derived if value not in written)
    return SourceAmounts(written, derived)


__all__ = ["AMOUNT_TOLERANCE", "SourceAmounts", "amount_basis", "read_source", "regex_amounts", "text_amounts"]
