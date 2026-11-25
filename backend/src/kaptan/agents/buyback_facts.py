"""What the code reads from an E1 form, and how it holds the Reader to it.

A buyback form repeats the whole programme in its table: every earlier trade day comes back in each new notice, so a
programme a few months old lists 30 to 90 rows. Copying those rows was the Reader's job, and once a table outgrew
the Reader's output budget every model's answer was cut off mid-JSON, the whole chain failed and the run stopped as
"agent failed" (HOLD) although nothing about the notice was unclear. The Reader now writes only the newest trade
day; the rows come from the form, read by code (`source_amounts.buyback_rows`), and overwrite what the model wrote,
as `reader_facts.ground_insider` does for an E2 attachment. A form whose table the code cannot read keeps the
Reader's own rows.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Final

from kaptan.agents.source_amounts import buyback_rows

#: The Reader's trace row when the table came from the form, not from the model.
TABLE_STEP_NOTE: Final = "İşlem satırları formdaki tablodan kodla alındı"


def _num(x: Decimal | None) -> int | float | None:
    if x is None:
        return None
    return int(x) if x == x.to_integral_value() else float(x)


def _price_raw(price: Decimal | None) -> str:
    """The price as the form writes it (Turkish decimal comma); empty when the row has none."""
    return "" if price is None else format(price.normalize(), "f").replace(".", ",")


def table_transactions(text: str, ticker: str) -> list[dict[str, Any]]:
    """The form's rows in the Reader's `BuybackTxn` shape (empty: the code could not read a table)."""
    return [
        {
            "trade_date": row["date"].isoformat(),
            "nominal_tl": _num(row["nominal_try"]),
            "capital_pct": _num(row["capital_ratio_pct"]),
            "price_tl": _num(row["price_try"]) if row["price_try"] and row["price_try"] > 0 else None,
            "price_raw": _price_raw(row["price_try"]),
            "prior_nominal_in_program_tl": _num(row["prior_nominal_try"]),
        }
        for row in buyback_rows(text, ticker)
        if row["date"] is not None
    ]


def ground_buyback(answer: dict[str, Any], text: str, ticker: str) -> tuple[dict[str, Any], bool]:
    """The Reader's E1 answer with the form's rows in place of its own; True when the rows came from the form."""
    if answer.get("kind") != "E1" or answer.get("status") != "ok":
        return answer, False
    rows = table_transactions(text, ticker)
    if not rows:
        return answer, False
    return {**answer, "transactions": rows}, True


__all__ = ["TABLE_STEP_NOTE", "ground_buyback", "table_transactions"]
