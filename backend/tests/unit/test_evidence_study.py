"""The event study and price context on synthetic series with hand-computed answers (no Postgres)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from kaptan.evidence.card import evidence_store, market_facts, merge_features
from kaptan.evidence.market import materiality_inputs, price_context, volatility
from kaptan.evidence.params import MIN_ESTIMATION_OBS
from kaptan.evidence.service import ScopedStudy
from kaptan.evidence.sessions import entry_session, event_session, last_known_session
from kaptan.evidence.stats import percentile, summarize
from kaptan.evidence.study import (
    Bar,
    PastEvent,
    Series,
    cluster,
    estimation_days,
    event_cars,
    fit_market_model,
    study,
)
from kaptan.prices.calendar import IST, close_known_at, is_trading_day, next_session

APPROX = 1e-9


# ── synthetic series ────────────────────────────────────────────────────
def walk(start: date, n: int) -> list[date]:
    """`n` consecutive BIST sessions from `start` (holidays skipped by the calendar)."""
    d = start if is_trading_day(start) else next_session(start)
    out = []
    while len(out) < n:
        out.append(d)
        d = next_session(d)
    return out


def build(
    days: Sequence[date], rets: Sequence[float], *, base: float = 100.0, oc: dict[date, float] | None = None
) -> dict[date, Bar]:
    """Closes from close-to-close returns (rets[0] ignored); opens from an open→close return per day."""
    out: dict[date, Bar] = {}
    close = base
    for i, d in enumerate(days):
        if i:
            close *= 1 + rets[i]
        r_oc = (oc or {}).get(d)
        out[d] = Bar(close / (1 + r_oc) if r_oc is not None else close, close)
    return out


def at(d: date, hh: int, mm: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=IST)


def event(ref: str, ticker: str, published: datetime) -> PastEvent:
    return PastEvent(f"evt:{ref}", ticker, f"{ticker} A.Ş.", f"{ticker} – Yeni İş İlişkisi", published, published)


# The hand-computed market-adjusted case (fewer than 120 estimation returns → α = 0, β = 1).
DAYS = walk(date(2025, 6, 2), 40)
T0_IDX = 11  # published days[10] 11:00 → event session days[10], entry days[11] (P5)
STOCK_RETS = [0.0] * 40
BENCH_RETS = [0.0] * 40
STOCK_RETS[12], STOCK_RETS[13], STOCK_RETS[14] = 0.01, -0.005, 0.02
BENCH_RETS[11], BENCH_RETS[12] = 0.01, -0.01
STOCK = build(DAYS, [*STOCK_RETS[:11], 0.03, *STOCK_RETS[12:]], oc={DAYS[11]: 0.03})
BENCH = build(DAYS, BENCH_RETS, base=1000.0, oc={DAYS[11]: 0.01})
#: AR = R_i − R_m: day 1 (open→close) 0.03 − 0.01, then 0.01 + 0.01, −0.005, 0.02, 0 → CAR[1,5] = 0.055.
HAND_CAR = {1: 0.02, 5: 0.055, 20: 0.055}
AS_OF = at(DAYS[T0_IDX + 19], 19)  # the 20-session window closed (18:30) before as_of


def test_sessions_follow_the_publication_time_rule() -> None:
    tue = date(2025, 6, 10)
    assert (event_session(at(tue, 9, 0)), entry_session(at(tue, 9, 0))) == (tue, tue)
    assert (event_session(at(tue, 11, 0)), entry_session(at(tue, 11, 0))) == (tue, date(2025, 6, 11))
    assert (event_session(at(tue, 18, 10)), entry_session(at(tue, 18, 10))) == (tue, date(2025, 6, 11))
    assert (event_session(at(tue, 18, 45)), entry_session(at(tue, 18, 45))) == (date(2025, 6, 11),) * 2
    sat = date(2025, 6, 14)
    assert event_session(at(sat, 11)) == entry_session(at(sat, 11)) == date(2025, 6, 16)
    # the close is known at 18:30: before that the last known session is the previous one
    # (Thu 5 Jun 2025, the arife half day: Kurban Bayramı closes 6–9 June)
    assert last_known_session(at(tue, 18, 29)) == date(2025, 6, 5)
    assert last_known_session(at(tue, 18, 31)) == tue
    assert last_known_session(at(sat, 12)) == date(2025, 6, 13)
    with pytest.raises(ValueError, match="timezone-aware"):
        event_session(datetime(2025, 6, 10, 11))


def test_stats_match_hand_values() -> None:
    s = summarize(5, [0.01, 0.02, 0.03, 0.04, 0.05])
    assert (s.n, s.mean, s.median, s.hit_rate) == (5, pytest.approx(0.03), pytest.approx(0.03), 1.0)
    assert s.sd == pytest.approx(0.0158113883)
    assert s.t_stat == pytest.approx(4.2426406871)  # 0.03 / (0.01581 / √5)
    assert (s.p25, s.p75, s.iqr) == (pytest.approx(0.02), pytest.approx(0.04), pytest.approx(0.02))
    assert s.p10 == pytest.approx(0.014) and s.p90 == pytest.approx(0.046)
    assert s.ci95[0] == pytest.approx(0.03 - 1.959964 * 0.0158113883 / 5**0.5)
    one = summarize(1, [-0.01])
    assert (one.sd, one.t_stat, one.ci95, one.hit_rate) == (None, None, (-0.01, -0.01), 0.0)
    flat = summarize(1, [0.01, 0.01])
    assert flat.sd == 0 and flat.t_stat is None
    with pytest.raises(ValueError):
        summarize(1, [])
    with pytest.raises(ValueError):
        percentile([], 0.5)
    with pytest.raises(ValueError):
        percentile([1.0], 1.5)


def test_hand_computed_car_market_adjusted() -> None:
    ev = event("a", "TSTAA", at(DAYS[10], 11))
    res = study([ev], {"TSTAA": STOCK}, BENCH, AS_OF, (1, 5, 20))
    assert res.n == 1
    r = res.results[0]
    assert r.t0 == DAYS[T0_IDX] and r.model.kind == "market_adj" and r.model.n_obs < MIN_ESTIMATION_OBS
    assert r.cars == {h: pytest.approx(v, abs=APPROX) for h, v in HAND_CAR.items()}
    assert res.stats[5].mean == pytest.approx(0.055)


def test_market_model_recovers_alpha_beta_and_car() -> None:
    days = walk(date(2024, 1, 2), 300)
    alpha, beta = 0.001, 1.5
    rb = [0.01 * (((i * 7) % 11) - 5) / 5 for i in range(300)]
    rs = [alpha + beta * b for b in rb]
    ar = {281: 0.01, 282: 0.0, 283: -0.002, 284: 0.005}
    for i, a in ar.items():
        rs[i] += a
    es = days[280]  # published 08:30 → event session = entry session (P5)
    bench = build(days, rb, base=1000.0, oc={es: 0.004})
    stock = build(days, rs, oc={es: alpha + beta * 0.004 + 0.03})
    model = fit_market_model(stock, bench, estimation_days(es))
    assert model.kind == "market_model" and model.n_obs == 221
    assert (model.alpha, model.beta) == (pytest.approx(alpha, abs=APPROX), pytest.approx(beta, abs=APPROX))
    cars = event_cars(stock, bench, es, (1, 5), model)
    assert cars == {1: pytest.approx(0.03, abs=APPROX), 5: pytest.approx(0.043, abs=APPROX)}
    # removing estimation days (other events, bonus issues) shrinks the sample, the fit stays exact
    fewer = fit_market_model(stock, bench, estimation_days(es, {days[100], days[101]}))
    assert fewer.n_obs == 219 and fewer.beta == pytest.approx(beta)
    # a flat benchmark has no variance → market-adjusted
    flat = build(days, [0.0] * 300, base=1000.0)
    assert fit_market_model(stock, flat, estimation_days(es)).kind == "market_adj"


def test_holiday_gap_moves_entry_and_window() -> None:
    # Fri 28 Mar 2025 11:00; Ramazan Bayramı closes Mon 31 Mar + Tue 1 Apr → entry Wed 2 Apr.
    days = walk(date(2025, 3, 3), 45)
    assert date(2025, 3, 31) not in days and date(2025, 4, 1) not in days
    ev = event("h", "TSTHH", at(date(2025, 3, 28), 11))
    t0 = entry_session(ev.published_at)
    assert t0 == date(2025, 4, 2)
    k = days.index(t0)
    rets = [0.0] * 45
    rets[k + 1] = 0.02  # Thu 3 Apr: close-to-close against Wed 2 Apr
    stock = build(days, rets, oc={t0: 0.01})
    bench = build(days, [0.0] * 45, base=1000.0)
    res = study([ev], {"TSTHH": stock}, bench, at(days[k + 19], 19), (1, 5, 20))
    assert res.results[0].cars[1] == pytest.approx(0.01) and res.results[0].cars[5] == pytest.approx(0.03)
    # a missing bar inside the window drops the event instead of inventing a return
    gap = {d: b for d, b in stock.items() if d != days[k + 2]}
    assert study([ev], {"TSTHH": gap}, bench, at(days[k + 19], 19), (1, 5)).dropped["no_prices"] == 1


def test_no_look_ahead() -> None:
    ev = event("a", "TSTAA", at(DAYS[10], 11))
    # one minute before the 20th session's close is final: the window is still open → excluded
    early = close_known_at(DAYS[T0_IDX + 19]) - timedelta(minutes=1)
    res = study([ev], {"TSTAA": STOCK}, BENCH, early, (1, 5, 20))
    assert res.n == 0 and res.dropped["window_open"] == 1 and res.stats == {}
    # the shorter horizons alone would be complete, and then the event counts
    assert study([ev], {"TSTAA": STOCK}, BENCH, early, (1, 5)).n == 1
    # an event not yet available at as_of never enters
    late = PastEvent("evt:f", "TSTAA", "x", "x", at(DAYS[10], 11), AS_OF)
    assert study([late], {"TSTAA": STOCK}, BENCH, AS_OF, (1,)).dropped["future"] == 1
    # bars after as_of cannot change a closed window's CAR (only past sessions are summed)
    wild = {**STOCK, next_session(DAYS[-1]): Bar(1.0, 1000.0)}
    assert study([ev], {"TSTAA": wild}, BENCH, AS_OF, (1, 5, 20)).results[0].cars[5] == pytest.approx(0.055)


def test_cluster_counts_repeats_once_and_bad_inputs() -> None:
    a = event("1", "TSTAA", at(DAYS[2], 11))
    b = event("2", "TSTAA", at(DAYS[5], 11))  # 3 sessions later → same cluster
    c = event("3", "TSTBB", at(DAYS[5], 11))
    d = event("4", "TSTAA", at(DAYS[20], 11))  # 18 sessions later → new event
    assert [e.ref_id for e in cluster([d, c, b, a])] == ["evt:1", "evt:3", "evt:4"]
    with pytest.raises(ValueError, match="horizons"):
        study([a], {}, {}, AS_OF, (0,))
    old = event("o", "TSTAA", datetime(2017, 6, 1, 11, tzinfo=IST))
    assert study([old], {}, {}, AS_OF, (1,)).dropped["out_of_calendar"] == 1
    # the first weeks of 2018 have a clipped estimation window (→ market-adjusted, not dropped)
    assert len(estimation_days(date(2018, 2, 1))) == 0
    assert 0 < len(estimation_days(date(2018, 9, 3))) < 221


def test_too_few_events_is_insufficient_and_none_is_no_card() -> None:
    evs = [event(str(i), f"TST{c}", at(DAYS[10], 11)) for i, c in enumerate("ABC")]
    series: dict[str, Series] = {f"TST{c}": STOCK for c in "ABC"}
    res = study(evs, series, BENCH, AS_OF, (1, 5, 20))
    scoped = ScopedStudy("market", "TSTA", "E3", res)
    assert res.n == 3 and not scoped.sufficient
    store = evidence_store(scoped)
    assert store is not None and store["strength"] == "insufficient"
    stats = store["stats"]
    assert (stats["n"], stats["n_same_ticker"], stats["mean_car_5d"], stats["hit_rate_5d"]) == (3, 1, 0.055, 1.0)
    assert stats["ref_id"].startswith("stats:") and stats["dispersion_iqr_20d"] == 0.0
    assert store["events"][0]["car_1d"] == 0.02 and store["events"][0]["car_60d"] is None
    assert store["retrieved_ids"] == [e["ref_id"] for e in store["events"]]
    empty = ScopedStudy("market", "TSTA", "E3", study([], {}, BENCH, AS_OF, (1, 5, 20)))
    assert evidence_store(empty) is None


def test_price_context_levels_returns_runup_and_actions() -> None:
    session = DAYS[T0_IDX + 3]
    raw = {"close": Decimal("106.5"), "mcap_try": Decimal("1e9"), "free_float_mcap_try": None, "capital_try": 5e7}
    actions = [
        {"ex_date": DAYS[T0_IDX], "kind": "bedelsiz", "factor": Decimal("0.5"), "announced_at": None},
        {"ex_date": DAYS[30], "kind": "temettu", "factor": Decimal("0.98"), "announced_at": AS_OF - timedelta(days=60)},
        {"ex_date": DAYS[31], "kind": "bedelli", "factor": Decimal("0.9"), "announced_at": None},  # not announced
    ]
    pc = price_context(
        "TSTAA",
        at(session, 19),
        session,
        next_session(session),
        STOCK,
        BENCH,
        last_raw=raw,
        adv20_try=Decimal(2_000_000),
        actions=actions,
    )
    assert pc.last_close_try == Decimal("106.5") and pc.adv20_try == Decimal(2_000_000)
    assert pc.returns[1] == pytest.approx(0.02)  # DAYS[14] close / DAYS[13] close
    assert pc.returns[5] == pytest.approx(1.03 * 1.01 * 0.995 * 1.02 - 1)
    assert pc.ret_3m is None and pc.returns[20] is None  # the series is too short: unknown, not a guess
    # run-up [−5, −1] before the event session (= the 5 sessions ending at `session`), vs XU100
    assert pc.ret_5d_mkt_adj == pytest.approx((1.03 * 1.01 * 0.995 * 1.02 - 1) - (1.01 * 0.99 - 1))
    assert pc.vol_20d is None  # only 14 returns in the window
    assert [a.kind for a in pc.recent_actions] == ["bedelsiz"] and [a.kind for a in pc.upcoming_actions] == ["temettu"]
    assert pc.flags == {
        "recent_bonus_or_split": True,
        "recent_rights_issue": False,
        "recent_dividend": False,
        "upcoming_corporate_action": True,
    }
    mi = materiality_inputs(raw)
    assert mi.unknown == ("free_float_mcap_try", "annual_revenue_try") and mi.annual_revenue_try is None
    facts = market_facts(pc, mi)
    assert facts["last_close_try"] == 106.5 and facts["market_cap_try"] == 1e9
    assert "annual_revenue_try" not in facts and "ret_3m" not in facts
    assert merge_features(pc)["ret_3m"] is None and merge_features(None) == {} and market_facts(None, None) == {}
    long_days = walk(date(2025, 1, 2), 30)
    noisy = build(long_days, [0.0, *[0.01 * (-1) ** i for i in range(29)]])
    assert volatility(noisy, long_days[-1]) == pytest.approx(0.0102597835, rel=1e-6)
