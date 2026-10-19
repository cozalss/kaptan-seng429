"""BIST tick table and ±10 % price limits (06 R09, U6; kaptan.market.ticks)."""

from __future__ import annotations

from decimal import Decimal as D  # noqa: N817

import pytest

from kaptan.market.ticks import (
    ceil_to_tick,
    floor_to_tick,
    limit_up_locked,
    price_limits,
    step_down,
    tick_ratio_ok,
    tick_size,
)


@pytest.mark.parametrize(
    ("price", "tick"),
    [
        ("0.50", "0.01"),
        ("19.99", "0.01"),
        ("20.00", "0.02"),
        ("49.98", "0.02"),
        ("50.00", "0.05"),
        ("99.95", "0.05"),
        ("100.00", "0.10"),
        ("249.90", "0.10"),
        ("250.00", "0.25"),
        ("499.75", "0.25"),
        ("500.00", "0.50"),
        ("1000.00", "1.00"),
        ("2499.00", "1.00"),
        ("2500.00", "2.50"),
        ("9000.00", "2.50"),
    ],
)
def test_tick_table_ranges(price: str, tick: str) -> None:
    assert tick_size(D(price)) == D(tick)


def test_rounding_to_the_grid_and_the_band_edges() -> None:
    assert floor_to_tick(D("50.49")) == D("50.45") and ceil_to_tick(D("50.41")) == D("50.45")
    assert floor_to_tick(D("19.999")) == D("19.99")  # stays in the 0.01 range
    assert ceil_to_tick(D("49.99")) == D("50.00")  # crosses into the 0.05 range on a valid price
    assert ceil_to_tick(D("249.95")) == D("250.00")
    # one tick below a range boundary uses the step of the range below
    assert step_down(D("50.00")) == D("49.98") and step_down(D("100.00")) == D("99.95")
    assert step_down(D("250.00")) == D("249.90") and step_down(D("50.05")) == D("50.00")
    assert step_down(D("20.00")) == D("19.99") and step_down(D("2500.00")) == D("2499.00")
    with pytest.raises(ValueError, match="positive"):
        tick_size(D(0))


@pytest.mark.parametrize(
    ("base", "lower", "upper"),
    [
        ("100.00", "90.00", "110.00"),
        ("45.50", "40.96", "50.05"),  # ceiling crosses into the 0.05 range, floor rounded up to 0.02
        ("18.50", "16.65", "20.34"),  # 20.35 is not a 0.02 step → rounded down (inside ±10 %)
        ("47.40", "42.66", "52.10"),  # demo E3 price: replay keeps 52.14 (last × 1.1), live is on the grid
        ("2300.00", "2070.00", "2530.00"),
        ("2280.00", "2052.00", "2507.50"),  # 2508.00 is not a 2.50 step
    ],
)
def test_price_limits_are_inside_ten_percent(base: str, lower: str, upper: str) -> None:
    lo, hi = price_limits(D(base))
    assert (lo, hi) == (D(lower), D(upper))
    assert lo >= D(base) * D("0.9") and hi <= D(base) * D("1.1")
    assert floor_to_tick(hi) == hi and ceil_to_tick(lo) == lo
    with pytest.raises(ValueError, match="positive"):
        price_limits(D(0))


def test_tick_ratio_and_limit_up_lock() -> None:
    assert tick_ratio_ok(D("20.00")) and not tick_ratio_ok(D("3.50"))  # 0.01 / 3.50 = 0.29 % > 0.25 %
    assert limit_up_locked(D("110.00"), D("110.00"), D("110.00"), D("110.00"))
    assert not limit_up_locked(D("110.00"), D("104.00"), D("110.00"), D("110.00"))
    assert not limit_up_locked(None, None, D("110.00"), D("110.00"))
