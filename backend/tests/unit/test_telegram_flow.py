"""Telegram rules without a database: pairing, foreign chats, buttons, caps and grouping, quiet-hours carry-over,
the morning and weekend messages, the "was off" message, Less/More, the token in logs. Telegram is a fake (respx)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import respx

from kaptan.telegram import dispatch, handlers, link, morning, runner
from kaptan.telegram.botapi import BotApi
from kaptan.telegram.routing import SEND_GAP_S
from kaptan.workers.scheduler import BY_NAME, slot_of
from tests.unit.telegram_memory import FakePool, Mem, install
from tests.unit.telegram_support import TOKEN, FakeTelegram, Sig, button, message

CHAT = 4242
T0 = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)  # Monday 12:00 Istanbul
CONN: Any = FakePool().conn


@pytest.fixture
def mem(monkeypatch: pytest.MonkeyPatch) -> Mem:
    m = install(monkeypatch)
    m.state.update(chat_id=CHAT, token=TOKEN, bot_username="kaptan_test_bot", paired_at=T0 - timedelta(days=1))
    return m


@pytest.fixture
def tg() -> Any:
    fake = FakeTelegram()
    with respx.mock(assert_all_called=False) as mock:
        fake.install(mock)
        yield fake


async def _no_sleep(_s: float) -> None: ...


async def _pass(mem: Mem, now: datetime, sleep: Any = _no_sleep) -> int:
    return await dispatch.instant_pass(CONN, BotApi(TOKEN), dict(mem.state), mem.prefs(), now, sleep=sleep)


def _put(mem: Mem, *sigs: Sig) -> None:
    for s in sigs:
        mem.signals[s.disclosure_index] = s


# ── pairing ───────────────────────────────────────────────────────────────────


async def _pairing_mem(mem: Mem) -> str:
    code = link.new_code()
    mem.state.update(
        chat_id=None, paired_at=None, pair_code_hash=link.hash_code(code), pair_expires_at=T0 + link.CODE_TTL
    )
    return code


async def test_only_the_right_code_from_a_private_chat_pairs(mem: Mem, tg: FakeTelegram) -> None:
    code = await _pairing_mem(mem)
    api = BotApi(TOKEN)
    await handlers.handle_update(CONN, api, message(1, 555, "/start yanlis-kod-1234"), T0)
    await handlers.handle_update(CONN, api, message(2, 555, "merhaba"), T0)
    await handlers.handle_update(CONN, api, message(3, -100, f"/start {code}", chat_type="group"), T0)
    assert mem.state["chat_id"] is None and tg.sent() == []  # nothing said to a stranger
    await handlers.handle_update(CONN, api, message(4, 555, f"/start {code}"), T0)
    assert mem.state["chat_id"] == 555 and mem.state["pair_code_hash"] is None
    assert "Bağlandı" in tg.texts()[0]
    await handlers.handle_update(CONN, api, message(5, 777, f"/start {code}"), T0)  # the code is spent
    assert mem.state["chat_id"] == 555


async def test_an_expired_code_does_not_pair(mem: Mem, tg: FakeTelegram) -> None:
    code = await _pairing_mem(mem)
    await handlers.handle_update(CONN, BotApi(TOKEN), message(1, 555, f"/start {code}"), T0 + link.CODE_TTL)
    assert mem.state["chat_id"] is None


async def test_a_foreign_chat_is_ignored_and_logged(
    mem: Mem, tg: FakeTelegram, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    api = BotApi(TOKEN)
    for update in (message(1, 999, "/durum"), message(2, 999, "/sessiz"), button(3, 999, "mute:THYAO")):
        await handlers.handle_update(CONN, api, update, T0)
    assert tg.sent() == [] and tg.sent("answerCallbackQuery") == []
    assert mem.state["silent_until"] is None and mem.muted == []
    assert "unknown chat ignored (chat=999)" in caplog.text and "/durum" not in caplog.text


# ── commands and buttons ──────────────────────────────────────────────────────


async def test_buttons_mark_read_later_and_mute_and_edit_the_message(mem: Mem, tg: FakeTelegram) -> None:
    api = BotApi(TOKEN)
    await handlers.handle_update(CONN, api, button(1, CHAT, "ok:11"), T0)
    await handlers.handle_update(CONN, api, button(2, CHAT, "later:12"), T0)
    await handlers.handle_update(CONN, api, button(3, CHAT, "mute:THYAO"), T0)
    assert mem.triage == {11: "tamam", 12: "sonra"} and mem.muted == ["THYAO"]
    assert [m for m, _ in tg.calls][:2] == ["answerCallbackQuery", "editMessageText"]  # answered first, then edited
    edits = tg.sent("editMessageText")
    assert "✓ Okundu" in edits[0]["text"] and "susturuldu" in edits[2]["text"]
    assert edits[0]["reply_markup"]["inline_keyboard"] == [
        [{"text": "Aç", "url": "https://www.kap.org.tr/tr/Bildirim/1"}]
    ]
    assert len(tg.sent("answerCallbackQuery")) == 3


async def test_an_unknown_or_malformed_button_changes_nothing(mem: Mem, tg: FakeTelegram) -> None:
    for i, data in enumerate(("ok:abc", "mute:th yao", "zzz:1", "sample:ok", "")):
        await handlers.handle_update(CONN, BotApi(TOKEN), button(i, CHAT, data), T0)
    assert mem.triage == {} and mem.muted == [] and tg.sent("editMessageText") == []


async def test_commands_ayar_sessiz_durum(mem: Mem, tg: FakeTelegram) -> None:
    api = BotApi(TOKEN)
    await handlers.handle_update(CONN, api, message(1, CHAT, "/ayar çok"), T0)
    assert mem.state["level"] == "more"
    await handlers.handle_update(CONN, api, message(2, CHAT, "/ayar az"), T0)
    assert mem.state["level"] == "less"
    await handlers.handle_update(CONN, api, message(3, CHAT, "/ayar"), T0)
    assert tg.sent()[-1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == "lvl:less"
    await handlers.handle_update(CONN, api, button(4, CHAT, "lvl:normal"), T0)
    assert mem.state["level"] == "normal"
    await handlers.handle_update(CONN, api, message(5, CHAT, "/sessiz"), T0)
    assert mem.state["silent_until"] == datetime(2026, 11, 24, 5, 45, tzinfo=UTC)  # 08:45 Istanbul
    await handlers.handle_update(CONN, api, message(6, CHAT, "/durum"), T0)
    status = tg.texts()[-1]
    assert "0 anlık mesaj" in status and "sessizdeyim" in status
    assert all("durdur" not in t.lower() for t in tg.texts())  # there is no stop feature


# ── the instant tier ──────────────────────────────────────────────────────────


async def test_an_important_message_for_my_stock_goes_out_once(mem: Mem, tg: FakeTelegram) -> None:
    _put(mem, Sig(1, published_at=T0 - timedelta(minutes=5)))
    assert await _pass(mem, T0) == 1
    assert await _pass(mem, T0 + timedelta(minutes=1)) == 0  # a restart or the next tick never repeats it
    (text,) = tg.texts()
    assert text.startswith("<b>THYAO</b> · Türk Hava Yolları")
    assert tg.sent()[0]["parse_mode"] == "HTML"


async def test_other_companies_and_unimportant_items_are_not_instant(mem: Mem, tg: FakeTelegram) -> None:
    _put(mem, Sig(1, mine=None), Sig(2, important=False), Sig(3, ticker="ASELS", mine="watched"))
    assert await _pass(mem, T0) == 1
    assert "ASELS" in tg.texts()[0]


async def test_a_muted_company_is_silent(mem: Mem, tg: FakeTelegram) -> None:
    mem.muted = ["THYAO"]
    _put(mem, Sig(1))
    assert await _pass(mem, T0) == 0


async def test_a_burst_waits_thirty_minutes_and_goes_as_one_grouped_message(mem: Mem, tg: FakeTelegram) -> None:
    _put(mem, Sig(1, published_at=T0 - timedelta(minutes=2)))
    assert await _pass(mem, T0) == 1
    _put(mem, Sig(2, line_tr="İkinci duyuru.", published_at=T0 + timedelta(minutes=3)),
         Sig(3, line_tr="Üçüncü duyuru.", published_at=T0 + timedelta(minutes=6)))  # fmt: skip
    assert await _pass(mem, T0 + timedelta(minutes=10)) == 0
    assert await _pass(mem, T0 + timedelta(minutes=29)) == 0
    assert await _pass(mem, T0 + timedelta(minutes=31)) == 1
    grouped = tg.texts()[-1]
    assert "2 yeni duyuru" in grouped and "İkinci duyuru." in grouped and "Üçüncü duyuru." in grouped
    assert len(tg.texts()) == 2


async def test_three_at_once_are_one_message(mem: Mem, tg: FakeTelegram) -> None:
    _put(mem, *(Sig(i, line_tr=f"Duyuru {i}.", published_at=T0 - timedelta(minutes=i)) for i in (1, 2, 3)))
    assert await _pass(mem, T0) == 1
    assert "3 yeni duyuru" in tg.texts()[0]


async def test_the_daily_cap_sends_the_rest_to_the_morning(mem: Mem, tg: FakeTelegram) -> None:
    mem.state["daily_cap"] = 2
    tickers = ["AAAAA", "BBBBB", "CCCCC", "DDDDD"]
    _put(
        mem,
        *(
            Sig(i, ticker=t, company=f"{t} A.Ş.", published_at=T0 - timedelta(minutes=i))
            for i, t in enumerate(tickers, 1)
        ),
    )
    assert await _pass(mem, T0) == 2
    held = await mem_rows(mem, "held")
    assert [r["reason"] for r in held] == ["cap", "cap"]
    assert await _pass(mem, T0 + timedelta(hours=1)) == 0  # still over the cap today
    text, ids = await morning.build_morning(CONN, datetime(2026, 11, 24, 5, 45, tzinfo=UTC), frozenset())
    assert len(ids) == 2 and "sınırı dolduğu için" in text  # told in the morning, with a note


async def mem_rows(mem: Mem, state: str) -> list[dict[str, Any]]:
    return [r for r in mem.queue.values() if r["state"] == state]


async def test_messages_are_at_least_a_second_apart(mem: Mem, tg: FakeTelegram) -> None:
    _put(mem, Sig(1, ticker="AAAAA"), Sig(2, ticker="BBBBB"), Sig(3, ticker="CCCCC"))
    naps: list[float] = []

    async def nap(s: float) -> None:
        naps.append(s)

    assert await _pass(mem, T0, sleep=nap) == 3
    assert naps == [SEND_GAP_S, SEND_GAP_S] and SEND_GAP_S >= 1.0


async def test_a_failed_send_is_tried_again_not_lost(
    mem: Mem, tg: FakeTelegram, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    _put(mem, Sig(1))
    tg.fail_send = True
    assert await _pass(mem, T0) == 0 and mem.queue[1]["state"] == "queued"
    tg.fail_send = False
    assert await _pass(mem, T0 + timedelta(minutes=1)) == 1
    assert TOKEN not in caplog.text and TOKEN.partition(":")[2] not in caplog.text


async def test_quiet_hours_hold_messages_and_the_morning_carries_them(mem: Mem, tg: FakeTelegram) -> None:
    night = T0.replace(hour=20)  # 23:00 Istanbul
    prefs = {**mem.prefs(), "quiet": {"on": True, "start": "22:00", "end": "08:00"}}
    _put(mem, Sig(1, published_at=night - timedelta(minutes=5), line_tr="Gece geldi."))
    assert await dispatch.instant_pass(CONN, BotApi(TOKEN), dict(mem.state), prefs, night, sleep=_no_sleep) == 0
    assert mem.queue[1]["state"] == "held" and mem.queue[1]["reason"] == "quiet" and tg.sent() == []
    morning_at = datetime(2026, 11, 24, 5, 45, tzinfo=UTC)  # Tuesday 08:45 Istanbul
    assert await morning.send_morning(CONN, BotApi(TOKEN), dict(mem.state), frozenset(), morning_at)
    assert "Gece geldi." in tg.texts()[0] and mem.queue[1]["state"] == "done"  # carried, not dropped


async def test_sessiz_holds_instant_messages_until_the_morning(mem: Mem, tg: FakeTelegram) -> None:
    mem.state["silent_until"] = T0 + timedelta(hours=20)
    _put(mem, Sig(1))
    assert await _pass(mem, T0) == 0 and mem.queue[1]["state"] == "held"


async def test_less_and_more(mem: Mem, tg: FakeTelegram) -> None:
    mem.state["level"] = "less"
    _put(
        mem,
        Sig(1, tone="notr"),
        Sig(2, ticker="ASELS", mine="watched", tone="olumlu"),
        Sig(3, ticker="EREGL", tone="olumsuz"),
    )
    assert await _pass(mem, T0) == 1 and "EREGL" in tg.texts()[0]
    mem.state["level"] = "more"
    _put(mem, Sig(4, ticker="BIMAS", mine="watched", important=False, line_tr="Küçük haber."))
    assert await _pass(mem, T0 + timedelta(minutes=1)) >= 1
    assert any("BIMAS" in t for t in tg.texts())


# ── the morning message ───────────────────────────────────────────────────────

TUESDAY = datetime(2026, 11, 24, 5, 45, tzinfo=UTC)


async def test_the_morning_message_has_mine_first_then_the_top_five_others(mem: Mem, tg: FakeTelegram) -> None:
    _put(mem, Sig(1, published_at=TUESDAY - timedelta(hours=12), line_tr="Benim hissem."))
    for i in range(10, 17):
        _put(
            mem,
            Sig(
                i,
                ticker=f"OTH{i}",
                mine=None,
                company=f"Başka {i}",
                published_at=TUESDAY - timedelta(hours=11),
                line_tr=f"Diğer {i}.",
            ),
        )
    text, _ = await morning.build_morning(CONN, TUESDAY, frozenset())
    assert text.startswith("Günaydın.\nDün akşamdan beri senin hisselerinde:")
    assert "Benim hissem." in text and "Günün öne çıkanları:" in text
    assert text.count("Diğer") == 5 and "▲ olumlu" in text


async def test_an_empty_morning_says_so_plainly(mem: Mem, tg: FakeTelegram) -> None:
    text, _ = await morning.build_morning(CONN, TUESDAY, frozenset())
    assert "Senin hisselerinde önemli bir şey yok." in text and "öne çıkanları" not in text


async def test_the_morning_counts_notes_left_in_quiet_hours_of_other_channels(mem: Mem, tg: FakeTelegram) -> None:
    text, _ = await morning.build_morning(CONN, TUESDAY, frozenset(), carried_notes=2)
    assert "Sessiz saatlerde 2 bildirim kalmıştı" in text


async def test_monday_morning_comes_from_the_last_trading_day(mem: Mem, tg: FakeTelegram) -> None:
    monday = datetime(2026, 11, 30, 5, 45, tzinfo=UTC)  # after Friday 27 Nov
    _put(mem, Sig(1, published_at=datetime(2026, 11, 28, 9, 0, tzinfo=UTC), line_tr="Cumartesi haberi."))
    text, _ = await morning.build_morning(CONN, monday, frozenset())
    assert "Son iş gününden beri" in text and "Cumartesi haberi." in text


async def test_the_weekend_summary_replaces_silence_and_there_is_no_monday_double(mem: Mem, tg: FakeTelegram) -> None:
    friday = datetime(2026, 11, 27, 15, 30, tzinfo=UTC)  # 18:30 Istanbul
    _put(mem, Sig(1, published_at=friday - timedelta(hours=4), line_tr="Cuma haberi."))
    assert await morning.send_weekend(CONN, BotApi(TOKEN), dict(mem.state), frozenset(), friday)
    assert "Borsa yarın kapalı" in tg.texts()[0] and "Cuma haberi." in tg.texts()[0]
    monday = datetime(2026, 11, 30, 5, 45, tzinfo=UTC)
    text, _ = await morning.build_morning(CONN, monday, frozenset())
    assert "Cuma haberi." not in text and "Senin hisselerinde önemli bir şey yok." in text


async def test_the_weekend_summary_carries_this_weeks_learning_line(mem: Mem, tg: FakeTelegram) -> None:
    friday = datetime(2026, 11, 27, 15, 30, tzinfo=UTC)
    line = (
        "KAPtan bu hafta geri alım eşiğini %0,25'ten %0,2'ye indirdi; geçmiş testte karar başına net getiri "
        "+0,4 puan arttı."
    )
    assert await morning.send_weekend(CONN, BotApi(TOKEN), dict(mem.state), frozenset(), friday, line)
    text = tg.texts()[0]
    assert line in text and text.index(line) < text.index("Bir sonraki iş günü")


async def test_no_weekend_summary_before_a_trading_day(mem: Mem, tg: FakeTelegram) -> None:
    assert not await morning.send_weekend(
        CONN, BotApi(TOKEN), dict(mem.state), frozenset(), datetime(2026, 11, 24, 15, 30, tzinfo=UTC)
    )
    assert tg.sent() == []


def test_the_scheduler_runs_the_morning_on_trading_days_at_0845_and_the_summary_before_closed_days() -> None:
    job = BY_NAME["telegram_morning"]
    assert job.after == "morning_brief"
    assert slot_of(job, datetime(2026, 11, 24, 5, 44, tzinfo=UTC)) is None
    assert slot_of(job, datetime(2026, 11, 24, 5, 45, tzinfo=UTC)) == "2026-11-24"
    assert slot_of(job, datetime(2026, 11, 28, 6, 0, tzinfo=UTC)) is None  # Saturday: no morning message
    assert slot_of(BY_NAME["telegram_weekend"], datetime(2026, 11, 27, 15, 30, tzinfo=UTC)) == "2026-11-27"


# ── "KAPtan X saat kapalıydı" ─────────────────────────────────────────────────


async def test_after_a_gap_one_message_lists_what_happened_and_is_not_repeated_as_instant(
    mem: Mem, tg: FakeTelegram
) -> None:
    start, end = T0 - timedelta(hours=5), T0
    _put(mem, Sig(1, published_at=start + timedelta(hours=1), line_tr="Kapalıyken geldi."))
    assert await morning.send_gap(CONN, BotApi(TOKEN), dict(mem.state), (start, end), T0)
    text = tg.texts()[0]
    assert text.startswith("KAPtan 5,0 saat kapalıydı; bu sürede senin hisselerinde 1 önemli duyuru oldu:")
    assert "Kapalıyken geldi." in text
    assert await _pass(mem, T0) == 0  # told once


def test_the_gap_text_when_nothing_happened() -> None:
    assert morning.gap_text(12.0, []) == "KAPtan 12 saat kapalıydı; bu sürede senin hisselerinde önemli duyuru olmadı."


# ── the loop ──────────────────────────────────────────────────────────────────


async def test_the_offset_is_stored_after_each_update_and_a_restart_does_not_replay(mem: Mem, tg: FakeTelegram) -> None:
    tg.updates = [message(10, CHAT, "/durum"), message(11, 999, "/durum")]
    pool = FakePool()
    assert await runner.poll_once(pool, BotApi(TOKEN), lambda: T0, poll_s=0) == 2
    assert mem.state["update_offset"] == 12
    assert await runner.poll_once(pool, BotApi(TOKEN), lambda: T0, poll_s=0) == 0
    assert [p["offset"] for p in tg.sent("getUpdates")] == [0, 12]
    assert len(tg.texts()) == 1  # only the paired chat was answered


def test_backoff_grows_and_is_capped() -> None:
    assert [runner.backoff(n) for n in (1, 2, 3, 6, 20)] == [2.0, 4.0, 8.0, 60.0, 60.0]
