"""The Reader held to what the code knows about an E2's attachment; the client's bounded retries."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
import pytest

from kaptan.agents.reader_facts import AttachmentFacts, attachment_facts, ground_insider, unreadable_answer
from kaptan.domain.schemas.agents import InsiderTradeExtraction
from kaptan.ingest.kap_client import KapBlockedError, KapClient, KapClientConfig, KapError, KapNotFoundError

ROWS = (
    {
        "date": "2026-10-30",
        "buy_nominal_try": "111110",
        "sell_nominal_try": "12180",
        "net_nominal_try": "98930",
        "start_nominal_try": "1707513",
        "end_nominal_try": "1806443",
        "start_capital_pct": "2.846",
        "start_vote_pct": "2.846",
        "end_capital_pct": "3.011",
        "end_vote_pct": "3.011",
    },
)
READ = AttachmentFacts("read", rows=ROWS)


def answer(**over: Any) -> dict[str, Any]:
    return {
        **unreadable_answer(AttachmentFacts("unreadable", reason="x")),
        "status": "ok",
        "confidence": 0.8,
        "abstain": None,
        "notes_tr": "Okundu.",
        "direction": "buy",
        "trades": [{"trade_date": "2026-10-30", "qty": 999999.0, "price_tl": None, "value_tl": 1.0}],
        **over,
    }


def test_facts_come_only_from_a_document_that_went_through_the_attachment_path() -> None:
    assert attachment_facts(None) is None
    assert attachment_facts({"kind": "insider_trade", "rows": []}) is None
    facts = attachment_facts({"attachment_status": "unreadable", "attachment_reason": "Ek şifreli; açılamadı."})
    assert facts is not None and facts.status == "unreadable" and facts.reason == "Ek şifreli; açılamadı."


def test_the_unreadable_answer_is_a_valid_abstain_without_a_single_figure() -> None:
    doc = unreadable_answer(AttachmentFacts("unreadable", reason="Ek taranmış görüntü; metni okunamadı."))
    InsiderTradeExtraction.model_validate(doc)
    assert doc["status"] == "abstain" and doc["abstain"]["reason"] == "attachment_missing"
    assert doc["abstain"]["detail_tr"] == "Ek taranmış görüntü; metni okunamadı."
    assert doc["trades"] == [] and doc["holding_after_pct"] is None


def test_verified_rows_overwrite_what_the_reader_reported() -> None:
    doc = ground_insider(answer(), READ, "metin")
    InsiderTradeExtraction.model_validate(doc)
    assert [t["qty"] for t in doc["trades"]] == [111110.0, 12180.0]
    assert doc["direction"] == "mixed"
    assert doc["holding_before_pct"] == 2.846 and doc["holding_after_pct"] == 3.011
    assert "tablodan" in doc["notes_tr"]


def test_a_single_price_is_used_only_when_the_range_is_one_number() -> None:
    from decimal import Decimal

    one = AttachmentFacts("read", rows=ROWS, price_low=Decimal("3.47"), price_high=Decimal("3.47"))
    assert ground_insider(answer(), one, "metin")["trades"][0]["price_tl"] == 3.47
    wide = AttachmentFacts("read", rows=ROWS, price_low=Decimal("3.47"), price_high=Decimal("4"))
    assert ground_insider(answer(), wide, "metin")["trades"][0]["price_tl"] is None


def test_grounding_leaves_the_input_alone() -> None:
    original = answer()
    ground_insider(original, READ, "metin")
    assert original["trades"][0]["qty"] == 999999.0


def test_figures_missing_from_the_text_turn_into_an_abstain() -> None:
    doc = ground_insider(answer(), AttachmentFacts("no_table"), "Pay alımı yapılmıştır.")
    InsiderTradeExtraction.model_validate(doc)
    assert doc["status"] == "abstain" and doc["abstain"]["reason"] == "conflicting_values" and doc["trades"] == []


def test_figures_found_in_the_text_stand_when_there_is_no_verified_table() -> None:
    trades = [{"trade_date": "2026-10-30", "qty": 5000.0, "price_tl": 141.5, "value_tl": None}]
    text = "30/10/2026 tarihinde 141,50 TL fiyattan 5.000 TL nominal pay alınmıştır."
    doc = ground_insider(answer(trades=trades), AttachmentFacts("no_table"), text)
    assert doc["status"] == "ok" and doc["trades"] == trades


def test_an_abstain_stays_an_abstain() -> None:
    out = answer(status="abstain", abstain={"reason": "ambiguous", "detail_tr": "Belirsiz."}, trades=[])
    assert ground_insider(out, READ, "metin") == out


# ── bounded retries ──────────────────────────────────────────────────────
class Clock:
    def __init__(self) -> None:
        self.t = 0.0
        self.slept: list[float] = []

    def now(self) -> float:
        return self.t

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.t += seconds


def make(handler: Callable[[httpx.Request], httpx.Response]) -> tuple[KapClient, Clock]:
    clock = Clock()
    cfg = KapClientConfig(min_interval_s=2.0, max_retries=4, timeout_s=60)
    client = KapClient(
        cfg, transport=httpx.MockTransport(handler), sleep=clock.sleep, rand=lambda: 0.0, clock=clock.now
    )
    return client, clock


def _dropped(_req: httpx.Request) -> httpx.Response:
    raise httpx.RemoteProtocolError("Server disconnected without sending a response.")


async def test_bildirim_pdf_gives_up_after_one_retry_when_the_connection_drops() -> None:
    client, clock = make(_dropped)
    async with client:
        with pytest.raises(KapError, match="2 attempts"):
            await client.bildirim_pdf(1)
    assert client.requests_made == 2
    assert sum(clock.slept) < 5  # used to be about 40 s per document before the fallback


async def test_attachment_downloads_with_its_own_short_timeout() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, content=b"\xac\xed\x00\x05data")

    client, _clock = make(handler)
    async with client:
        data = await client.attachment("4028328ca17e4f5f01a19abf848b2433", 1690388)
    assert data.startswith(b"\xac\xed")
    assert str(seen[0].url).endswith("/tr/api/file/download/4028328ca17e4f5f01a19abf848b2433")
    assert seen[0].headers["referer"].endswith("/tr/Bildirim/1690388")
    assert seen[0].extensions["timeout"]["read"] == 20.0


async def test_attachment_refuses_an_id_that_is_not_kaps() -> None:
    client, _clock = make(_dropped)
    async with client:
        with pytest.raises(ValueError, match="object id"):
            await client.attachment("../../secret", 1)
    assert client.requests_made == 0


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx.Response(403), KapBlockedError),
        (httpx.Response(200, content=b""), KapBlockedError),
        (httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html>waf</html>"), KapBlockedError),
        (httpx.Response(404), KapNotFoundError),
    ],
)
async def test_attachment_failures_are_told_apart(response: httpx.Response, error: type[Exception]) -> None:
    client, _clock = make(lambda _req: response)
    async with client:
        with pytest.raises(error):
            await client.attachment("4028328ca17e4f5f01a19abf848b2433", 1)
    assert client.requests_made == 1
