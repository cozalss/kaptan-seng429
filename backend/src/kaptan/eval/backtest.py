"""Backtest harness (FR-37, 08 §3, §5): the decisions of each arm, replayed day by day with no look-ahead.

    python -m kaptan.eval.backtest --data history.json --from 2024-01-01 --to 2025-12-31 \
        --arms kaptan,no_approval,rules_only,bist100,equal_weight,subject_only

Input (JSON, see `Dataset.load`): session prices per ticker (`[date, open, close]`), the BIST-100 close
series, and the historical disclosures with their `available_at`, subject and, per arm, the pipeline's
recorded decision (`kaptan`: rules + evidence + sizer + gate on replay/fixture LLM outputs; `rules_only`:
the same deterministic pipeline without the LLM agents) plus the human decision (`human`).

Arms:
- `kaptan`: PROPOSE + simulated approval (the recorded `human` decision; missing = approve).
- `no_approval`: the ablation, every PROPOSE executes.
- `rules_only`: the deterministic arm's PROPOSE, approved like `kaptan`.
- `subject_only`: buy every disclosure whose subject routes to E1–E4 (no rules, no gate).
- `free_llm`: a free-form LLM's buy/no-buy; needs a key and recorded answers, otherwise skipped.
- `bist100`: buy-and-hold the index; `equal_weight`: buy-and-hold every ticker, equal weight.

No look-ahead: a disclosure is acted on at the open of the first session that starts after its
`available_at` (09:55 Istanbul cut), the exit is the close `holding_days` sessions later, and a decision
may only read the row it came with. Costs are bps per side on the traded notional.
"""

from __future__ import annotations

import argparse
import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Final

from kaptan.agents.subject_map import route_of
from kaptan.prices.calendar import IST

TRADING_DAYS: Final = 252
OPEN_CUT: Final = time(9, 55)
EVENT_ARMS: Final = ("kaptan", "no_approval", "rules_only", "subject_only", "free_llm")
BENCH_ARMS: Final = ("bist100", "equal_weight")
ALL_ARMS: Final = EVENT_ARMS + BENCH_ARMS


@dataclass(frozen=True, slots=True)
class Event:
    event_id: str
    ticker: str
    available_at: datetime
    subject: str
    decisions: Mapping[str, Mapping[str, Any]]  # arm → {"outcome", "holding_days"}
    human: str | None = None  # approve | reject | None (= approve)


@dataclass(frozen=True, slots=True)
class Dataset:
    sessions: tuple[date, ...]
    prices: Mapping[str, Mapping[date, tuple[float, float]]]  # ticker → date → (open, close)
    index: Mapping[date, float]
    events: tuple[Event, ...]

    @classmethod
    def from_doc(cls, doc: Mapping[str, Any]) -> Dataset:
        index = {date.fromisoformat(d): float(c) for d, c in doc["index"]}
        prices = {
            t: {date.fromisoformat(d): (float(o), float(c)) for d, o, c in rows} for t, rows in doc["prices"].items()
        }
        events = tuple(
            Event(
                event_id=str(e["id"]),
                ticker=str(e["ticker"]),
                available_at=datetime.fromisoformat(e["available_at"]),
                subject=str(e.get("subject", "")),
                decisions=dict(e.get("decisions", {})),
                human=e.get("human"),
            )
            for e in doc["events"]
        )
        if any(e.available_at.tzinfo is None for e in events):
            raise ValueError("available_at must be tz-aware")
        return cls(tuple(sorted(index)), prices, index, events)

    @classmethod
    def load(cls, path: Path) -> Dataset:
        with path.open(encoding="utf-8") as fh:
            return cls.from_doc(json.load(fh))

    def window(self, start: date, end: date) -> Dataset:
        sessions = tuple(d for d in self.sessions if start <= d <= end)
        return Dataset(sessions, self.prices, self.index, self.events)


@dataclass(frozen=True, slots=True)
class Params:
    capital: float = 1_000_000.0
    position_pct: float = 0.10
    cost_bps: float = 20.0  # per side (commission + spread + slippage, 06 §7)
    default_holding: int = 5


