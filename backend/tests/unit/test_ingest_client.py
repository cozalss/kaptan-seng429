"""KapClient politeness and error handling, offline (httpx.MockTransport), plus detail extraction."""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import date

import httpx
import pytest

from kaptan.ingest.kap_client import (
    KapBlockedError,
    KapClient,
    KapClientConfig,
    KapError,
    KapNotFoundError,
    backoff_delay,
)
from kaptan.ingest.kap_detail import (
    DetailError,
    fetch_detail,
    pdf_to_text,
    rsc_payload,
    rsc_texts,
)
from kaptan.settings import Settings
from tests.ingest_support import detail_html, detail_pdf, detail_text, list_main

Handler = Callable[[httpx.Request], httpx.Response]


class FakeTime:
    """A monotonic clock that only moves when the client sleeps."""

    def __init__(self) -> None:
        self.t = 1000.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.t

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.t += seconds


def make(handler: Handler, *, retries: int = 3, min_interval: float = 2.0) -> tuple[KapClient, FakeTime]:
    ft = FakeTime()
    cfg = KapClientConfig(min_interval_s=min_interval, max_retries=retries, timeout_s=5)
    client = KapClient(cfg, transport=httpx.MockTransport(handler), sleep=ft.sleep, rand=lambda: 0.0, clock=ft.clock)
    return client, ft


async def test_list_main_sends_a_browser_like_request() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json=list_main(date(2026, 10, 15))[:2])

    client, _ = make(handler)
    async with client:
        rows = await client.list_main(date(2026, 10, 15), date(2026, 10, 15))
    assert len(rows) == 2
    req = seen[0]
    assert req.method == "POST" and req.url.path == "/tr/api/disclosure/list/main"
    body = json.loads(req.content)
    assert body["fromDate"] == "15.10.2026" and body["memberTypes"] == ["IGS"]
    assert req.headers["user-agent"].startswith("Mozilla/5.0")
    assert req.headers["origin"] == "https://www.kap.org.tr"
    assert req.headers["referer"].startswith("https://www.kap.org.tr/tr/")
    assert client.requests_made == 1


async def test_by_criteria_uses_iso_dates_and_the_class_filter() -> None:
    bodies: list[dict[str, object]] = []

    def handler(req: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(req.content))
        return httpx.Response(200, json=[])

    client, _ = make(handler)
    async with client:
        assert await client.by_criteria(date(2026, 10, 16), date(2026, 10, 16), disclosure_class="FR") == []
    assert bodies[0]["fromDate"] == "2026-10-16" and bodies[0]["disclosureClass"] == "FR"
    assert bodies[0]["memberType"] == "IGS"


async def test_requests_are_spaced_by_the_minimum_interval() -> None:
    client, ft = make(lambda req: httpx.Response(200, json=[]), min_interval=2.0)
    async with client:
        for _ in range(3):
            await client.company_items()
    assert ft.sleeps == [2.0, 2.0]  # the first request does not wait; jitter is 0 in this test


async def test_5xx_and_429_are_retried_with_backoff_and_retry_after() -> None:
    answers = iter(
        [httpx.Response(503), httpx.Response(429, headers={"Retry-After": "30"}), httpx.Response(200, json=[{"a": 1}])]
    )
    client, ft = make(lambda req: next(answers), min_interval=1.0)
    async with client:
        assert await client.company_items() == [{"a": 1}]
    backoffs = [s for s in ft.sleeps if s >= 2.0]
    assert backoffs == [2.0, 30.0]
    assert client.requests_made == 3


async def test_gives_up_after_the_retry_budget() -> None:
    client, _ = make(lambda req: httpx.Response(502), retries=2)
    async with client:
        with pytest.raises(KapError, match="gave up after 3 attempts"):
            await client.company_items()
    assert client.requests_made == 3


async def test_transport_errors_are_retried() -> None:
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectTimeout("slow", request=req)
        return httpx.Response(200, json=[])

    client, _ = make(handler)
    async with client:
        assert await client.company_items() == []
    assert calls["n"] == 2


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(666, text="blocked"),
        httpx.Response(403, text="forbidden"),
        httpx.Response(200, text="<!DOCTYPE html><html>Request Rejected</html>", headers={"content-type": "text/html"}),
        httpx.Response(200, content=b""),
        httpx.Response(200, text="not json", headers={"content-type": "application/json"}),
    ],
)
async def test_waf_signals_raise_at_once_without_retry(response: httpx.Response) -> None:
    client, _ = make(lambda req: response)
    async with client:
        with pytest.raises(KapBlockedError):
            await client.company_items()
    assert client.requests_made == 1


