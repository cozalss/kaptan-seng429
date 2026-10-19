"""Slow-moving issuer facts: sector and name (İş Yatırım's stock list) and BIST market membership.

    n = await run_issuer_profiles(conn, now, client=polite)    # one İş Yatırım page (~1.7 MB), weekly
    n = await sync_market_changes(conn, now)                   # KAP "Pazar Değişikliği" rows, no network

- **Sector:** İş Yatırım "Temel Değerler ve Oranlar" page; its first table is
  `Kod | Hisse Adı | Sektör | Kapanış | Piyasa Değeri | … | Halka Açıklık | Sermaye` for every listed
  share (checked 2026-10-20: THYAO → "Havayolları ve Hizm."). Stored in core.issuer_profiles, which the
  universe job joins into core.issuers.sector (the event study's sector scope, R08's sector cap).
- **Market (U1):** BIST announces every market move on KAP as "Pazar Değişikliği" (e.g.
  "Payların Yakın İzleme Pazarına Alınması", relatedStocks = the codes). Each one becomes a
  core.market_changes row with the disclosure's `available_at`, so U1 is point in time. A share that
  never moved has no row: its market is unknown (U1 passes, see rules.py).
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.prices.http import PoliteClient, SourceError
from kaptan.prices.models import TICKER_RE
from kaptan.reference._sql import Conn, execute_many, fetch_all
from kaptan.text.turkish import clean_text, join_key

LIST_URL: Final = "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx"
ROW_RE: Final = re.compile(
    r"<tr>\s*<td>\s*<a[^>]*hisse=(?P<code>[A-Z0-9]{3,8})\"[^>]*>[^<]*</a>\s*</td>\s*"
    r"<td>(?P<name>[^<]*)</td>\s*<td>(?P<sector>[^<]*)</td>",
)
#: "… Pazarına / Pazara …" (dative) names the target market; checked in this order.
MARKET_PATTERNS: Final[tuple[tuple[str, str], ...]] = (
    ("yip", r"yakin izleme pazar(?:i?na|a)\b"),
    ("gip", r"gelisen isletmeler pazar(?:i?na|a)\b"),
    ("nitelikli", r"nitelikli yatirimci islem pazar(?:i?na|a)\b"),
    ("poip", r"piyasa oncesi islem platformu(na)?"),
    ("yildiz", r"yildiz pazar(?:i?na|a)\b"),
    ("ana", r"ana pazar(?:i?na|a)\b"),
    ("alt", r"alt pazar(?:i?na|a)\b"),
)
MARKET_SUBJECT: Final = "pazar degisikligi"
MARKET_LOOKBACK: Final = timedelta(days=3650)


@dataclass(frozen=True, slots=True)
class Profile:
    ticker: str
    name: str
    sector: str


def parse_stock_list(page: str) -> list[Profile]:
    """The page's first table → one profile per code (first occurrence wins; other tables repeat codes)."""
    out: dict[str, Profile] = {}
    for m in ROW_RE.finditer(page):
        code = m.group("code")
        if code in out or not TICKER_RE.fullmatch(code):
            continue
        name = clean_text(html.unescape(m.group("name")))
        sector = clean_text(html.unescape(m.group("sector")))
        if sector:
            out[code] = Profile(code, name, sector)
    return list(out.values())


UPSERT_PROFILE_SQL: Final = """
INSERT INTO core.issuer_profiles (ticker, name, sector, source, updated_at) VALUES (%s, %s, %s, 'isyatirim', %s)
ON CONFLICT (ticker) DO UPDATE SET name = EXCLUDED.name, sector = EXCLUDED.sector, updated_at = EXCLUDED.updated_at
"""


async def run_issuer_profiles(conn: Conn, now: datetime, *, client: PoliteClient) -> int:
    """Fetch İş Yatırım's stock list and refresh sector/name per ticker; returns the number of rows."""
    page = await client.get_text(LIST_URL)
    if page is None:
        raise SourceError(f"{LIST_URL}: 404")
    profiles = parse_stock_list(page)
    if not profiles:
        raise SourceError("isyatirim stock list: no rows parsed (page layout changed?)")
    return await execute_many(conn, UPSERT_PROFILE_SQL, [(p.ticker, p.name, p.sector, now) for p in profiles])


def target_market(text: str) -> str | None:
    """The market a "Pazar Değişikliği" text moves the shares *to*, or None."""
    key = join_key(text)
    for market, pattern in MARKET_PATTERNS:
        if re.search(pattern, key):
            return market
    return None


MARKET_ROWS_SQL: Final = """
SELECT disclosure_index, subject, summary, primary_ticker, stock_codes, related_stocks, available_at
  FROM core.disclosures
 WHERE origin = 'kap' AND available_at < %s AND available_at >= %s
   AND lower(subject) LIKE 'pazar de%%'
"""
INSERT_CHANGE_SQL: Final = """
INSERT INTO core.market_changes (ticker, market, available_at, source_disclosure, summary)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (ticker, source_disclosure) DO UPDATE SET market = EXCLUDED.market, summary = EXCLUDED.summary
"""


def affected_codes(row: dict[str, Any]) -> list[str]:
    """The codes a BIST/MKK notice is about (primary, stock codes, related stocks), deduplicated."""
    codes: list[str] = []
    for c in [row.get("primary_ticker"), *(row.get("stock_codes") or []), *(row.get("related_stocks") or [])]:
        code = str(c or "").strip().upper()
        if code and TICKER_RE.fullmatch(code) and code not in codes:
            codes.append(code)
    return codes


async def sync_market_changes(conn: Conn, now: datetime) -> int:
    """KAP "Pazar Değişikliği" disclosures known before `now` → core.market_changes (idempotent)."""
    params: list[tuple[Any, ...]] = []
    for r in await fetch_all(conn, MARKET_ROWS_SQL, (now, now - MARKET_LOOKBACK)):
        if join_key(r["subject"]) != MARKET_SUBJECT:
            continue
        market = target_market(f"{r['summary'] or ''} {r['subject']}")
        if market is None:
            continue
        for code in affected_codes(r):
            params.append((code, market, r["available_at"], r["disclosure_index"], r["summary"]))
    return await execute_many(conn, INSERT_CHANGE_SQL, params)
