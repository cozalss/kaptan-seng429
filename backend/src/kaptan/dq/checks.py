"""The data-quality checks of 07 §14 as SQL, one function each → `ops.dq_results`.

Every check returns `(passed, observed)`; `observed` is the JSON the panel/alerts show. Windows end at
the run day (Istanbul). Thresholds are the table's; `CHECKS` maps code → (severity, function).
Q-N1 (RSS sources) has no feed yet and is reported as an `info` skip.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import date, datetime, time, timedelta
from typing import Any, Final

from kaptan.prices.calendar import IST, add_sessions, prev_session
from kaptan.reference._sql import Conn, fetch_all, fetch_one

Observed = dict[str, Any]
Check = Callable[[Conn, date], Awaitable[tuple[bool, Observed]]]

KAP_DAY_LIMIT: Final = 2000  # byCriteria's page size: a day that ends exactly there was cut off


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time(0), IST)
    return start, start + timedelta(days=1)


def _f(x: Any) -> float | None:
    return None if x is None else float(x)


async def _scalar(conn: Conn, sql: str, params: Any = ()) -> Any:
    row = await fetch_one(conn, sql, params)
    return None if row is None else next(iter(row.values()))


# ── KAP ──────────────────────────────────────────────────────────────────────────────────────────
DAILY_COUNTS_SQL: Final = """
SELECT (published_at AT TIME ZONE 'Europe/Istanbul')::date AS d, count(*) AS n FROM core.disclosures
 WHERE origin = 'kap' AND published_at >= %s AND published_at < %s GROUP BY 1
"""


async def q_k1(conn: Conn, day: date) -> tuple[bool, Observed]:
    """Today's KAP row count within 50–200 % of the median of the previous 20 sessions."""
    lo = add_sessions(prev_session(day), -19)
    rows = await fetch_all(conn, DAILY_COUNTS_SQL, (_day_bounds(lo)[0], _day_bounds(day)[1]))
    counts = {r["d"]: int(r["n"]) for r in rows}
    history = sorted(counts.get(add_sessions(lo, i), 0) for i in range(20))
    median = (history[9] + history[10]) / 2
    today = counts.get(day, 0)
    passed = median == 0 or 0.5 * median <= today <= 2.0 * median
    return passed, {"count": today, "median_20": median}


async def q_k2(conn: Conn, day: date) -> tuple[bool, Observed]:
    """No day of the last year has exactly 2000 rows (an unsplit byCriteria answer was truncated)."""
    rows = await fetch_all(conn, DAILY_COUNTS_SQL, (_day_bounds(day - timedelta(days=365))[0], _day_bounds(day)[1]))
    full = sorted(r["d"].isoformat() for r in rows if int(r["n"]) == KAP_DAY_LIMIT)
    return not full, {"days_at_limit": full[:20], "n": len(full)}


BACKFILL_SQL: Final = "SELECT key, status FROM ops.ingestion_runs WHERE job = 'kap_backfill'"


async def q_k3(conn: Conn, day: date) -> tuple[bool, Observed]:
    """The KAP backfill has no hole between its first and last day (every day 'done')."""
    rows = await fetch_all(conn, BACKFILL_SQL)
    done = {date.fromisoformat(r["key"]) for r in rows if r["status"] == "done" and len(r["key"]) == 10}
    if not done:
        return True, {"days": 0}
    lo, hi = min(done), min(max(done), day)
    missing = [
        (lo + timedelta(days=i)).isoformat() for i in range((hi - lo).days + 1) if lo + timedelta(days=i) not in done
    ]
    return not missing, {"from": lo.isoformat(), "to": hi.isoformat(), "missing": missing[:20], "n": len(missing)}


RESOLVE_SQL: Final = """
SELECT count(*) AS n, count(*) FILTER (WHERE primary_ticker IS NOT NULL) AS resolved FROM core.disclosures
 WHERE origin = 'kap' AND cardinality(stock_codes) > 0 AND published_at >= %s AND published_at < %s
"""


async def q_k4(conn: Conn, day: date) -> tuple[bool, Observed]:
    """≥ 99 % of the last 30 days' listed-company rows resolve to a ticker."""
    r = await fetch_one(conn, RESOLVE_SQL, (_day_bounds(day - timedelta(days=30))[0], _day_bounds(day)[1]))
    n, ok = int(r["n"]) if r else 0, int(r["resolved"]) if r else 0
    rate = 1.0 if n == 0 else ok / n
    return rate >= 0.99, {"rows": n, "rate": round(rate, 4)}


