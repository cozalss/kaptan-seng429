"""The upcoming-events calendar for the shares held and the shares watched (GET /me/calendar).

Every event has a real source:
- dividend payment / right-to-dividend days: read from the company's own KAP notice by
  `kaptan.ingest.corporate_actions.detect` (only a date that stood after its label in the text);
- general meetings: a KAP "genel kurul" notice whose subject or summary names exactly one dd.mm.yyyy date;
- financial-report windows: the day the company itself published its report in the same weeks one year ago
  (marked approximate: it is last year's habit, not an announcement);
- rate-decision days: the central bank's published calendar (`kaptan.agenda.macro`).
Nothing is invented: with no source there is no row, and the page says what it could not read.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.agenda import macro
from kaptan.ingest.corporate_actions import NOT_YET, detect, join_key
from kaptan.portfolio import ledger
from kaptan.reference._sql import fetch_all
from kaptan.text.turkish import IST

KAP_URL: Final = "https://www.kap.org.tr/tr/Bildirim/{}"
MONTHS: Final = (
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
)  # fmt: skip
LOOKBACK: Final = timedelta(days=150)  # a notice older than this has had its day already
MAX_DAYS: Final = 120
DATE_RE: Final = re.compile(r"\b(\d{2})\.(\d{2})\.(\d{4})\b")
MEETING_HINT: Final = "genel kurul"
GENERAL_NOT_YET: Final = (*NOT_YET, "ertelen", "ertele")

WATCH_SQL: Final = "SELECT ticker FROM core.watchlist ORDER BY ord"
NOTICE_SQL: Final = """
SELECT d.disclosure_index, d.primary_ticker, d.stock_codes, d.subject, d.summary, d.published_at,
       (SELECT t.body FROM core.disclosure_texts t
         WHERE t.disclosure_index = d.disclosure_index AND t.lang = 'tr') AS body
  FROM core.disclosures d
 WHERE d.origin = 'kap' AND d.reason <> 'CANC' AND d.published_at > %(since)s AND d.published_at <= %(now)s
   AND (d.primary_ticker = ANY(%(codes)s) OR d.stock_codes && %(codes)s)
 ORDER BY d.published_at, d.disclosure_index
"""
REPORT_SQL: Final = """
SELECT DISTINCT ON (t.ticker, (d.published_at AT TIME ZONE 'Europe/Istanbul')::date)
       t.ticker, d.disclosure_index, (d.published_at AT TIME ZONE 'Europe/Istanbul')::date AS day
  FROM core.disclosures d
  JOIN unnest(%(codes)s::text[]) AS t(ticker) ON d.primary_ticker = t.ticker OR t.ticker = ANY(d.stock_codes)
 WHERE d.origin = 'kap' AND d.disclosure_class = 'FR' AND d.reason = 'NEW' AND NOT d.is_late
   AND d.published_at >= %(lo)s AND d.published_at < %(hi)s
 ORDER BY t.ticker, (d.published_at AT TIME ZONE 'Europe/Istanbul')::date, d.disclosure_index
