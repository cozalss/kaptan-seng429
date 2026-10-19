"""The daily point-in-time universe (06 §2 U1–U8, 07 P6, FR-22) and the issuer snapshot the agents read.

    stats = await run_universe(conn, date(2026, 10, 20))     # 08:30 Istanbul (weekly Monday + daily)

For the session `day`, as known at its 08:30 (`as_of`; prices up to the previous session's close):
- candidates = every code with an İş Yatırım raw bar in the last 20 sessions (İş Yatırım's stock
  endpoint serves shares only, so U8 holds for them; XU100 and other indices never appear);
- inputs per code: last raw close / market cap / free-float market cap / paid-in capital, the
  **median** TL turnover of the 20 sessions before `day` (a missing session counts as 0), sessions of
  history over the rename chain (`core.ticker_codes`), the market (latest core.market_changes row known
  before `as_of`), measures active in the last 20 sessions (core.restriction_events + the active list);
- `rules.evaluate` → core.universe_daily (d, ticker, is_eligible, reasons, checks, inputs);
- core.issuers is refreshed for these codes (`origin='kap'`; demo rows are never updated): name from
  core.companies, sector from core.issuer_profiles, price, ADV20 (mean, as R07 uses), free float,
  `in_universe` = eligible. KAP issuers that dropped out of the candidates get `in_universe=false`.
So a KAP ticker that is not in the demo seed is now known to the agents (R03 no longer vetoes it by
default); delisted codes stay in core.universe_daily (no survivorship bias).
"""

from __future__ import annotations

import logging
import statistics
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Final

from psycopg.types.json import Jsonb

from kaptan.prices.calendar import IST, add_sessions, prev_session
from kaptan.reference._sql import Conn, execute, execute_many, fetch_all
from kaptan.reference.rules import RULE_VERSION, UNIVERSE_PARAMS, UniverseInputs, UniverseParams, Verdict, evaluate

log = logging.getLogger("kaptan.reference.universe")

SNAPSHOT_TIME: Final = time(8, 30)
ISSUER_TICKER_MAX: Final = 6  # core.issuers.ticker CHECK (M1)
HARD_KINDS: Final = (
    "spk_tedbir", "vbts_brut_takas", "vbts_aciga_satis", "vbts_kredili_islem", "vbts_tek_fiyat", "trading_halt",
)  # fmt: skip

