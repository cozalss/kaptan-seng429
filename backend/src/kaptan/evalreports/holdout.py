"""The holdout run (12 §1, 06 §12.4–12.6): 2025-01-01 → 2026-10-31, once, by one explicit, audited action.

    python -m kaptan.evalreports.holdout status
    python -m kaptan.evalreports.holdout run --confirm "HOLDOUT BIR KEZ" --actor sahip

Nothing else reads this period's returns: `core.event_returns` holds no row of it and the evidence reads skip it
until the `main` row of `core.holdout_runs` exists (`kaptan.evidence.holdout`). The run computes in memory and
writes the row and its audit record in one transaction; the primary key refuses a second one, so a crash leaves
nothing behind and a repeat leaves nothing changed. Canon's complete-window rule (06 §12.1): `main` holds the
(event, primary window) pairs closed before it ran; one `completion` run may later report the pairs closed after,
separately, with the same code. Its result never replaces `main`.

Per type: independent events (06 §12.3 clustering) at the primary window (E1/E2 CAR[1,20], E3/E4 CAR[1,5]);
CAR_net = CAR − round_trip_used of §8 (base %0,05 / side, sensitivity %0,20 / side); a type passes when
mean(CAR_net) > 0, BMP–KP t ≥ 2,0 and n ≥ 30 in the base scenario (12 §1, 06 §12.6). The Holm-adjusted p of the four
primary tests is reported beside them. Zero or negative is a valid result; nothing here can be rerun to improve it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import random
import statistics
import subprocess
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from decimal import Decimal
from itertools import combinations
from typing import Any, Final

from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from kaptan.audit.writer import AuditDraft, append
from kaptan.db import DictConn
from kaptan.evidence import repo
from kaptan.evidence.holdout import EVENT_ROW_SQL, HOLDOUT_END, HOLDOUT_START, IN_HOLDOUT_SQL
from kaptan.evidence.inference import bmp_kp_t, holm, two_sided_p
from kaptan.evidence.params import CLUSTER_SESSIONS, ESTIMATION_WINDOW
from kaptan.evidence.sessions import event_session, last_known_session
from kaptan.evidence.study import (
    EventResult,
    MarketModel,
    PastEvent,
    Series,
    close_return,
    estimation_days,
    study,
)
from kaptan.prices.calendar import add_sessions, close_known_at, prev_session
from kaptan.prices.reads import adv20
from kaptan.reference._sql import fetch_all, fetch_one
from kaptan.sizing.costs import HLC, cost_model, daily_sigma, median_cs_spread
from kaptan.sizing.params import DEFAULT_SIZING, SizingParams

log = logging.getLogger("kaptan.evalreports.holdout")

CONFIRM_PHRASE: Final = "HOLDOUT BIR KEZ"
PREREG_TAG: Final = "rules-v1.0-prereg"
MAIN: Final = "main"
COMPLETION: Final = "completion"
TYPES: Final = ("E1", "E2", "E3", "E4")
T_MIN: Final = 2.0
N_MIN: Final = 30
#: 06 §12.4: the two cost scenarios of every result.
BASE: Final = DEFAULT_SIZING
SENSITIVITY: Final = replace(DEFAULT_SIZING, c_broker=Decimal("0.002"))
#: 12 §4: the top of the small-real-money band; only the market-impact term of the cost reads it.
REFERENCE_EQUITY_TRY: Final = Decimal(50_000)
#: Operational, not a strategy threshold: KAP may never answer for a few old notices.
MAX_MISSING_TEXT_SHARE: Final = 0.01
#: Kolari–Pynnönen r̄ from a seeded sample of event pairs (all pairs of 3 000 events would be 4.5 M).
KP_PAIRS: Final = 3000
KP_MIN_OVERLAP: Final = 30
EVENT_DEFINITION: Final = (
    "KAP subject map + kaptan.evidence.holdout (E1 executed, E2 net purchase with a readable table). The 06 §3 trigger "
    "thresholds are not applied: E2 role, E3 materiality/status, E4 SUE/tone need the Reader, history has no answer."
)

EVENTS_SQL: Final = f"""
SELECT d.disclosure_index, d.primary_ticker AS ticker, d.company_name, d.subject, d.published_at, d.available_at
  FROM core.disclosures d
 WHERE {EVENT_ROW_SQL} AND {IN_HOLDOUT_SQL}
   AND (d.subject_route = %(code)s OR d.classification ->> 'event_type' = %(code)s)
   AND d.available_at < %(as_of)s
 ORDER BY d.published_at, d.disclosure_index
