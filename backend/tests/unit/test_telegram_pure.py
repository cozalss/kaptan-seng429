"""Telegram: message format, routing, the Bot API client (no database)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx
import pytest
import respx

from kaptan.alerts.prefs import default_prefs
from kaptan.telegram import format as fmt
from kaptan.telegram import link
from kaptan.telegram.botapi import BotApi, TelegramError, mask
from kaptan.telegram.routing import next_morning, quiet_reason, tier
from tests.unit.telegram_support import TOKEN, FakeTelegram, Sig


def test_a_company_name_with_markup_characters_is_escaped() -> None:
    sig = Sig(1, company="AT&T <Holding> A.Ş.", line_tr="Kâr 5 > 3 & zarar < 2.")
    text = fmt.one(sig)
    assert "AT&amp;T &lt;Holding&gt; A.Ş." in text
    assert "5 &gt; 3 &amp; zarar &lt; 2." in text
    assert "<Holding>" not in text and "<b>THYAO</b>" in text


def test_the_message_has_company_line_tone_so_what_and_time() -> None:
    text = fmt.one(Sig(1, suggestion_tr="KAPtan: tut"))
    assert text.splitlines()[0] == "<b>THYAO</b> · Türk Hava Yolları"
    assert "▲ olumlu" in text and "Genelde fiyatı destekler" in text and "KAPtan: tut" in text
    assert "<i>12:00</i>" in text  # Istanbul time


@pytest.mark.parametrize(
    ("tone", "mark"),
    [("olumlu", "▲ olumlu"), ("olumsuz", "▼ olumsuz"), ("notr", "• nötr"), ("belirsiz", "• nötr")],
)
def test_tone_marks(tone: str, mark: str) -> None:
    assert fmt.tone_mark(tone) == mark


def test_a_burst_is_one_grouped_message() -> None:
    sigs = [Sig(i, line_tr=f"Duyuru {i}") for i in (1, 2, 3)]
    text = fmt.group("THYAO", "Türk Hava Yolları", sigs)
    assert "THYAO</b> · Türk Hava Yolları: 3 yeni duyuru" in text
    assert text.count("•") >= 3 and "Duyuru 3" in text


def test_buttons_are_read_later_open_and_mute_and_never_approve() -> None:
    kb = fmt.keyboard([Sig(5)])["inline_keyboard"]
    flat = [b for row in kb for b in row]
    assert [b["text"] for b in flat] == ["Okudum", "Sonra oku", "Aç", "Bu şirketi sustur"]
    assert flat[0]["callback_data"] == "ok:5" and flat[3]["callback_data"] == "mute:THYAO"
    assert flat[2]["url"].startswith("https://www.kap.org.tr/") and "localhost" not in flat[2]["url"]
    assert all(len(b.get("callback_data", "").encode()) <= 64 for b in flat)
    assert not any("onay" in b["text"].lower() for b in flat)


def test_the_suggestion_message_has_the_reason_and_no_money() -> None:
    text = fmt.suggestion("THYAO", "buy", "Geri alım duyurusu")
    assert "THYAO</b> için al önerisi hazır" in text and "Geri alım duyurusu" in text
    assert "₺" not in text and "adet" not in text


@pytest.mark.parametrize(
    ("level", "sig", "expected"),
    [
        ("normal", Sig(1), "instant"),
        ("normal", Sig(1, mine="watched"), "instant"),
        ("normal", Sig(1, mine=None), "morning"),
        ("normal", Sig(1, important=False), "skip"),
        ("less", Sig(1, tone="notr"), "morning"),
        ("less", Sig(1, mine="watched", tone="olumlu"), "morning"),
        ("less", Sig(1, tone="olumsuz"), "instant"),
        ("more", Sig(1, important=False, mine="watched"), "instant"),
        ("more", Sig(1, important=False, mine="held"), "skip"),
    ],
)
def test_tiers(level: str, sig: Sig, expected: str) -> None:
    assert tier(sig, level) == expected


def test_quiet_hours_and_sessiz_hold_instant_messages() -> None:
    prefs = default_prefs()
    noon = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)
    assert quiet_reason({"silent_until": None}, prefs, noon) is None
    assert quiet_reason({"silent_until": datetime(2026, 11, 24, 6, 0, tzinfo=UTC)}, prefs, noon) == "quiet"
    night = {**prefs, "quiet": {"on": True, "start": "22:00", "end": "08:00"}}
    assert quiet_reason({"silent_until": None}, night, datetime(2026, 11, 23, 20, 0, tzinfo=UTC)) == "quiet"
    assert quiet_reason({"silent_until": None}, night, noon) is None


def test_sessiz_lasts_until_the_next_morning_message() -> None:
    assert next_morning(datetime(2026, 11, 23, 9, 0, tzinfo=UTC)) == datetime(2026, 11, 24, 5, 45, tzinfo=UTC)
    assert next_morning(datetime(2026, 11, 23, 3, 0, tzinfo=UTC)) == datetime(2026, 11, 23, 5, 45, tzinfo=UTC)


def test_the_pairing_code_is_checked_by_hash_and_expires() -> None:
    now = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)
    code = link.new_code()
    state = {"pair_code_hash": link.hash_code(code), "pair_expires_at": now + link.CODE_TTL}
    assert link.code_matches(state, code, now)
    assert not link.code_matches(state, code + "x", now)
    assert not link.code_matches(state, code, now + link.CODE_TTL)
    assert not link.code_matches({"pair_code_hash": None, "pair_expires_at": None}, code, now)
    assert link.deep_link("kaptan_bot", code) == f"https://t.me/kaptan_bot?start={code}"


def test_mask_removes_the_token_and_its_secret_half() -> None:
    assert TOKEN not in mask(f"error at /bot{TOKEN}/getMe", TOKEN)
    assert TOKEN.partition(":")[2] not in mask(f"x {TOKEN.partition(':')[2]}", TOKEN)
    assert repr(BotApi(TOKEN)) == "BotApi(token=***)"


async def test_the_token_never_reaches_a_log_or_an_error(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    with respx.mock() as mock:
        mock.post(url__regex=r"https://api\.telegram\.org/.*").mock(
            return_value=httpx.Response(401, json={"ok": False})
        )
        with pytest.raises(TelegramError) as caught:
            await BotApi(TOKEN).get_me()
    assert caught.value.reason == "http_401"
    assert TOKEN not in str(caught.value) and TOKEN not in caplog.text
    assert TOKEN.partition(":")[2] not in caplog.text


async def test_a_network_error_is_a_class_name_only() -> None:
    with respx.mock() as mock:
        mock.post(url__regex=r"https://api\.telegram\.org/.*").mock(side_effect=httpx.ConnectError("boom " + TOKEN))
        with pytest.raises(TelegramError) as caught:
            await BotApi(TOKEN).send_message(1, "x")
    assert caught.value.reason == "ConnectError" and TOKEN not in str(caught.value)


async def test_get_updates_asks_with_offset_timeout_and_the_kinds() -> None:
    fake = FakeTelegram()
    with respx.mock() as mock:
        fake.install(mock)
        await BotApi(TOKEN).get_updates(42, 25)
    (payload,) = fake.sent("getUpdates")
    assert payload == {"offset": 42, "timeout": 25, "allowed_updates": ["message", "callback_query"]}


def test_the_pydantic_mirror_matches_the_zod_schemas() -> None:
    from kaptan.domain.schemas.telegram import TelegramInput, TelegramPair, TelegramStatus
    from tests.contract.harness import assert_matches

    status = {
        "configured": True, "token_from_env": False, "bot_username": "kaptan_bot", "paired": True,
        "pairing_open": False, "pairing_expires_at": None, "level": "more", "daily_cap": 8,
        "silent_until": "2026-11-24T05:45:00.000Z", "last_sent_at": None,
        "cloud_on": True, "cloud_synced_at": "2026-11-24T05:40:00.000Z", "cloud_message_at": None,
        "cloud_kap": "blocked", "cloud_error": False,
    }  # fmt: skip
    assert_matches("TelegramStatus", TelegramStatus.model_validate(status).model_dump(mode="json"))
    pair = {"pair_link": "https://t.me/kaptan_bot?start=abc", "expires_at": "2026-11-24T05:45:00.000Z"}
    assert_matches("TelegramPair", TelegramPair.model_validate(pair).model_dump(mode="json"))
    assert TelegramInput.model_validate({"level": "less"}).token is None
