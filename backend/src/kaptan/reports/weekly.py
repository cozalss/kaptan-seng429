"""The weekly summary (Haftalık özet): one calendar week, Monday to Sunday, of your book and of what KAPtan read.

It reuses the Karne of a period (`reports.karne.karne`): value, outside money, gain (a deposit is never a gain),
dividends, suggestions, and your money against BIST 100. On top of it: how many disclosures KAPtan read that week
and how many phone/e-mail messages really went out. A number that cannot be known honestly is null and the page
leaves it out. The phone only ever gets "KAPtan: haftalık özetin hazır." (kaptan.alerts.messages); this is the page
behind it. Read-only.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.prices.calendar import istanbul_date
from kaptan.reports.karne import Period, _bounds, karne
from kaptan.reports.words import MONTHS_TR

READ_SQL: Final = "SELECT count(*) AS n FROM core.disclosures WHERE published_at >= %s AND published_at < %s"
SENT_SQL: Final = "SELECT count(*) AS n FROM ops.alert_history WHERE ok AND sent_at >= %s AND sent_at < %s"


def week_of(day: date) -> Period:
    """The Monday-to-Sunday week that contains `day`, labelled "16–22 Kasım 2026". Pure."""
    start = day - timedelta(days=day.weekday())
    end = start + timedelta(days=6)
    if start.month == end.month:
        label = f"{start.day}–{end.day} {MONTHS_TR[end.month - 1]} {end.year}"
    else:
        label = f"{start.day} {MONTHS_TR[start.month - 1]} – {end.day} {MONTHS_TR[end.month - 1]} {end.year}"
    return Period("week", start, end, label)


async def _count(conn: AsyncConnection[Any], sql: str, lo: datetime, hi: datetime) -> int:
    async with conn.cursor() as cur:
        await cur.execute(sql, (lo, hi))
        row = await cur.fetchone()
    return 0 if row is None else int(row["n"] if isinstance(row, dict) else row[0])


async def weekly(conn: AsyncConnection[Any], at: date | None, now: datetime) -> dict[str, Any]:
    """The WeeklySummary document of the week containing `at` (default: this week)."""
    p = week_of(at or istanbul_date(now))
    lo, hi = _bounds(p)
    k = await karne(conn, p, now)
    return {
        "start": p.start, "end": p.end, "label_tr": p.label, "is_current": k["is_current"], "started": k["started"],
        "put_in_net": k["put_in_net"], "value_start": k["value_start"], "value_end": k["value_end"],
        "gain_try": k["gain_try"], "dividends_try": k["dividends_try"],
        "read": await _count(conn, READ_SQL, lo, min(hi, now) if k["is_current"] else hi),
        "suggestions": k["suggestions"], "benchmark": k["benchmark"],
        "alerts_sent": await _count(conn, SENT_SQL, lo, hi), "notes_tr": k["notes_tr"],
    }  # fmt: skip