"""  # noqa: S608 - module constants only
BARS_SQL: Final = """
SELECT DISTINCT ON (d) d, adj_high, adj_low, adj_close FROM core.prices_daily_adj
 WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'isyatirim' AND d BETWEEN %(lo)s AND %(hi)s
 ORDER BY d, ticker <> %(t)s
"""
RUN_SQL: Final = "SELECT * FROM core.holdout_runs WHERE kind = %s"
INSERT_RUN_SQL: Final = """
INSERT INTO core.holdout_runs (kind, started_at, finished_at, as_of, actor, rules_hash, git_sha, prereg_ref, report)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
"""
MISSING_DAYS_SQL: Final = """
SELECT count(*)::int AS n FROM ops.ingestion_runs
 WHERE job = 'kap_backfill' AND status = 'done' AND key = ANY(%s::text[])
"""
TEXTS_SQL: Final = f"""
SELECT count(*)::int AS total,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM core.disclosure_texts t WHERE t.disclosure_index = d.disclosure_index AND t.lang = 'tr'
       ))::int AS missing
  FROM core.disclosures d
 WHERE d.origin = 'kap' AND {IN_HOLDOUT_SQL}
   AND (d.subject_route = 'E1' OR (d.subject_route = 'E2' AND d.disclosure_class = 'ODA'))