async def test_unexpected_answers() -> None:
    answers = {"/tr/api/company/items/IGS/A": httpx.Response(200, json={"not": "a list"})}
    client, _ = make(lambda req: answers.get(req.url.path, httpx.Response(400)))
    async with client:
        with pytest.raises(KapError, match="JSON array"):
            await client.company_items()
        with pytest.raises(KapError, match="HTTP 400"):
            await client.list_main(date(2026, 10, 16), date(2026, 10, 16))
        with pytest.raises(ValueError, match="unsupported"):
            await client.company_items("XYZ")


async def test_pdf_and_page_endpoints() -> None:
    pdf = detail_pdf(1683372)

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/tr/api/BildirimPdf/1683372":
            return httpx.Response(200, content=pdf, headers={"content-type": "application/pdf"})
        if req.url.path == "/tr/api/BildirimPdf/1":
            return httpx.Response(200, text="<html>error</html>", headers={"content-type": "text/html"})
        if req.url.path == "/tr/Bildirim/1683355":
            return httpx.Response(200, text=detail_html(1683355), headers={"content-type": "text/html"})
        return httpx.Response(404)

    client, _ = make(handler)
    async with client:
        assert (await client.bildirim_pdf(1683372)).startswith(b"%PDF")
        assert "self.__next_f.push" in await client.bildirim_html(1683355)
        with pytest.raises(KapBlockedError, match="not a PDF"):
            await client.bildirim_pdf(1)
        with pytest.raises(KapNotFoundError):
            await client.bildirim_pdf(2)


def test_backoff_delay() -> None:
    assert backoff_delay(0, 0.0) == 2.0
    assert backoff_delay(3, 1.0) == pytest.approx(19.2)
    assert backoff_delay(20, 0.0) == 300.0
    assert backoff_delay(0, 0.0, "45") == 45.0 and backoff_delay(0, 0.0, "soon") == 2.0


def test_config_from_settings() -> None:
    s = Settings(database_url="postgresql://x@localhost/db", kap_min_interval_s=3.0, kap_base_url="https://kap.test/")
    cfg = KapClientConfig.from_settings(s)
    assert cfg.min_interval_s == 3.0 and cfg.base_url == "https://kap.test" and cfg.user_agent.startswith("Mozilla")
    with pytest.raises(ValueError):
        Settings(database_url="postgresql://x@localhost/db", kap_poll_session_s=10)  # never below 30 s
    assert KapClient.from_settings(s).config.min_interval_s == 3.0


# ── detail texts ──────────────────────────────────────────────────────────
def test_pdf_text_matches_the_recorded_text() -> None:
    assert pdf_to_text(detail_pdf(1682993)) == detail_text(1682993).rstrip("\n")
    with pytest.raises(DetailError, match="unreadable"):
        pdf_to_text(b"%PDF-1.4 garbage")


def test_rsc_payload_split_tr_en() -> None:
    texts = rsc_texts(rsc_payload(detail_html(1683355)))
    assert texts["tr"].startswith("Turgutlu Unlu Mamuller Tesisinin ikinci faz yatırımı")
    assert texts["en"].startswith("The installation of the machinery")
    assert rsc_payload("<html>no chunks</html>") == ""
    form = rsc_texts('<td class="content-tr">Kâr</td><td class="x content-en">Profit</td>')
    assert form == {"tr": "Kâr"}


class _Detail:
    def __init__(self, pdf: Exception | bytes, page: str | Exception) -> None:
        self.pdf, self.page = pdf, page

    async def bildirim_pdf(self, idx: int) -> bytes:
        if isinstance(self.pdf, Exception):
            raise self.pdf
        return self.pdf

    async def bildirim_html(self, idx: int) -> str:
        if isinstance(self.page, Exception):
            raise self.page
        return self.page


async def test_fetch_detail_prefers_the_pdf_and_falls_back_to_the_page() -> None:
    d = await fetch_detail(_Detail(detail_pdf(1683372), "unused"), 1683372)  # type: ignore[arg-type]
    assert d.source == "bildirim_pdf" and d.tr.startswith("AZTEK") and len(d.payload_sha256) == 32
    d = await fetch_detail(_Detail(KapNotFoundError("404"), detail_html(1683355)), 1683355)  # type: ignore[arg-type]
    assert d.source == "rsc_payload" and set(d.texts) == {"tr", "en"}
    with pytest.raises(KapBlockedError):
        await fetch_detail(_Detail(KapBlockedError("666"), "x"), 1)  # type: ignore[arg-type]
    with pytest.raises(DetailError, match="no text"):
        await fetch_detail(_Detail(KapError("bad"), "<html></html>"), 1)  # type: ignore[arg-type]
