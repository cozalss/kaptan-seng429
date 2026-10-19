"""TCMB indicative exchange rates (FR-41, 06 §3.3 `fx_source: TCMB_doviz_alis_karar_tarihi`).

Sources (no key needed): `https://www.tcmb.gov.tr/kurlar/today.xml` and the archive
`https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml` (404 on weekends and holidays). Each file is the
bulletin TCMB announces at 15:30 Istanbul on its `Tarih`; we store ForexBuying (döviz alış) per unit
(JPY is quoted per 100) with `available_at = Tarih 15:30 Istanbul`, so a rate is used only for
decisions made after it was published (no look-ahead). The publication hour is a conservative
[U]: TCMB states "15.30" for the indicative bulletin.

    async with make_http_client() as http:
        bulletin = await fetch_day(http, date(2026, 10, 20))      # None: no bulletin that day
"""

from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Final

import httpx

from kaptan.prices.calendar import IST
from kaptan.prices.http import make_http_client

log = logging.getLogger("kaptan.market.fx")

TODAY_URL: Final = "https://www.tcmb.gov.tr/kurlar/today.xml"
ARCHIVE_URL: Final = "https://www.tcmb.gov.tr/kurlar/{ym}/{dmy}.xml"
#: The bulletin is announced at 15:30 Istanbul on its date (06 §3.3: "karar anında yayımlanmış son TCMB kuru").
PUBLISH_TIME: Final = time(15, 30)
#: A bulletin is a few kB; anything far larger is not one (and is not parsed).
MAX_BYTES: Final = 512 * 1024
RETRIES: Final = 2
SOURCE: Final = "tcmb"

Sleep = Callable[[float], Awaitable[None]]


class FxSourceError(RuntimeError):
    """TCMB answered something unusable or failed after its retries."""


@dataclass(frozen=True, slots=True)
class FxRate:
    d: date
    currency: str
    rate: Decimal  # TRY per one unit of `currency` (ForexBuying / Unit)
    available_at: datetime
    source: str = SOURCE


def available_at(d: date) -> datetime:
    return datetime.combine(d, PUBLISH_TIME, IST)


def archive_url(d: date) -> str:
    return ARCHIVE_URL.format(ym=d.strftime("%Y%m"), dmy=d.strftime("%d%m%Y"))


def _dec(text: str | None) -> Decimal | None:
    if text is None or not text.strip():
        return None
    try:
        value = Decimal(text.strip())
    except InvalidOperation:
        return None
    return value if value > 0 else None


def _bulletin_date(root: ET.Element) -> date:
    raw = root.get("Date")  # "10/20/2026" (MM/DD/YYYY); "Tarih" is the same day as DD.MM.YYYY
    if raw:
        month, day, year = (int(p) for p in raw.split("/"))
        return date(year, month, day)
    tarih = root.get("Tarih")
    if not tarih:
        raise FxSourceError("bulletin has no date")
    day, month, year = (int(p) for p in tarih.split("."))
    return date(year, month, day)


def parse_bulletin(xml: bytes) -> list[FxRate]:
    """Every currency of one bulletin with a ForexBuying rate (per unit). Raises FxSourceError on junk."""
    if len(xml) > MAX_BYTES:
        raise FxSourceError("bulletin too large")
    try:
        # TCMB's own XML; expat does not resolve external entities and the size is capped above.
        root = ET.fromstring(xml)  # noqa: S314
        d = _bulletin_date(root)
    except (ET.ParseError, ValueError) as exc:
        raise FxSourceError(f"not a TCMB bulletin: {type(exc).__name__}") from exc
    out: list[FxRate] = []
    for cur in root.iter("Currency"):
        code = (cur.get("CurrencyCode") or cur.get("Kod") or "").strip().upper()
        buying, unit = _dec(cur.findtext("ForexBuying")), _dec(cur.findtext("Unit")) or Decimal(1)
        if len(code) != 3 or buying is None:
            continue
        out.append(FxRate(d, code, buying / unit, available_at(d)))
    if not out:
        raise FxSourceError("bulletin without rates")
    return out


async def _get(http: httpx.AsyncClient, url: str, sleep: Sleep) -> bytes | None:
    last = "no attempt"
    for attempt in range(RETRIES + 1):
        try:
            res = await http.get(url)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last = type(exc).__name__
        else:
            if res.status_code == httpx.codes.NOT_FOUND:
                return None  # weekend / holiday: no bulletin that day
            if res.is_success:
                return res.content
            last = f"HTTP {res.status_code}"
            if res.status_code < 500 and res.status_code != httpx.codes.TOO_MANY_REQUESTS:
                break
        if attempt < RETRIES:
            await sleep(2.0 * 2**attempt)
    raise FxSourceError(f"{url}: {last}")


async def fetch_day(http: httpx.AsyncClient, d: date, *, sleep: Sleep = asyncio.sleep) -> list[FxRate] | None:
    """The archived bulletin of `d` (None when TCMB published none that day)."""
    body = await _get(http, archive_url(d), sleep)
    return None if body is None else parse_bulletin(body)


async def fetch_today(http: httpx.AsyncClient, *, sleep: Sleep = asyncio.sleep) -> list[FxRate]:
    body = await _get(http, TODAY_URL, sleep)
    if body is None:
        raise FxSourceError("today.xml missing")
    return parse_bulletin(body)


def make_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return make_http_client(timeout_s=30.0, transport=transport)


__all__ = [
    "ARCHIVE_URL",
    "TODAY_URL",
    "FxRate",
    "FxSourceError",
    "archive_url",
    "available_at",
    "fetch_day",
    "fetch_today",
    "make_client",
    "parse_bulletin",
]