DELAY_SQL: Final = """
SELECT count(*) FILTER (WHERE available_at < published_at) AS bad,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM first_seen_at - published_at)) AS p95
  FROM core.disclosures
 WHERE origin = 'kap' AND ingest_source = 'live' AND first_seen_at IS NOT NULL
   AND published_at >= %s AND published_at < %s
"""


async def q_k5(conn: Conn, day: date) -> tuple[bool, Observed]:
    """available_at ≥ published_at, and live rows were first seen ≤ 120 s after publication (p95, 7 days)."""
    r = await fetch_one(conn, DELAY_SQL, (_day_bounds(day - timedelta(days=7))[0], _day_bounds(day)[1]))
    bad, p95 = (int(r["bad"]), _f(r["p95"])) if r else (0, None)
    return bad == 0 and (p95 is None or p95 <= 120), {"bad_available_at": bad, "p95_seen_delay_s": p95}


CORR_SQL: Final = """
SELECT count(*) AS n, count(*) FILTER (WHERE related_index IS NOT NULL) AS linked FROM core.disclosures
 WHERE origin = 'kap' AND reason IN ('CORR', 'UPD') AND published_at >= %s AND published_at < %s
"""


async def q_k6(conn: Conn, day: date) -> tuple[bool, Observed]:
    r = await fetch_one(conn, CORR_SQL, (_day_bounds(day - timedelta(days=30))[0], _day_bounds(day)[1]))
    n, ok = (int(r["n"]), int(r["linked"])) if r else (0, 0)
    rate = 1.0 if n == 0 else ok / n
    return rate >= 0.95, {"rows": n, "rate": round(rate, 4)}


TEXT_RATE_SQL: Final = """
SELECT count(*) AS n, count(t.disclosure_index) AS with_text
  FROM core.disclosures d
  LEFT JOIN core.disclosure_texts t ON t.disclosure_index = d.disclosure_index AND t.lang = 'tr'
 WHERE d.origin = 'kap' AND d.subject_route IN ('E1', 'E2', 'E3', 'E4', 'llm')
   AND d.published_at >= %s AND d.published_at < %s
   AND (NOT EXISTS (SELECT 1 FROM core.universe_daily) OR d.primary_ticker IN
        (SELECT ticker FROM core.universe_daily WHERE is_eligible AND d >= %s))
"""


async def q_k7(conn: Conn, day: date) -> tuple[bool, Observed]:
    """≥ 98 % of E-candidate (+ universe) disclosures older than 48 h have their full text."""
    end = _day_bounds(day)[1] - timedelta(hours=48)
    r = await fetch_one(conn, TEXT_RATE_SQL, (end - timedelta(days=30), end, day - timedelta(days=30)))
    n, ok = (int(r["n"]), int(r["with_text"])) if r else (0, 0)
    rate = 1.0 if n == 0 else ok / n
    return rate >= 0.98, {"rows": n, "rate": round(rate, 4)}


# ── prices ───────────────────────────────────────────────────────────────────────────────────────
OHLC_SQL: Final = """
SELECT count(*) AS bad FROM core.prices_daily
 WHERE d >= %s AND d <= %s AND (close <= 0 OR (high IS NOT NULL AND high < greatest(close, coalesce(open, close)))
                                OR (low IS NOT NULL AND low > least(close, coalesce(open, close))))
"""


async def q_p1(conn: Conn, day: date) -> tuple[bool, Observed]:
    bad = int(await _scalar(conn, OHLC_SQL, (day - timedelta(days=400), day)) or 0)
    return bad == 0, {"bad_rows": bad}


MISSING_BAR_SQL: Final = """
SELECT u.ticker FROM core.universe_daily u
 WHERE u.d = %s AND u.is_eligible AND NOT EXISTS (
   SELECT 1 FROM core.prices_daily p WHERE p.ticker = ANY(core.ticker_codes(u.ticker)) AND p.d = %s
      AND p.source = 'isyatirim')
 ORDER BY 1
"""