INPUTS_SQL: Final = """
WITH c AS (
  SELECT DISTINCT ticker FROM core.prices_daily
   WHERE source = 'isyatirim' AND price_basis = 'raw' AND d >= %(recent)s AND d < %(day)s
)
SELECT c.ticker, l.d AS last_d, l.close, l.mcap_try, l.free_float_mcap_try, l.capital_try,
       t.turnovers, h.n AS history,
       (SELECT mc.market FROM core.market_changes mc
         WHERE mc.ticker = ANY(core.ticker_codes(c.ticker)) AND mc.available_at < %(as_of)s
         ORDER BY mc.available_at DESC LIMIT 1) AS market,
       p.sector, p.name AS profile_name, p.market AS profile_market,
       (SELECT co.title FROM core.tickers tk JOIN core.companies co USING (company_id)
         WHERE tk.ticker = c.ticker AND tk.valid_from <= %(day)s AND (tk.valid_to IS NULL OR tk.valid_to > %(day)s)
         ORDER BY tk.valid_from DESC LIMIT 1) AS company_title,
       (SELECT tk.company_id FROM core.tickers tk
         WHERE tk.ticker = c.ticker AND tk.valid_from <= %(day)s AND (tk.valid_to IS NULL OR tk.valid_to > %(day)s)
         ORDER BY tk.valid_from DESC LIMIT 1) AS company_id
  FROM c
  CROSS JOIN LATERAL (
    SELECT d, close, mcap_try, free_float_mcap_try, capital_try FROM core.prices_daily
     WHERE ticker = c.ticker AND source = 'isyatirim' AND price_basis = 'raw' AND d < %(day)s
     ORDER BY d DESC LIMIT 1) l
  CROSS JOIN LATERAL (
    SELECT array_agg(coalesce(turnover_try, close * volume)) AS turnovers FROM core.prices_daily
     WHERE ticker = c.ticker AND source = 'isyatirim' AND price_basis = 'raw'
       AND d >= %(adv_lo)s AND d < %(day)s) t
  CROSS JOIN LATERAL (
    SELECT count(DISTINCT d) AS n FROM core.prices_daily
     WHERE ticker = ANY(core.ticker_codes(c.ticker)) AND source = 'isyatirim' AND price_basis = 'raw'
       AND d < %(day)s) h
  LEFT JOIN core.issuer_profiles p ON p.ticker = c.ticker
 ORDER BY c.ticker
"""
#: Measures active at any point of [lo, day) and known before as_of (U7), per ticker.
RECENT_MEASURES_SQL: Final = """
SELECT ticker, array_agg(DISTINCT kind) AS kinds FROM (
  SELECT ticker, kind FROM core.restriction_events
   WHERE kind = ANY(%(kinds)s::text[]) AND available_at < %(as_of)s AND start_date < %(day)s
     AND (end_date IS NULL OR end_date >= %(lo)s)
  UNION ALL
  SELECT ticker, kind FROM core.restricted_securities
   WHERE kind = ANY(%(kinds)s::text[]) AND id NOT LIKE 'ts:%%' AND added_at < %(as_of)s
) m GROUP BY ticker
"""
UPSERT_UNIVERSE_SQL: Final = """
INSERT INTO core.universe_daily (d, ticker, is_eligible, reasons, checks, price_try, adv20_try, free_float_pct,
  mcap_try, ff_mcap_try, history_sessions, tick_size, market, rule_version, computed_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (d, ticker) DO UPDATE SET is_eligible = EXCLUDED.is_eligible, reasons = EXCLUDED.reasons,
  checks = EXCLUDED.checks, price_try = EXCLUDED.price_try, adv20_try = EXCLUDED.adv20_try,
  free_float_pct = EXCLUDED.free_float_pct, mcap_try = EXCLUDED.mcap_try, ff_mcap_try = EXCLUDED.ff_mcap_try,
  history_sessions = EXCLUDED.history_sessions, tick_size = EXCLUDED.tick_size, market = EXCLUDED.market,
  rule_version = EXCLUDED.rule_version, computed_at = EXCLUDED.computed_at
"""
UPSERT_ISSUER_SQL: Final = """
INSERT INTO core.issuers (ticker, name, sector, group_name, free_float, adv20_try, price, in_universe, origin,
  company_id, market, paid_in_capital_try, mcap_try, adv20_median_try, history_sessions, tick_size,
  universe_reasons, snapshot_d, updated_at)
VALUES (%s, %s, %s, NULL, %s, %s, %s, %s, 'kap', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (ticker) DO UPDATE SET name = EXCLUDED.name,
  sector = CASE WHEN EXCLUDED.sector <> '' THEN EXCLUDED.sector ELSE core.issuers.sector END,
  free_float = EXCLUDED.free_float, adv20_try = EXCLUDED.adv20_try, price = EXCLUDED.price,
  in_universe = EXCLUDED.in_universe, company_id = EXCLUDED.company_id, market = EXCLUDED.market,
  paid_in_capital_try = EXCLUDED.paid_in_capital_try, mcap_try = EXCLUDED.mcap_try,
  adv20_median_try = EXCLUDED.adv20_median_try, history_sessions = EXCLUDED.history_sessions,
  tick_size = EXCLUDED.tick_size, universe_reasons = EXCLUDED.universe_reasons, snapshot_d = EXCLUDED.snapshot_d,
  updated_at = EXCLUDED.updated_at
WHERE core.issuers.origin = 'kap'
"""
DROP_STALE_SQL: Final = """
UPDATE core.issuers SET in_universe = false, universe_reasons = ARRAY['STALE'], updated_at = %s
 WHERE origin = 'kap' AND in_universe AND NOT (ticker = ANY(%s::text[]))
"""


@dataclass(frozen=True, slots=True)
class UniverseStats:
    day: date
    candidates: int
    eligible: int
    issuers_updated: int


def snapshot_as_of(day: date) -> datetime:
    return datetime.combine(day, SNAPSHOT_TIME, IST)


def median_turnover(values: list[Decimal | None] | None, window: int) -> Decimal | None:
    """Median over `window` sessions, a session without a bar counting as 0; None below half coverage."""
    present = [v for v in (values or []) if v is not None]
    if len(present) * 2 < window:
        return None
    padded = present[-window:] + [Decimal(0)] * max(0, window - len(present))
    return Decimal(statistics.median(padded))


