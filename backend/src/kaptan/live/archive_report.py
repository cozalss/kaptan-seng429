"""What the archive holds, in numbers a person can check: per type and year, usable evidence, gaps.

It counts events and prices only. No CAR, no mean, no hit rate: reading those here would make the report a place to
look before deciding anything (06 §12.6), and the holdout's returns do not exist yet anyway.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any, Final

from kaptan.evidence.holdout import E_CODES, EVENT_ROW_SQL, IN_HOLDOUT_SQL, unsealed_sql
from kaptan.evidence.params import DEFAULT_HORIZONS
from kaptan.evidence.study import PastEvent, cluster
from kaptan.prices.calendar import IST
from kaptan.reference._sql import fetch_all, fetch_one

USABLE_N: Final = 30  # 12 §1's n: the number a type should reach at H = 20 (independent events)
LONGEST: Final = max(DEFAULT_HORIZONS)

BY_YEAR_SQL: Final = f"""
SELECT extract(year FROM d.published_at AT TIME ZONE 'Europe/Istanbul')::int AS year,
       CASE WHEN d.subject_route = ANY(%(codes)s::text[]) THEN d.subject_route
            ELSE d.classification ->> 'event_type' END AS code,
       count(*)::int AS notices,
       count(*) FILTER (WHERE {EVENT_ROW_SQL})::int AS qualified,
       count(*) FILTER (WHERE {IN_HOLDOUT_SQL})::int AS sealed,
       count(*) FILTER (WHERE d.subject_route = 'E2' AND d.disclosure_class <> 'ODA')::int AS attachment_only
  FROM core.disclosures d
 WHERE d.origin = 'kap' AND d.published_at >= %(lo)s AND d.published_at < %(hi)s AND NOT d.is_noise
   AND (d.subject_route = ANY(%(codes)s::text[]) OR d.classification ->> 'event_type' = ANY(%(codes)s::text[]))
 GROUP BY 1, 2 ORDER BY 1, 2
"""  # noqa: S608 - module constants only
USABLE_SQL: Final = f"""
SELECT e.event_code, e.ticker, e.event_time, e.available_at, e.disclosure_index
  FROM core.events e JOIN core.event_returns r USING (event_id)
 WHERE r.horizon = %(h)s AND {unsealed_sql("e.event_time", "as_of")} AND r.available_at < %(as_of)s
 ORDER BY e.event_time
"""  # noqa: S608 - module constants only
NO_OPEN_SQL: Final = """
SELECT e.event_code, count(*)::int AS n FROM core.events e JOIN core.event_returns r USING (event_id)
 WHERE r.horizon = %(h)s AND NOT EXISTS (
   SELECT 1 FROM core.prices_daily p WHERE p.ticker = ANY(core.ticker_codes(e.ticker)) AND p.d = r.t0
     AND p.source = 'isyatirim' AND p.open IS NOT NULL)
 GROUP BY 1
"""
ROUTED_LLM_SQL: Final = """
SELECT count(*)::int AS total, count(*) FILTER (WHERE classification IS NOT NULL)::int AS classified
  FROM core.disclosures
 WHERE origin = 'kap' AND subject_route = 'llm' AND published_at >= %(lo)s AND published_at < %(hi)s
"""
SIZE_SQL: Final = """
SELECT (SELECT count(*) FROM core.disclosures WHERE origin = 'kap')::bigint AS disclosures,
       (SELECT count(*) FROM core.prices_daily)::bigint AS price_rows,
       (SELECT count(*) FROM core.events)::bigint AS events,
       (SELECT count(*) FROM core.event_returns)::bigint AS returns,
       pg_total_relation_size('core.disclosures') + pg_total_relation_size('core.prices_daily')
         + pg_total_relation_size('core.disclosure_texts') + pg_total_relation_size('core.events')
         + pg_total_relation_size('core.event_returns') AS bytes
"""


async def _usable(conn: Any, as_of: datetime) -> dict[str, dict[str, int]]:
    """Per type: independent events (10-session clustering) whose longest evidence horizon is materialised."""
    rows = await fetch_all(conn, USABLE_SQL, {"h": LONGEST, "as_of": as_of})
    events: dict[str, list[PastEvent]] = {}
    for r in rows:
        ev = PastEvent(f"evt:kap:{r['disclosure_index']}", r["ticker"], "", "", r["event_time"], r["available_at"])
        events.setdefault(r["event_code"], []).append(ev)
    return {code: {"events": len(evs), "independent": len(cluster(evs))} for code, evs in sorted(events.items())}


async def archive_report(conn: Any, gaps: Mapping[str, Any], *, lo: datetime, hi: datetime) -> dict[str, Any]:
    as_of = hi
    by_year = await fetch_all(conn, BY_YEAR_SQL, {"codes": E_CODES, "lo": lo, "hi": hi})
    usable = await _usable(conn, as_of)
    no_open = {r["event_code"]: r["n"] for r in await fetch_all(conn, NO_OPEN_SQL, {"h": LONGEST})}
    llm = await fetch_one(conn, ROUTED_LLM_SQL, {"lo": lo, "hi": hi}) or {}
    size = await fetch_one(conn, SIZE_SQL) or {}
    return {
        "range": [lo.astimezone(IST).date().isoformat(), hi.astimezone(IST).date().isoformat()],
        "by_year": by_year,
        "usable_h20": {
            c: {**usable.get(c, {"events": 0, "independent": 0}), "no_open": no_open.get(c, 0)} for c in E_CODES
        },
        "usable_n": USABLE_N,
        "not_typed_without_llm": llm,
        "size": {k: int(v) for k, v in size.items()},
        "gaps": dict(gaps),
    }


def format_report(r: Mapping[str, Any]) -> str:
    lines = [f"ARCHIVE {r['range'][0]} → {r['range'][1]}", "year type notices qualified sealed attachment_only"]
    lines += [
        f"{y['year']} {y['code']} {y['notices']} {y['qualified']} {y['sealed']} {y['attachment_only']}"
        for y in r["by_year"]
    ]
    lines.append(
        f"usable evidence at H={LONGEST} (outside the sealed holdout, independent events; goal n ≥ {r['usable_n']}):"
    )
    for code, u in r["usable_h20"].items():
        flag = "" if u["independent"] >= r["usable_n"] else "  << below the goal"
        lines.append(
            f"  {code}: {u['independent']} independent of {u['events']} ({u['no_open']} without a real open){flag}"
        )
    llm = r["not_typed_without_llm"]
    lines.append(
        "subject route 'llm' (free text, typed only by the Classifier): "
        f"{llm.get('classified', 0)}/{llm.get('total', 0)} classified"
    )
    lines.append(f"stored: {r['size']}")
    g = r["gaps"]
    lines.append(
        f"gaps: partial days {g.get('partial_days') or '-'}, failed days {g.get('failed_days') or '-'}, "
        f"row errors {g.get('row_errors', 0)}"
    )
    lines.append(
        f"      codes without prices {g.get('prices_empty') or '-'}, failed {g.get('prices_failed') or '-'}, "
        f"failed texts {g.get('texts_failed', 0)}"
    )
    if g.get("classified"):
        lines.append(f"      Classifier this run: {g['classified']}")
    for old, new in (g.get("rename_candidates") or {}).items():
        lines.append(
            f"      {old} has no prices; same company title as {', '.join(new)}: "
            f"if it was renamed, rerun with --rename {old}:{new[0]}"
        )
    return "\n".join(lines)