async def q_p2(conn: Conn, day: date) -> tuple[bool, Observed]:
    """Every ticker of the day's universe has a bar for the previous session."""
    missing = [r["ticker"] for r in await fetch_all(conn, MISSING_BAR_SQL, (day, prev_session(day)))]
    return not missing, {"session": prev_session(day).isoformat(), "missing": missing[:30], "n": len(missing)}


JUMP_SQL: Final = """
WITH r AS (
  SELECT ticker, d, adj_close / lag(adj_close) OVER (PARTITION BY ticker ORDER BY d) - 1 AS ret
    FROM core.prices_daily_adj WHERE source = 'isyatirim' AND d >= %s AND d <= %s
)
SELECT r.ticker, r.d, r.ret FROM r
 WHERE abs(r.ret) > 0.105 AND r.d > %s
   AND NOT EXISTS (SELECT 1 FROM core.corporate_actions ca WHERE ca.ticker = r.ticker AND ca.ex_date = r.d)
 ORDER BY abs(r.ret) DESC LIMIT 30
"""


async def q_p3(conn: Conn, day: date) -> tuple[bool, Observed]:
    """No adjusted daily move beyond ±10.5 % (the price limit) without a corporate action that day."""
    lo = day - timedelta(days=30)
    rows = await fetch_all(conn, JUMP_SQL, (lo - timedelta(days=10), day, lo))
    found = [{"ticker": r["ticker"], "d": r["d"].isoformat(), "ret": round(float(r["ret"]), 4)} for r in rows]
    return not found, {"jumps": found, "n": len(found)}


ADJ_DIFF_SQL: Final = """
SELECT count(*) AS n,
       count(*) FILTER (WHERE abs(a.adj_close / p.ref_adj_close - 1) > %s) AS off
  FROM core.prices_daily_adj a
  JOIN core.prices_daily p ON p.ticker = a.ticker AND p.d = a.d AND p.source = a.source
 WHERE a.source = 'isyatirim' AND p.ref_adj_close > 0 AND a.d >= %s AND a.d <= %s
"""
YF_DIFF_SQL: Final = """
SELECT count(*) AS n,
       count(*) FILTER (WHERE abs(y.close / p.ref_adj_close - 1) > 0.01) AS off
  FROM core.prices_daily y
  JOIN core.prices_daily p ON p.ticker = y.ticker AND p.d = y.d AND p.source = 'isyatirim'
 WHERE y.source = 'yfinance' AND p.ref_adj_close > 0 AND y.d >= %s AND y.d <= %s
"""


async def _share_off(conn: Conn, sql: str, params: tuple[Any, ...]) -> tuple[bool, Observed]:
    r = await fetch_one(conn, sql, params)
    n, off = (int(r["n"]), int(r["off"])) if r else (0, 0)
    share = 0.0 if n == 0 else off / n
    return share <= 0.01, {"rows": n, "share_off": round(share, 4)}


async def q_p4(conn: Conn, day: date) -> tuple[bool, Observed]:
    """Our adjusted close ≈ İş Yatırım's HGDG_KAPANIS (> 0.5 % apart on ≤ 1 % of days)."""
    return await _share_off(conn, ADJ_DIFF_SQL, (0.005, day - timedelta(days=365), day))


async def q_p5(conn: Conn, day: date) -> tuple[bool, Observed]:
    """yfinance adjusted close ≈ HGDG_KAPANIS (> 1 % apart on ≤ 1 % of days; never vs the raw close)."""
    return await _share_off(conn, YF_DIFF_SQL, (day - timedelta(days=365), day))


OFF_CALENDAR_SQL: Final = """
SELECT count(*) AS bad FROM core.prices_daily p JOIN core.market_calendar c ON c.d = p.d
 WHERE NOT c.is_trading_day AND p.d >= %s AND p.d <= %s
"""


async def q_p6(conn: Conn, day: date) -> tuple[bool, Observed]:
    """No bar on a non-session day (Yahoo's Volume == 0 holiday rows; volume > 0 is a table CHECK)."""
    bad = int(await _scalar(conn, OFF_CALENDAR_SQL, (day - timedelta(days=400), day)) or 0)
    return bad == 0, {"bad_rows": bad}


async def q_n1(conn: Conn, day: date) -> tuple[bool, Observed]:
    return True, {"skipped": "no RSS news feed is ingested yet"}