@dataclass(frozen=True, slots=True)
class Trade:
    event_id: str
    ticker: str
    entry: date
    exit: date
    notional: float
    gross_return: float
    cost: float

    @property
    def net_pnl(self) -> float:
        return self.notional * self.gross_return - self.cost


@dataclass(frozen=True, slots=True)
class ArmResult:
    arm: str
    equity: tuple[float, ...]
    trades: tuple[Trade, ...] = ()
    skipped: str | None = None
    metrics: Mapping[str, float | None] = field(default_factory=dict)


def entry_session(sessions: Sequence[date], available_at: datetime) -> date | None:
    """The first session whose open is after `available_at` (no look-ahead)."""
    local = available_at.astimezone(IST)
    day, before_open = local.date(), local.time() < OPEN_CUT
    for d in sessions:
        if d > day or (d == day and before_open):
            return d
    return None


def wants_trade(arm: str, e: Event) -> bool:
    if arm == "subject_only":
        return route_of(e.subject)[0] in ("E1", "E2", "E3", "E4")
    source = "kaptan" if arm == "no_approval" else arm
    if (e.decisions.get(source) or {}).get("outcome") != "PROPOSE":
        return False
    return arm == "no_approval" or e.human != "reject"  # simulated approval: the recorded human decision


def _holding(arm: str, e: Event, p: Params) -> int:
    source = "kaptan" if arm in ("no_approval", "subject_only") else arm
    return int((e.decisions.get(source) or {}).get("holding_days") or p.default_holding)


def simulate_events(arm: str, ds: Dataset, p: Params) -> ArmResult:
    sessions = list(ds.sessions)
    pos = {d: i for i, d in enumerate(sessions)}
    cash, trades = p.capital, []
    open_: list[tuple[Trade, float]] = []  # (trade, shares)
    equity: list[float] = []
    by_entry: dict[date, list[Event]] = {}
    for e in sorted(ds.events, key=lambda x: (x.available_at, x.event_id)):
        d = entry_session(sessions, e.available_at)
        if d is not None and wants_trade(arm, e):
            by_entry.setdefault(d, []).append(e)
    for i, d in enumerate(sessions):
        for e in by_entry.get(d, []):
            bar = ds.prices.get(e.ticker, {}).get(d)
            exit_i = i + _holding(arm, e, p)
            if bar is None or exit_i >= len(sessions):
                continue
            mark = cash + sum(sh * ds.prices[t.ticker].get(d, (0, 0))[0] for t, sh in open_)
            notional = min(mark * p.position_pct, cash / (1 + p.cost_bps / 1e4))
            if notional <= 0:
                continue
            cost_in = notional * p.cost_bps / 1e4
            cash -= notional + cost_in
            t = Trade(e.event_id, e.ticker, d, sessions[exit_i], notional, 0.0, cost_in)
            open_.append((t, notional / bar[0]))
        still: list[tuple[Trade, float]] = []
        for t, sh in open_:
            if t.exit == d:
                value = sh * ds.prices[t.ticker][d][1]
                cost_out = value * p.cost_bps / 1e4
                cash += value - cost_out
                trades.append(
                    Trade(t.event_id, t.ticker, t.entry, t.exit, t.notional, value / t.notional - 1, t.cost + cost_out)
                )
            else:
                still.append((t, sh))
        open_ = still
        equity.append(cash + sum(sh * _close(ds, t.ticker, d, sessions, pos) for t, sh in open_))
    return ArmResult(arm, tuple(equity), tuple(trades))


def _close(ds: Dataset, ticker: str, d: date, sessions: list[date], pos: Mapping[date, int]) -> float:
    """Last known close at or before `d` (a missing bar carries the previous close forward)."""
    series = ds.prices[ticker]
    for j in range(pos[d], -1, -1):
        bar = series.get(sessions[j])
        if bar is not None:
            return bar[1]
    return 0.0