"""


@dataclass(frozen=True, slots=True)
class Scope:
    held: frozenset[str]
    watched: frozenset[str]

    def why(self, ticker: str) -> str | None:
        if ticker in self.held:
            return "held"
        return "watched" if ticker in self.watched else None

    @property
    def codes(self) -> list[str]:
        return sorted(self.held | self.watched)


def day_words(d: date) -> str:
    return f"{d.day} {MONTHS[d.month - 1]}"


def meeting_day(subject: str, summary: str) -> date | None:
    """The one date a general-meeting notice names in its subject or summary; None for none or several."""
    key = join_key(f"{subject} {summary}")
    if MEETING_HINT not in key or any(w in key for w in GENERAL_NOT_YET):
        return None
    found = {m.groups() for m in DATE_RE.finditer(f"{subject} {summary}")}
    if len(found) != 1:
        return None
    dd, mm, yyyy = next(iter(found))
    try:
        return date(int(yyyy), int(mm), int(dd))
    except ValueError:
        return None


def _event(
    key: str, day: date, kind: str, ticker: str | None, why: str | None, title: str, detail: str, url: str | None,
    approximate: bool = False,
) -> dict[str, Any]:  # fmt: skip
    return {"id": key, "day": day, "kind": kind, "ticker": ticker, "why": why, "title": title, "detail": detail,
            "source_url": url, "approximate": approximate}  # fmt: skip


TEXT_PAY: Final = "Şirketin bildirimine göre kâr payı bu gün ödenir."
TEXT_EX: Final = "Bu günün akşamı hissen varsa kâr payı hakkın olur."
TEXT_MEETING: Final = "Şirketin bildirimine göre ortaklar bu gün toplanır."
TEXT_REPORT: Final = "Geçen yıl bu rapor {} günü açıklandı. Bu yıl da yakın bir günde gelebilir; kesin gün değil."


def _notice_events(row: dict[str, Any], scope: Scope, start: date, end: date) -> list[dict[str, Any]]:
    ticker = next((c for c in [row["primary_ticker"], *row["stock_codes"]] if scope.why(c)), None)
    if ticker is None:
        return []
    why, url, idx = scope.why(ticker), KAP_URL.format(row["disclosure_index"]), row["disclosure_index"]
    out: list[dict[str, Any]] = []
    found = detect(row["subject"], row["summary"], row["body"] or "")
    if found is not None and found.kind == "dividend":
        if found.pay_date and start <= found.pay_date <= end:
            title = f"{ticker}: kâr payı ödeme günü"
            out.append(
                _event(
                    f"kp-{ticker}-{found.pay_date}", found.pay_date, "dividend_pay", ticker, why, title, TEXT_PAY, url
                )
            )
        if found.ex_date and start <= found.ex_date <= end:
            title = f"{ticker}: kâr payı hakkının belli olduğu gün"
            out.append(
                _event(f"kh-{ticker}-{found.ex_date}", found.ex_date, "dividend_ex", ticker, why, title, TEXT_EX, url)
            )
    meeting = meeting_day(row["subject"], row["summary"])
    if meeting is not None and start <= meeting <= end:
        title = f"{ticker}: genel kurul toplantısı"
        out.append(
            _event(f"gk-{ticker}-{meeting}-{idx}", meeting, "general_meeting", ticker, why, title, TEXT_MEETING, url)
        )
    return out


def _report_events(rows: list[dict[str, Any]], scope: Scope, start: date, end: date) -> list[dict[str, Any]]:
    out = []
    for r in rows:
        last = r["day"]
        try:
            day = last.replace(year=last.year + 1)
        except ValueError:  # 29 February
            day = last.replace(year=last.year + 1, day=28)
        if start <= day <= end:
            ticker = r["ticker"]
            out.append(
                _event(f"fr-{ticker}-{day}", day, "report_window", ticker, scope.why(ticker),
                       f"{ticker}: finansal rapor bu günlerde beklenir", TEXT_REPORT.format(day_words(last)),
                       KAP_URL.format(r["disclosure_index"]), approximate=True)
            )  # fmt: skip
    return out


def _rate_events(start: date, end: date) -> list[dict[str, Any]]:
    return [
        _event(f"ppk-{d}", d, "rate_decision", None, None, "Merkez Bankası faiz kararı günü",
               "Para Politikası Kurulu bu gün toplanır; karar piyasayı oynatabilir.", macro.SOURCE_URL)
        for d in macro.rate_decision_days(start, end)
    ]  # fmt: skip


def _dedupe(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for e in events:
        seen[e["id"]] = e  # later notices (updates) replace earlier ones
    return sorted(seen.values(), key=lambda e: (e["day"], e["ticker"] or "", e["kind"]))


async def scope_of(conn: AsyncConnection[Any], now: datetime) -> Scope:
    held = frozenset(s.ticker for s in await ledger.shares(conn, now))
    watched = frozenset(r["ticker"] for r in await fetch_all(conn, WATCH_SQL))
    return Scope(held, watched)


async def calendar(conn: AsyncConnection[Any], now: datetime, days: int) -> dict[str, Any]:
    """Events from today to `days` days ahead (1 to MAX_DAYS), oldest first."""
    days = max(1, min(days, MAX_DAYS))
    start = now.astimezone(IST).date()
    end = start + timedelta(days=days)
    scope = await scope_of(conn, now)
    events = _rate_events(start, end)
    if scope.codes:
        for row in await fetch_all(conn, NOTICE_SQL, {"since": now - LOOKBACK, "now": now, "codes": scope.codes}):
            events += _notice_events(row, scope, start, end)
        lo = datetime.combine(start - timedelta(days=365), datetime.min.time(), IST)
        hi = datetime.combine(end - timedelta(days=364), datetime.min.time(), IST)
        events += _report_events(
            await fetch_all(conn, REPORT_SQL, {"codes": scope.codes, "lo": lo, "hi": hi}), scope, start, end
        )
    return {"from": start, "to": end, "events": _dedupe(events), "notes": macro.notes_for(end)}