# ── RAG, events, audit ───────────────────────────────────────────────────────────────────────────
RAG_COVERAGE_SQL: Final = """
SELECT count(*) AS n, count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM rag.rag_chunks c WHERE c.disclosure_index = t.disclosure_index)) AS indexed
  FROM core.disclosure_texts t JOIN core.disclosures d USING (disclosure_index)
 WHERE d.origin = 'kap' AND t.lang = 'tr' AND d.published_at < %s
"""


async def q_r1(conn: Conn, day: date) -> tuple[bool, Observed]:
    """Share of KAP disclosures with a TR text that have chunks (expected ≈ all once indexing runs)."""
    r = await fetch_one(conn, RAG_COVERAGE_SQL, (_day_bounds(day)[1],))
    n, ok = (int(r["n"]), int(r["indexed"])) if r else (0, 0)
    rate = 1.0 if n == 0 else ok / n
    return rate >= 0.9, {"texts": n, "indexed": ok, "rate": round(rate, 4)}


NORM_SQL: Final = """
SELECT count(*) AS bad FROM rag.rag_chunks
 WHERE NOT (vector_norm(embedding) BETWEEN 0.99 AND 1.01) OR vector_norm(embedding) = 'NaN'::float8
"""


async def q_r2(conn: Conn, day: date) -> tuple[bool, Observed]:
    bad = int(await _scalar(conn, NORM_SQL) or 0)
    return bad == 0, {"bad_vectors": bad}


RAG_PIT_SQL: Final = """
SELECT count(*) AS bad FROM rag.rag_chunks c JOIN core.disclosures d ON d.disclosure_index = c.disclosure_index
 WHERE c.available_at < d.available_at
"""


async def q_r3(conn: Conn, day: date) -> tuple[bool, Observed]:
    """Point-in-time invariant: no chunk is searchable before its disclosure was available."""
    bad = int(await _scalar(conn, RAG_PIT_SQL) or 0)
    return bad == 0, {"bad_chunks": bad}


EVENT_PIT_SQL: Final = """
SELECT count(*) AS bad FROM core.event_returns r LEFT JOIN core.market_calendar c ON c.d = r.t_end
 WHERE r.available_at < ((r.t_end::timestamp + CASE WHEN coalesce(c.is_half_day, false)
                                                    THEN interval '12 hours 30 minutes'
                                                    ELSE interval '18 hours 10 minutes' END)
                         AT TIME ZONE 'Europe/Istanbul')
"""


async def q_e1(conn: Conn, day: date) -> tuple[bool, Observed]:
    """event_returns.available_at ≥ the close of t_end (07 P2)."""
    bad = int(await _scalar(conn, EVENT_PIT_SQL) or 0)
    return bad == 0, {"bad_rows": bad}


async def q_e2(conn: Conn, day: date) -> tuple[bool, Observed]:
    """Corrections are not events: no core.events row has `is_correction_of`."""
    bad = int(await _scalar(conn, "SELECT count(*) AS bad FROM core.events WHERE is_correction_of IS NOT NULL") or 0)
    return bad == 0, {"corrections": bad}


async def q_a1(conn: Conn, day: date) -> tuple[bool, Observed]:
    """The audit ledger verifies (hash chain + anchor)."""
    from kaptan.audit.verify import verify_db

    now = datetime.combine(day, time(21, 0), IST)
    result = await verify_db(conn, now.isoformat())
    return bool(result.get("ok")), {k: result.get(k) for k in ("ok", "checked", "first_bad_pos", "kind")}


CHECKS: Final[dict[str, tuple[str, Check]]] = {
    "Q-K1": ("warn", q_k1),
    "Q-K2": ("error", q_k2),
    "Q-K3": ("error", q_k3),
    "Q-K4": ("warn", q_k4),
    "Q-K5": ("warn", q_k5),
    "Q-K6": ("warn", q_k6),
    "Q-K7": ("warn", q_k7),
    "Q-P1": ("error", q_p1),
    "Q-P2": ("warn", q_p2),
    "Q-P3": ("warn", q_p3),
    "Q-P4": ("warn", q_p4),
    "Q-P5": ("warn", q_p5),
    "Q-P6": ("error", q_p6),
    "Q-N1": ("info", q_n1),
    "Q-R1": ("info", q_r1),
    "Q-R2": ("error", q_r2),
    "Q-R3": ("error", q_r3),
    "Q-E1": ("error", q_e1),
    "Q-E2": ("error", q_e2),
    "Q-A1": ("error", q_a1),
}