def simulate_benchmark(arm: str, ds: Dataset, p: Params) -> ArmResult:
    s = list(ds.sessions)
    if arm == "bist100":
        base = ds.index[s[0]]
        return ArmResult(arm, tuple(p.capital * ds.index[d] / base for d in s))
    tickers = [t for t in sorted(ds.prices) if s[0] in ds.prices[t]]
    pos = {d: i for i, d in enumerate(s)}
    w = p.capital / len(tickers) if tickers else 0.0
    shares = {t: w / ds.prices[t][s[0]][1] for t in tickers}
    return ArmResult(arm, tuple(sum(shares[t] * _close(ds, t, d, s, pos) for t in tickers) for d in s))


def metrics(r: ArmResult, p: Params) -> dict[str, float | None]:
    eq = r.equity
    if len(eq) < 2:
        return {"cagr": None, "sharpe": None, "max_dd": None, "hit_rate": None, "turnover": None, "cost_drag_bps": None}
    years = (len(eq) - 1) / TRADING_DAYS
    cagr = (eq[-1] / eq[0]) ** (1 / years) - 1 if eq[0] > 0 and eq[-1] > 0 else None
    rets = [eq[i] / eq[i - 1] - 1 for i in range(1, len(eq))]
    mean = sum(rets) / len(rets)
    sd = math.sqrt(sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)) if len(rets) > 1 else 0.0
    peak, mdd = eq[0], 0.0
    for v in eq:
        peak = max(peak, v)
        mdd = max(mdd, 1 - v / peak)
    trades = r.trades
    avg_eq = sum(eq) / len(eq)
    traded = sum(t.notional + t.notional * (1 + t.gross_return) for t in trades)
    return {
        "cagr": None if cagr is None else round(cagr, 6),
        "sharpe": round(mean / sd * math.sqrt(TRADING_DAYS), 4) if sd > 0 else None,
        "max_dd": round(mdd, 6),
        "hit_rate": round(sum(t.net_pnl > 0 for t in trades) / len(trades), 4) if trades else None,
        "turnover": round(traded / avg_eq / years, 4) if trades else 0.0,
        "cost_drag_bps": round(sum(t.cost for t in trades) / avg_eq / years * 1e4, 2) if trades else 0.0,
        "n_trades": float(len(trades)),
    }


def run(
    ds: Dataset, arms: Sequence[str], p: Params | None = None, *, free_llm_key: str | None = None
) -> list[ArmResult]:
    params = p or Params()
    out: list[ArmResult] = []
    for arm in arms:
        if arm not in ALL_ARMS:
            raise ValueError(f"unknown arm {arm!r} (one of {', '.join(ALL_ARMS)})")
        if arm == "free_llm" and (not free_llm_key or not any("free_llm" in e.decisions for e in ds.events)):
            out.append(ArmResult(arm, (), skipped="no key or no recorded free-LLM answers"))
            continue
        r = simulate_benchmark(arm, ds, params) if arm in BENCH_ARMS else simulate_events(arm, ds, params)
        out.append(ArmResult(r.arm, r.equity, r.trades, None, metrics(r, params)))
    return out


def report(results: Sequence[ArmResult]) -> dict[str, Any]:
    return {r.arm: ({"skipped": r.skipped} if r.skipped else dict(r.metrics)) for r in results}


def main(argv: Sequence[str] | None = None) -> int:
    import os

    ap = argparse.ArgumentParser(prog="python -m kaptan.eval.backtest", description=__doc__.split("\n")[0])
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--from", dest="start", type=date.fromisoformat, required=True)
    ap.add_argument("--to", dest="end", type=date.fromisoformat, required=True)
    ap.add_argument("--arms", default=",".join(a for a in ALL_ARMS if a != "free_llm"))
    ap.add_argument("--out", type=Path, default=None)
    ns = ap.parse_args(argv)
    ds = Dataset.load(ns.data).window(ns.start, ns.end)
    results = run(ds, [a.strip() for a in ns.arms.split(",") if a.strip()], free_llm_key=os.environ.get("GROQ_API_KEY"))
    doc = json.dumps(report(results), indent=2)
    if ns.out is not None:
        ns.out.parent.mkdir(parents=True, exist_ok=True)
        ns.out.write_text(doc, encoding="utf-8")
    print(doc)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
