"""Our own async httpx client for the kap.org.tr website JSON endpoints (07 §1, 04 §3: the only KAP path).

    async with KapClient.from_settings(settings) as kap:
        rows = await kap.list_main(day, day)              # POST /tr/api/disclosure/list/main (dd.MM.yyyy)
        rows = await kap.by_criteria(day, day)            # POST /tr/api/disclosure/members/byCriteria (yyyy-MM-dd)
        members = await kap.company_items("IGS")          # GET  /tr/api/company/items/IGS/A (ticker ↔ member OID)
        pdf = await kap.bildirim_pdf(idx)                 # GET  /tr/api/BildirimPdf/{idx}  (application/pdf)
        page = await kap.bildirim_html(idx)               # GET  /tr/Bildirim/{idx}         (Next.js RSC page)

Politeness (MKK runs a WAF; `robots.txt` itself answers HTTP 666):
- one request at a time per client, at least `min_interval_s` apart, plus 0–25 % upward jitter;
- a real browser User-Agent with Origin/Referer;
- 429 / 5xx / timeouts / transport errors: exponential backoff 2, 4, 8 … s (cap 300 s, +0–20 % jitter,
  `Retry-After` honoured), at most `max_retries` retries;
- WAF signals (HTTP 666 or 403, an HTML page or an empty body where JSON/PDF was expected) are **not**
  retried here: `KapBlockedError` is raised at once and the caller (poller/backfill) backs off for minutes.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import Any, Final, Self

import httpx

from kaptan.settings import Settings

log = logging.getLogger("kaptan.ingest.kap")

WAF_STATUS: Final = frozenset({403, 666})
RETRY_STATUS: Final = frozenset({408, 425, 429, 500, 502, 503, 504})
BACKOFF_BASE_S: Final = 2.0
BACKOFF_CAP_S: Final = 300.0
MEMBER_TYPES: Final = ("IGS",)


class KapError(Exception):
    """KAP did not give a usable answer (after retries)."""


class KapBlockedError(KapError):
    """A WAF / throttling signal: back off for minutes, never retry quickly."""


class KapNotFoundError(KapError):
    """HTTP 404 (unknown disclosure index)."""


@dataclass(frozen=True, slots=True)
class KapClientConfig:
    base_url: str = "https://www.kap.org.tr"
    user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0"
    timeout_s: float = 60.0
    min_interval_s: float = 2.0
    max_retries: int = 4

    @classmethod
    def from_settings(cls, s: Settings) -> KapClientConfig:
        return cls(
            base_url=s.kap_base_url.rstrip("/"),
            user_agent=s.kap_user_agent,
            timeout_s=s.kap_timeout_s,
            min_interval_s=s.kap_min_interval_s,
            max_retries=s.kap_max_retries,
        )


Sleep = Callable[[float], Awaitable[Any]]


class Pacer:
    """Serialises requests and keeps them `min_interval_s` (+ jitter) apart."""

    def __init__(self, min_interval_s: float, *, sleep: Sleep, rand: Callable[[], float], clock: Callable[[], float]):
        self._min = min_interval_s
        self._sleep = sleep
        self._rand = rand
        self._clock = clock
        self._last: float | None = None
        self.lock = asyncio.Lock()

    async def wait(self) -> None:
        """Call with `lock` held."""
        if self._last is not None:
            gap = self._min * (1 + 0.25 * self._rand())
            remaining = self._last + gap - self._clock()
            if remaining > 0:
                await self._sleep(remaining)
        self._last = self._clock()


def backoff_delay(attempt: int, rand: float, retry_after: str | None = None) -> float:
    """Seconds before retry `attempt` (0-based): 2, 4, 8 … capped at 300, +0–20 %; Retry-After wins if larger."""
    delay = min(BACKOFF_CAP_S, BACKOFF_BASE_S * (2.0**attempt)) * (1 + 0.2 * rand)
    if retry_after is not None and retry_after.strip().isdigit():
        delay = max(delay, min(BACKOFF_CAP_S, float(retry_after.strip())))
    return delay


def _looks_like_html(resp: httpx.Response) -> bool:
    ctype = resp.headers.get("content-type", "")
    head = resp.content[:200].lstrip().lower()
    return "text/html" in ctype or head.startswith((b"<!doctype", b"<html"))


class KapClient:
    def __init__(
        self,
        config: KapClientConfig | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Sleep = asyncio.sleep,
        rand: Callable[[], float] = random.random,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config or KapClientConfig()
        self._sleep = sleep
        self._rand = rand
        self._pacer = Pacer(self.config.min_interval_s, sleep=sleep, rand=rand, clock=clock)
        self._http = httpx.AsyncClient(
            base_url=self.config.base_url,
            transport=transport,
            timeout=httpx.Timeout(self.config.timeout_s, connect=min(15.0, self.config.timeout_s)),
            follow_redirects=True,
            headers={
                "User-Agent": self.config.user_agent,
                "Origin": self.config.base_url,
                "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
            },
        )
        self.requests_made = 0

    @classmethod
    def from_settings(cls, s: Settings, **kwargs: Any) -> KapClient:
        return cls(KapClientConfig.from_settings(s), **kwargs)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    # ── transport with politeness ────────────────────────────────────────
    async def _send(self, method: str, path: str, *, json_body: Any, accept: str, referer: str) -> httpx.Response:
        headers = {"Accept": accept, "Referer": f"{self.config.base_url}{referer}"}
        async with self._pacer.lock:
            await self._pacer.wait()
            self.requests_made += 1
            return await self._http.request(method, path, json=json_body, headers=headers)

    async def _request(
        self, method: str, path: str, *, kind: str, json_body: Any = None, referer: str = "/tr/"
    ) -> httpx.Response:
        """One logical request with retries. `kind` = "json" | "pdf" | "html" (what a good answer is)."""
        accept = {"json": "application/json, text/plain, */*", "pdf": "application/pdf,*/*"}.get(kind, "text/html,*/*")
        last_error = "no attempt"
        for attempt in range(self.config.max_retries + 1):
            try:
                resp = await self._send(method, path, json_body=json_body, accept=accept, referer=referer)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = f"{type(exc).__name__}"
                retry_after = None
            else:
                self._check_blocked(resp, kind, path)
                if resp.status_code == 404:
                    raise KapNotFoundError(f"{method} {path}: 404")
                if resp.status_code < 300:
                    return resp
                if resp.status_code not in RETRY_STATUS:
                    raise KapError(f"{method} {path}: HTTP {resp.status_code}")
                last_error = f"HTTP {resp.status_code}"
                retry_after = resp.headers.get("retry-after")
            if attempt == self.config.max_retries:
                break
            delay = backoff_delay(attempt, self._rand(), retry_after)
            log.warning("kap %s %s: %s, retry %d in %.1fs", method, path, last_error, attempt + 1, delay)
            await self._sleep(delay)
        raise KapError(f"{method} {path}: gave up after {self.config.max_retries + 1} attempts ({last_error})")

    @staticmethod
    def _check_blocked(resp: httpx.Response, kind: str, path: str) -> None:
        status = resp.status_code
        if status in WAF_STATUS:
            raise KapBlockedError(f"{path}: HTTP {status} (WAF)")
        if status >= 300:
            return
        if not resp.content.strip():
            raise KapBlockedError(f"{path}: empty body")
        if kind == "json" and _looks_like_html(resp):
            raise KapBlockedError(f"{path}: HTML page instead of JSON")
        if kind == "pdf" and not resp.content.lstrip().startswith(b"%PDF"):
            raise KapBlockedError(f"{path}: not a PDF ({resp.headers.get('content-type', '?')})")

    async def _json_list(self, method: str, path: str, *, json_body: Any = None, referer: str) -> list[dict[str, Any]]:
        resp = await self._request(method, path, kind="json", json_body=json_body, referer=referer)
        try:
            data = resp.json()
        except ValueError as exc:
            raise KapBlockedError(f"{path}: body is not JSON") from exc
        if not isinstance(data, list) or not all(isinstance(r, dict) for r in data):
            raise KapError(f"{path}: expected a JSON array of objects, got {type(data).__name__}")
        return data

    # ── endpoints ────────────────────────────────────────────────────────
    async def list_main(self, day_from: date, day_to: date) -> list[dict[str, Any]]:
        """Homepage feed rows `{disclosureBasic, disclosureDetail}` for listed companies (IGS)."""
        body = {
            "fromDate": day_from.strftime("%d.%m.%Y"),
            "toDate": day_to.strftime("%d.%m.%Y"),
            "disclosureType": None,
            "fundTypes": None,
            "memberTypes": list(MEMBER_TYPES),
            "mkkMemberOid": None,
        }
        return await self._json_list("POST", "/tr/api/disclosure/list/main", json_body=body, referer="/tr/")

    async def by_criteria(self, day_from: date, day_to: date, disclosure_class: str = "") -> list[dict[str, Any]]:
        """Disclosure query rows (flat), max 2000 per answer: query one day at a time."""
        body = {
            "fromDate": day_from.isoformat(),
            "toDate": day_to.isoformat(),
            "memberType": "IGS",
            "mkkMemberOidList": [],
            "inactiveMkkMemberOidList": [],
            "disclosureClass": disclosure_class,
            "subjectList": [],
            "isLate": "",
            "mainSector": "",
            "sector": "",
            "subSector": "",
            "marketOid": "",
            "index": "",
            "bdkReview": "",
            "bdkMemberOidList": [],
            "year": "",
            "term": "",
            "ruleType": "",
            "period": "",
            "fromSrc": False,
            "srcCategory": "",
            "disclosureIndexList": [],
        }
        return await self._json_list(
            "POST", "/tr/api/disclosure/members/byCriteria", json_body=body, referer="/tr/bildirim-sorgu"
        )

    async def company_items(self, member_type: str = "IGS", state: str = "A") -> list[dict[str, Any]]:
        """KAP members of a type (IGS = listed companies) with `stockCode` and `mkkMemberOid`."""
        if member_type not in MEMBER_TYPES or state not in {"A", "P"}:
            raise ValueError(f"unsupported member type/state: {member_type}/{state}")
        return await self._json_list(
            "GET", f"/tr/api/company/items/{member_type}/{state}", referer="/tr/bist-sirketler"
        )

    async def bildirim_pdf(self, disclosure_index: int) -> bytes:
        resp = await self._request(
            "GET",
            f"/tr/api/BildirimPdf/{int(disclosure_index)}",
            kind="pdf",
            referer=f"/tr/Bildirim/{disclosure_index}",
        )
        return resp.content

    async def bildirim_html(self, disclosure_index: int) -> str:
        resp = await self._request("GET", f"/tr/Bildirim/{int(disclosure_index)}", kind="html", referer="/tr/")
        return resp.text