"""  # noqa: S608 - module constants only
PRICES_DONE_SQL: Final = (
    "SELECT count(*)::int AS n FROM ops.ingestion_runs WHERE job = 'archive_prices' AND status = 'done'"
)


class HoldoutRefusedError(RuntimeError):
    """The run did not start, and nothing was read or written. The message says why."""


@dataclass(frozen=True, slots=True)
class Outcome:
    """One independent event at its primary window."""

    car: float
    sigma: float | None  # sd of the market-model residuals over the estimation window
    cost_base: float
    cost_sensitivity: float
    open_known: bool
    costs_known: bool


# ── statistics (pure) ─────────────────────────────────────────────────────────────────────────────


def t_stat(values: Sequence[float]) -> float | None:
    if len(values) < 2:
        return None
    sd = statistics.stdev(values)
    return None if sd == 0 else statistics.fmean(values) / (sd / math.sqrt(len(values)))


def scenario(outcomes: Sequence[Outcome], cost_of: str, horizon: int, mean_corr: float) -> dict[str, Any]:
    """One cost scenario of a type: means, the cross-sectional t and the BMP–KP t of the standardised CAR_net."""
    nets = [o.car - float(getattr(o, cost_of)) for o in outcomes]
    scars = [(o.car - float(getattr(o, cost_of))) / (o.sigma * math.sqrt(horizon)) for o in outcomes if o.sigma]
    t_kp: float | None
    try:
        t_kp = bmp_kp_t(scars, mean_corr)
    except ValueError:  # fewer than two standardisable events, no dispersion
        t_kp = None
    n = len(outcomes)
    mean_net = statistics.fmean(nets) if nets else None
    return {
        "mean_car": statistics.fmean(o.car for o in outcomes) if outcomes else None,
        "mean_car_net": mean_net,
        "median_car_net": statistics.median(nets) if nets else None,
        "sd_car_net": statistics.stdev(nets) if n > 1 else None,
        "hit_rate_net": sum(x > 0 for x in nets) / n if n else None,
        "t_cross": t_stat(nets),
        "t_bmp_kp": t_kp,
        "n_standardised": len(scars),
        "mean_correlation": mean_corr,
        "passed": mean_net is not None and mean_net > 0 and t_kp is not None and t_kp >= T_MIN and n >= N_MIN,
    }


def type_report(outcomes: Sequence[Outcome], horizon: int, mean_corr: float) -> dict[str, Any]:
    return {
        "horizon": horizon,
        "n": len(outcomes),
        "open_unknown": sum(not o.open_known for o in outcomes),
        "costs_floor_only": sum(not o.costs_known for o in outcomes),
        "base": scenario(outcomes, "cost_base", horizon, mean_corr),
        "sensitivity": scenario(outcomes, "cost_sensitivity", horizon, mean_corr),
    }


def with_holm(types: Mapping[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """The four primary tests, Holm-adjusted (06 §12.4); a type without a t counts as p = 1."""
    codes = list(types)
    ts = [types[c]["base"]["t_bmp_kp"] for c in codes]
    adjusted = holm([1.0 if t is None else two_sided_p(t) for t in ts])
    return {c: {**types[c], "holm_p": p} for c, p in zip(codes, adjusted, strict=True)}


def residual_series(stock: Series, bench: Series, days: Sequence[date], model: MarketModel) -> dict[date, float]:
    out: dict[date, float] = {}
    for d in days:
        rs, rb = close_return(stock, d), close_return(bench, d)
        if rs is not None and rb is not None:
            out[d] = rs - (model.alpha + model.beta * rb)
    return out


def _corr(a: Mapping[date, float], b: Mapping[date, float]) -> float | None:
    common = a.keys() & b.keys()
    if len(common) < KP_MIN_OVERLAP:
        return None
    xs, ys = [a[d] for d in common], [b[d] for d in common]
    try:
        return statistics.correlation(xs, ys)
    except statistics.StatisticsError:  # one side has no variance
        return None


def mean_pairwise_corr(series: Sequence[Mapping[date, float]], *, seed: int = 429) -> float:
    """r̄ of the Kolari–Pynnönen correction: estimation-window residuals, a seeded sample of event pairs."""
    pairs = list(combinations(range(len(series)), 2)) if len(series) <= 80 else None
    rng = random.Random(seed)  # noqa: S311 - a reproducible sample, not a secret
    chosen = pairs if pairs is not None else [tuple(rng.sample(range(len(series)), 2)) for _ in range(KP_PAIRS)]
    found = [c for i, j in chosen if (c := _corr(series[i], series[j])) is not None]
    return statistics.fmean(found) if found else 0.0


def verdict(types: Mapping[str, Mapping[str, Any]]) -> list[str]:
    return [c for c, t in types.items() if t["base"]["passed"]]


# ── reads ─────────────────────────────────────────────────────────────────────────────────────────


async def run_of(conn: DictConn, kind: str = MAIN) -> dict[str, Any] | None:
    return await fetch_one(conn, RUN_SQL, (kind,))


async def main_report(conn: DictConn) -> dict[str, Any] | None:
    """What the rest of the system may know about the holdout: the stored result of the one run, or None."""
    row = await run_of(conn, MAIN)
    return None if row is None else dict(row["report"])


async def readiness_problems(conn: DictConn, now: datetime) -> list[str]:
    """Why the only allowed run should not spend itself now (an empty archive would burn it)."""
    problems: list[str] = []
    if now < HOLDOUT_END:
        problems.append("the holdout period has not ended yet")
    days = [
        date.fromordinal(o).isoformat() for o in range(HOLDOUT_START.date().toordinal(), HOLDOUT_END.date().toordinal())
    ]
    done = await fetch_one(conn, MISSING_DAYS_SQL, (days,)) or {"n": 0}
    if int(done["n"]) < len(days):
        problems.append(f"KAP archive: {len(days) - int(done['n'])} of {len(days)} holdout days are not fully loaded")
    texts = await fetch_one(conn, TEXTS_SQL) or {"total": 0, "missing": 0}
    if texts["missing"] > MAX_MISSING_TEXT_SHARE * max(texts["total"], 1):
        problems.append(f"E1/E2 texts: {texts['missing']} of {texts['total']} holdout notices have no text yet")
    prices = await fetch_one(conn, PRICES_DONE_SQL) or {"n": 0}
    if not prices["n"]:
        problems.append("the archive's price step has not run")
    return problems


# ── one type ──────────────────────────────────────────────────────────────────────────────────────


async def _events(conn: DictConn, code: str, as_of: datetime) -> list[PastEvent]:
    return [
        PastEvent(
            ref_id=f"evt:kap:{r['disclosure_index']}",
            ticker=r["ticker"],
            company_name=r["company_name"],
            title=f"{r['company_name']} – {r['subject']}",
            published_at=r["published_at"],
            available_at=r["available_at"],
        )
        for r in await fetch_all(conn, EVENTS_SQL, {"code": code, "as_of": as_of})
    ]


async def _bars(conn: DictConn, ticker: str, lo: date, hi: date) -> dict[date, HLC]:
    rows = await fetch_all(conn, BARS_SQL, {"t": ticker, "lo": lo, "hi": hi})
    return {
        r["d"]: HLC(
            None if r["adj_high"] is None else float(r["adj_high"]),
            None if r["adj_low"] is None else float(r["adj_low"]),
            float(r["adj_close"]),
        )
        for r in rows
    }


def event_cost(bars: Sequence[HLC], adv_try: Decimal | None, params: SizingParams) -> float | None:
    """§8.1 round_trip_used with what was known before t0; None = no data (the caller applies the floor)."""
    spread = median_cs_spread(bars, params.atr_window, params.min_window_obs)
    sigma = daily_sigma(bars, params.atr_window, params.min_window_obs)
    if spread is None or sigma is None or adv_try is None or adv_try <= 0:
        return None
    order_try = min(REFERENCE_EQUITY_TRY * params.max_pos, adv_try * params.max_adv)
    costs = cost_model(
        spread=Decimal(str(spread)),
        sigma_daily=Decimal(str(sigma)),
        order_shares=order_try,
        adv20_shares=adv_try,  # both in TL: only the ratio matters
        personal=True,
        p=params,
    )
    return float(costs.round_trip_used)


async def _outcome(
    conn: DictConn,
    r: EventResult,
    horizon: int,
    series: Mapping[str, Series],
    bench: Series,
    bars: Mapping[date, HLC],
) -> tuple[Outcome, dict[date, float]]:
    stock = series[r.event.ticker]
    days = estimation_days(event_session(r.event.published_at))
    residuals = residual_series(stock, bench, days, r.model)
    sigma = statistics.stdev(residuals.values()) if len(residuals) > 1 else None
    before = [bars[d] for d in sorted(bars) if d < r.t0][-(DEFAULT_SIZING.atr_window + 1) :]
    adv = await adv20(conn, r.event.ticker, r.t0)
    base, sens = event_cost(before, adv, BASE), event_cost(before, adv, SENSITIVITY)
    floor = float(DEFAULT_SIZING.floor_round_trip)
    bar = stock.get(r.t0)
    return (
        Outcome(
            car=r.cars[horizon],
            sigma=sigma,
            cost_base=floor if base is None else base,
            cost_sensitivity=floor if sens is None else sens,
            open_known=bar is not None and bar.open is not None,
            costs_known=base is not None,
        ),
        residuals,
    )


async def _study_type(
    conn: DictConn, code: str, as_of: datetime, only_closed_after: datetime | None, bench: Series
) -> dict[str, Any]:
    horizon = DEFAULT_SIZING.horizon[code]
    events = await _events(conn, code, as_of)
    last = last_known_session(as_of)
    start = add_sessions(HOLDOUT_START.date(), ESTIMATION_WINDOW[0] - 1)
    tickers = sorted({e.ticker for e in events})
    series: dict[str, Series] = {t: await repo.series(conn, t, start, last) for t in tickers}
    excluded = await repo.excluded_days(conn, tickers, as_of, last) if tickers else {}
    result = study(events, series, bench, as_of, [horizon], excluded)
    kept = [
        r
        for r in result.results
        if only_closed_after is None or close_known_at(add_sessions(r.t0, horizon - 1)) >= only_closed_after
    ]
    outcomes: list[Outcome] = []
    residuals: list[dict[date, float]] = []
    for r in kept:
        bars = await _bars(conn, r.event.ticker, add_sessions(r.t0, -60), prev_session(r.t0))
        outcome, resid = await _outcome(conn, r, horizon, series, bench, bars)
        outcomes.append(outcome)
        residuals.append(resid)
    return {
        **type_report(outcomes, horizon, mean_pairwise_corr(residuals)),
        "n_raw": result.n_raw,
        "dropped": result.dropped,
        "cluster_sessions": CLUSTER_SESSIONS,
    }


# ── the one action ────────────────────────────────────────────────────────────────────────────────


async def compute(conn: DictConn, kind: str, as_of: datetime, only_closed_after: datetime | None) -> dict[str, Any]:
    bench = await repo.benchmark(
        conn, add_sessions(HOLDOUT_START.date(), ESTIMATION_WINDOW[0] - 1), last_known_session(as_of)
    )
    if not bench:
        raise HoldoutRefusedError("XU100 has no prices: nothing can be measured")
    types = {c: await _study_type(conn, c, as_of, only_closed_after, bench) for c in TYPES}
    if not any(t["n"] for t in types.values()):
        raise HoldoutRefusedError("no event of any type can be measured: the run would spend itself on nothing")
    judged = with_holm(types)
    return {
        "kind": kind,
        "as_of": as_of.isoformat(),
        "window": [HOLDOUT_START.isoformat(), HOLDOUT_END.isoformat()],
        "only_closed_after": None if only_closed_after is None else only_closed_after.isoformat(),
        "definition": EVENT_DEFINITION,
        "criteria": {"t_min": T_MIN, "n_min": N_MIN, "mean_net_above": 0},
        "types": judged,
        "passed_types": verdict(judged),
    }


async def run_holdout(
    conn: DictConn,
    *,
    kind: str = MAIN,
    now: datetime,
    actor: str,
    rules_hash: str,
    git_sha: str | None = None,
    prereg_ref: str | None = None,
    check_ready: bool = True,
) -> dict[str, Any]:
    """Refuses when it already ran or the archive is not ready; else one transaction: the row and its audit record."""
    main = await run_of(conn, MAIN)
    if kind not in (MAIN, COMPLETION):
        raise HoldoutRefusedError(f"unknown kind {kind!r}")
    if kind == MAIN and main is not None:
        raise HoldoutRefusedError(f"the holdout already ran on {main['finished_at'].isoformat()}; it never runs twice")
    if kind == COMPLETION:
        if main is None:
            raise HoldoutRefusedError("the completion run needs the main run first")
        if await run_of(conn, COMPLETION) is not None:
            raise HoldoutRefusedError("the completion run already ran; it never runs twice")
    problems = await readiness_problems(conn, now) if check_ready else []
    if problems:
        raise HoldoutRefusedError("; ".join(problems))
    report = await compute(conn, kind, now, main["as_of"] if main is not None else None)
    finished = datetime.now(UTC) if now.tzinfo is None else max(now, datetime.now(UTC))
    digest = hashlib.sha256(json.dumps(report, sort_keys=True, default=str).encode()).hexdigest()
    draft = AuditDraft(
        actor=f"user:{actor}",
        action=f"holdout.{kind}.run",
        entity_type="holdout_run",
        entity_id=kind,
        payload={
            "report_sha256": digest,
            "passed_types": report["passed_types"],
            "n": {c: t["n"] for c, t in report["types"].items()},
            "rules_hash": rules_hash,
            "git_sha": git_sha,
            "prereg_ref": prereg_ref,
        },
        occurred_at=finished,
    )
    try:
        async with conn.transaction():
            params = (kind, now, finished, now, actor, rules_hash, git_sha, prereg_ref, Jsonb(report))
            await conn.execute(INSERT_RUN_SQL, params)
            await append(conn, [draft], now=finished)
    except UniqueViolation as exc:  # another process got there first
        raise HoldoutRefusedError(f"the {kind} run already exists") from exc
    log.warning("holdout %s run recorded: %s", kind, report["passed_types"] or "no type passed")
    return report


# ── CLI ───────────────────────────────────────────────────────────────────────────────────────────


def _git(*args: str) -> str | None:
    try:
        out = subprocess.run(["git", *args], capture_output=True, text=True, timeout=10, check=False)  # noqa: S603, S607
    except OSError:
        return None
    return out.stdout.strip() or None if out.returncode == 0 else None


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.evalreports.holdout", description="The one holdout run (12 §1)")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="has it run, and is the archive ready? Reads no return of the period")
    run = sub.add_parser("run", help="run it: this happens once and cannot be repeated")
    run.add_argument("--kind", choices=(MAIN, COMPLETION), default=MAIN)
    run.add_argument("--confirm", required=True, help=f'type exactly "{CONFIRM_PHRASE}"')
    run.add_argument("--actor", required=True, help="who decided (goes to the audit record)")
    run.add_argument("--without-prereg-tag", action="store_true", help=f"no git tag {PREREG_TAG}: recorded as such")
    return p.parse_args(argv)


def _print_report(report: Mapping[str, Any]) -> None:
    for code, t in report["types"].items():
        b = t["base"]
        print(
            f"{code} H={t['horizon']}: n={t['n']} mean_net={b['mean_car_net']} t_bmp_kp={b['t_bmp_kp']} "
            f"t_cross={b['t_cross']} holm_p={t['holm_p']} passed={b['passed']} "
            f"(sensitivity mean_net={t['sensitivity']['mean_car_net']})"
        )
    print(f"passed types: {report['passed_types'] or 'none: no real money (12 §1)'}")
    print(f"definition: {report['definition']}")


async def _main(args: argparse.Namespace, url: str) -> int:  # pragma: no cover - thin wiring
    from kaptan.db import connect
    from kaptan.rules.params import DEFAULT_PARAMS

    conn = await connect(url)
    try:
        now = datetime.now(UTC)
        if args.command == "status":
            for kind in (MAIN, COMPLETION):
                row = await run_of(conn, kind)
                print(f"{kind}: {'ran ' + row['finished_at'].isoformat() if row else 'has not run'}")
            print("problems:", await readiness_problems(conn, now) or "none")
            return 0
        tag = _git("rev-parse", "--verify", "--quiet", f"refs/tags/{PREREG_TAG}")
        if tag is None and not args.without_prereg_tag:
            print(f"refused: git tag {PREREG_TAG} does not exist (06 §12.6); see --without-prereg-tag", file=sys.stderr)
            return 2
        report = await run_holdout(
            conn,
            kind=args.kind,
            now=now,
            actor=args.actor,
            rules_hash=DEFAULT_PARAMS.rules_hash,
            git_sha=_git("rev-parse", "HEAD"),
            prereg_ref=tag,
        )
        await conn.commit()
        _print_report(report)
        return 0
    except HoldoutRefusedError as exc:
        await conn.rollback()
        print(f"refused: {exc}", file=sys.stderr)
        return 2
    finally:
        await conn.close()


def main(argv: Sequence[str] | None = None) -> int:  # pragma: no cover - thin wiring
    from kaptan.api.loop import run
    from kaptan.settings import get_settings

    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if args.command == "run" and args.confirm != CONFIRM_PHRASE:
        print(f'refused: --confirm must be exactly "{CONFIRM_PHRASE}"', file=sys.stderr)
        return 2
    return run(_main(args, get_settings().database_url.get_secret_value()))


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