def inputs_of(row: dict[str, Any], measures: dict[str, tuple[str, ...]], p: UniverseParams) -> UniverseInputs:
    return UniverseInputs(
        ticker=row["ticker"],
        price_try=row["close"],
        adv20_median_try=median_turnover(row["turnovers"], p.adv_window),
        mcap_try=row["mcap_try"],
        ff_mcap_try=row["free_float_mcap_try"],
        history_sessions=int(row["history"] or 0),
        market=row["market"] or row["profile_market"],
        is_share=True,
        restricted_recently=measures.get(row["ticker"], ()),
    )


def _universe_params(day: date, x: UniverseInputs, v: Verdict, now: datetime) -> tuple[Any, ...]:
    return (
        day, x.ticker, v.eligible, list(v.reasons), Jsonb(v.checks), x.price_try, x.adv20_median_try,
        x.free_float, x.mcap_try, x.ff_mcap_try, x.history_sessions, v.tick, x.market, RULE_VERSION, now,
    )  # fmt: skip


def _issuer_params(day: date, row: dict[str, Any], x: UniverseInputs, v: Verdict, adv_mean: Decimal | None,
                   now: datetime) -> tuple[Any, ...]:  # fmt: skip
    name = row["company_title"] or row["profile_name"] or x.ticker
    return (
        x.ticker, name, row["sector"] or "", float(x.free_float or 0), float(adv_mean or 0), float(x.price_try or 0),
        v.eligible, row["company_id"], x.market, row["capital_try"], x.mcap_try, x.adv20_median_try,
        x.history_sessions, v.tick, list(v.reasons), day, now,
    )  # fmt: skip


def _mean_turnover(values: list[Decimal | None] | None, window: int) -> Decimal | None:
    present = [v for v in (values or []) if v is not None]
    if len(present) * 2 < window:
        return None
    return sum(present[-window:], Decimal(0)) / window


async def run_universe(
    conn: Conn, day: date, *, now: datetime | None = None, params: UniverseParams = UNIVERSE_PARAMS
) -> UniverseStats:
    """Compute and store the universe of `day` (idempotent), then refresh the KAP rows of core.issuers."""
    as_of = snapshot_as_of(day)
    written_at = now or as_of
    ref = prev_session(day)
    window_lo = add_sessions(ref, -(params.adv_window - 1))  # the last `adv_window` sessions before `day`
    q = {"day": day, "as_of": as_of, "recent": window_lo, "adv_lo": window_lo}
    rows = await fetch_all(conn, INPUTS_SQL, q)
    lo = add_sessions(ref, -(params.restriction_lookback_sessions - 1))
    measure_rows = await fetch_all(
        conn, RECENT_MEASURES_SQL, {"kinds": list(HARD_KINDS), "as_of": as_of, "day": day, "lo": lo}
    )
    measures = {r["ticker"]: tuple(r["kinds"]) for r in measure_rows}
    uni, iss, eligible = [], [], 0
    for row in rows:
        x = inputs_of(row, measures, params)
        v = evaluate(x, params)
        eligible += v.eligible
        uni.append(_universe_params(day, x, v, written_at))
        if len(x.ticker) <= ISSUER_TICKER_MAX and x.price_try is not None and x.price_try > 0:
            iss.append(_issuer_params(day, row, x, v, _mean_turnover(row["turnovers"], params.adv_window), written_at))
    async with conn.transaction():
        await execute_many(conn, UPSERT_UNIVERSE_SQL, uni)
        await execute_many(conn, UPSERT_ISSUER_SQL, iss)
        await execute(conn, DROP_STALE_SQL, (written_at, [p[0] for p in iss]))
    log.info("universe %s: %d candidates, %d eligible, %d issuers", day, len(rows), eligible, len(iss))
    return UniverseStats(day, len(rows), eligible, len(iss))


#: The rules' answer with the Yönetici's overrides on top (core.universe_overrides, migration 0020; M3 B3).
UNIVERSE_SQL: Final = """
SELECT u.ticker FROM core.universe_daily u
  LEFT JOIN core.universe_overrides o ON o.ticker = u.ticker
 WHERE u.d = %s AND (o.mode IS NULL AND u.is_eligible OR o.mode = 'include')
 ORDER BY u.ticker
"""


async def universe_on(conn: Conn, day: date) -> list[str]:
    """The eligible tickers of `day` after the manual overrides (empty when the job has not run for it)."""
    return [r["ticker"] for r in await fetch_all(conn, UNIVERSE_SQL, (day,))]
