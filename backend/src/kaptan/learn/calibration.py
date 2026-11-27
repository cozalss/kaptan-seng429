"""Calibration: KAPtan's predicted edge against what really happened, per event type.

    await record_prediction(conn, run_id=..., plan=sizing_plan, ...)   # every live decision the sizer priced
    await mature(conn, now)                                             # nightly: fill matured returns, refit
    factor = await correction_for(conn, "E1")                           # what the next E1 edge is multiplied by

The prediction is the edge before any correction (so the fit measures the model, not the model × its own factor):
`expected_edge_bps / correction`. Its outcome is the event's CAR over the same window (`core.event_returns`, the
nightly `event_returns` job), known once the window closed. Per type, over matured decisions:

    slope  = Σ p·r / Σ p²          (least squares of realised on predicted through 0: 1 = right on average)
    bias   = mean(r − p)            (bp)
    factor = clamp(slope, 0.5, 1.5) once n ≥ 30, else 1 (no correction on a handful of decisions)

Decisions published inside the sealed holdout are never recorded or read (there are none: live starts 2026-11-01).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg.rows import dict_row

from kaptan.evidence.holdout import HOLDOUT_END, HOLDOUT_START
from kaptan.learn.tunables import PRIMARY_HORIZON

Conn = Any
MIN_MATURED: Final = 30
FACTOR_BOUNDS: Final = (0.5, 1.5)
BPS: Final = 10_000.0

INSERT_SQL: Final = """
INSERT INTO learn.predictions (run_id, disclosure_index, ticker, event_type, decided_at, published_at, horizon,
  predicted_bps, correction, est_cost_bps, outcome, rules_hash)
VALUES (%(run_id)s, %(disclosure_index)s, %(ticker)s, %(event_type)s, %(decided_at)s, %(published_at)s, %(horizon)s,
  %(predicted_bps)s, %(correction)s, %(est_cost_bps)s, %(outcome)s, %(rules_hash)s)
ON CONFLICT (run_id) DO NOTHING
"""
#: The matured CAR of each open prediction: same disclosure, same window, known before `now`. Never a sealed row.
MATURE_SQL: Final = """
UPDATE learn.predictions p SET realised_car = r.car, matured_at = %(now)s
  FROM core.events e JOIN core.event_returns r USING (event_id)
 WHERE p.realised_car IS NULL AND e.source_kind = 'kap' AND e.disclosure_index = p.disclosure_index
   AND r.horizon = p.horizon AND r.available_at < %(now)s
   AND NOT (p.published_at >= %(s0)s AND p.published_at < %(s1)s)
   AND NOT (e.event_time >= %(s0)s AND e.event_time < %(s1)s)
"""
MATURED_SQL: Final = """
SELECT event_type, predicted_bps, correction, realised_car FROM learn.predictions
 WHERE realised_car IS NOT NULL AND NOT (published_at >= %(s0)s AND published_at < %(s1)s)
"""
UPSERT_SQL: Final = """
INSERT INTO learn.calibration (event_type, n_matured, slope, bias_bps, factor, active, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (event_type) DO UPDATE SET n_matured = EXCLUDED.n_matured, slope = EXCLUDED.slope,
  bias_bps = EXCLUDED.bias_bps, factor = EXCLUDED.factor, active = EXCLUDED.active, updated_at = EXCLUDED.updated_at
"""
FACTOR_SQL: Final = "SELECT factor, active FROM learn.calibration WHERE event_type = %s"
ALL_SQL: Final = "SELECT * FROM learn.calibration"
SEAL: Final = {"s0": HOLDOUT_START, "s1": HOLDOUT_END}


@dataclass(frozen=True, slots=True)
class Fit:
    kind: str
    n: int
    slope: float | None
    bias_bps: float | None
    factor: float
    active: bool


def fit(kind: str, pairs: Sequence[tuple[float, float]]) -> Fit:
    """(predicted bp, realised bp) pairs → slope through 0, bias and the bounded factor."""
    n = len(pairs)
    if n == 0:
        return Fit(kind, 0, None, None, 1.0, False)
    bias = math.fsum(r - p for p, r in pairs) / n
    den = math.fsum(p * p for p, _ in pairs)
    slope = math.fsum(p * r for p, r in pairs) / den if n >= 2 and den > 0 else None
    active = n >= MIN_MATURED and slope is not None
    lo, hi = FACTOR_BOUNDS
    factor = min(max(slope, lo), hi) if active and slope is not None else 1.0
    return Fit(kind, n, slope, bias, factor, active)


async def record_prediction(
    conn: Conn,
    *,
    run_id: str,
    disclosure_index: int,
    ticker: str,
    event_type: str,
    decided_at: datetime,
    published_at: datetime,
    expected_edge_bps: int,
    correction: Decimal,
    est_cost_bps: int,
    outcome: str,
    rules_hash: str,
) -> bool:
    if event_type not in PRIMARY_HORIZON or HOLDOUT_START <= published_at < HOLDOUT_END:
        return False
    raw = expected_edge_bps / float(correction) if correction > 0 else float(expected_edge_bps)
    params = {
        "run_id": run_id, "disclosure_index": disclosure_index, "ticker": ticker, "event_type": event_type,
        "decided_at": decided_at, "published_at": published_at, "horizon": PRIMARY_HORIZON[event_type],
        "predicted_bps": round(raw), "correction": float(correction), "est_cost_bps": est_cost_bps,
        "outcome": outcome, "rules_hash": rules_hash,
    }  # fmt: skip
    async with conn.cursor() as cur:
        await cur.execute(INSERT_SQL, params)
        return bool(cur.rowcount)


async def mature(conn: Conn, now: datetime) -> dict[str, Any]:
    """Fill the matured returns, then refit every type (nightly, after `event_returns`)."""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(MATURE_SQL, {"now": now, **SEAL})
        filled = cur.rowcount
        await cur.execute(MATURED_SQL, SEAL)
        rows = await cur.fetchall()
    fits = []
    for kind in PRIMARY_HORIZON:
        pairs = [(float(r["predicted_bps"]), float(r["realised_car"]) * BPS) for r in rows if r["event_type"] == kind]
        f = fit(kind, pairs)
        fits.append(f)
        await conn.execute(UPSERT_SQL, (kind, f.n, f.slope, f.bias_bps, f.factor, f.active, now))
    return {"filled": filled, "matured": {f.kind: f.n for f in fits}, "active": [f.kind for f in fits if f.active]}


async def correction_for(conn: Conn, kind: str) -> Decimal:
    """The factor the next edge of `kind` is multiplied by (1 until 30 decisions of the kind matured)."""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(FACTOR_SQL, (kind,))
        row = await cur.fetchone()
    if row is None or not row["active"]:
        return Decimal(1)
    return Decimal(str(round(float(row["factor"]), 4)))


async def fits(conn: Conn) -> dict[str, Fit]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(ALL_SQL)
        rows = await cur.fetchall()
    out = {k: Fit(k, 0, None, None, 1.0, False) for k in PRIMARY_HORIZON}
    for r in rows:
        out[r["event_type"]] = Fit(
            r["event_type"], int(r["n_matured"]), r["slope"], r["bias_bps"], float(r["factor"]), bool(r["active"])
        )
    return out
