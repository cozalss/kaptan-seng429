"""The honest "is KAPtan working?" summary the panel shows: pure rules, no I/O."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from kaptan.ops import system_status as s

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
ALIVE = {"status": "ok", "age_s": 3.0, "state": "running"}
MISSING = {"status": "missing"}


def facts(**over: Any) -> s.Facts:
    base: dict[str, Any] = {
        "heartbeats": {"ingest_worker": ALIVE, "agent_worker": ALIVE, "scheduler": ALIVE},
        "last_poll_at": NOW - timedelta(seconds=40),
        "last_run_at": NOW - timedelta(hours=2),
        "last_backup_at": NOW - timedelta(hours=9),
        "warming_up": False,
        "first_seen_at": NOW - timedelta(days=30),  # an install that is not on its first day
    }
    return s.Facts(**{**base, **over})


def codes(doc: dict[str, Any]) -> list[str]:
    return [p["code"] for p in doc["problems"]]


def test_everything_fine_has_no_message() -> None:
    doc = s.summarize(NOW, facts())
    assert doc["reading"] is True and doc["message"] is None and doc["problems"] == []
    assert doc["ingest"] == {"ok": True, "last_poll_at": "2026-11-03T11:59:20.000Z", "age_s": 40}
    assert doc["agents"]["ok"] is True and doc["agents"]["age_s"] == 7200
    assert doc["scheduler"] == {"ok": True}
    assert doc["backup"]["ok"] is True and doc["backup"]["age_h"] == 9.0


def test_a_dead_ingest_worker_says_kaptan_is_not_reading() -> None:
    doc = s.summarize(NOW, facts(heartbeats={"ingest_worker": MISSING, "agent_worker": ALIVE, "scheduler": ALIVE}))
    assert doc["reading"] is False
    assert doc["message"] == "KAPtan şu an bildirim okumuyor."
    assert codes(doc) == ["ingest_down"]


def test_an_alive_worker_whose_polls_stopped_succeeding_is_not_reading_either() -> None:
    old = NOW - timedelta(seconds=s.POLL_STALE_S + 1)
    doc = s.summarize(NOW, facts(last_poll_at=old))
    assert doc["reading"] is False and codes(doc) == ["ingest_stale"]
    assert doc["message"] == s.KAP_SILENT  # the worker lives: KAP (or the network) is the one that is silent


def test_a_worker_that_never_polled_is_not_reading() -> None:
    assert s.summarize(NOW, facts(last_poll_at=None))["reading"] is False


def test_the_night_poll_interval_and_the_longest_back_off_do_not_read_as_stale() -> None:
    assert s.summarize(NOW, facts(last_poll_at=NOW - timedelta(seconds=660)))["reading"] is True


def test_agents_down_keeps_reading_true_and_says_so() -> None:
    doc = s.summarize(NOW, facts(heartbeats={"ingest_worker": ALIVE, "agent_worker": MISSING, "scheduler": ALIVE}))
    assert doc["reading"] is True and codes(doc) == ["agents_down"]
    assert doc["message"] == "KAPtan bildirimleri okuyor ama şu an değerlendirmiyor."


def test_first_warm_up_is_named_instead_of_looking_broken() -> None:
    doc = s.summarize(
        NOW, facts(heartbeats={"ingest_worker": ALIVE, "agent_worker": MISSING, "scheduler": ALIVE}, warming_up=True)
    )
    assert codes(doc) == ["warming_up"]
    assert doc["message"] == "KAPtan ilk hazırlığını yapıyor. Bu 15-25 dakika sürebilir."


def test_scheduler_down() -> None:
    doc = s.summarize(NOW, facts(heartbeats={"ingest_worker": ALIVE, "agent_worker": ALIVE, "scheduler": MISSING}))
    assert doc["scheduler"] == {"ok": False} and codes(doc) == ["scheduler_down"]


def test_backup_never_and_backup_stale() -> None:
    never = s.summarize(NOW, facts(last_backup_at=None))
    assert codes(never) == ["backup_never"] and never["backup"] == {"ok": False, "last_at": None, "age_h": None}
    assert never["message"] == "Henüz yedek alınmadı."
    stale = s.summarize(NOW, facts(last_backup_at=NOW - timedelta(days=3)))
    assert codes(stale) == ["backup_stale"] and stale["backup"]["age_h"] == 72.0
    assert stale["message"] == "Son yedek 3 gün önce alındı."
    assert stale["reading"] is True


def test_the_message_is_the_most_important_problem() -> None:
    doc = s.summarize(
        NOW,
        facts(
            heartbeats={"ingest_worker": MISSING, "agent_worker": MISSING, "scheduler": MISSING},
            last_backup_at=None,
        ),
    )
    assert codes(doc) == ["ingest_down", "agents_down", "scheduler_down", "backup_never"]
    assert doc["message"] == "KAPtan şu an bildirim okumuyor."


def test_redis_being_away_reads_as_every_worker_down() -> None:
    doc = s.summarize(NOW, facts(heartbeats={}, last_poll_at=None))
    assert doc["reading"] is False and codes(doc)[:3] == ["ingest_down", "agents_down", "scheduler_down"]


NO_WORKERS = {"ingest_worker": MISSING, "agent_worker": MISSING, "scheduler": MISSING}


def test_first_install_waiting_for_the_first_warm_up_is_not_a_fault() -> None:
    held = {"ingest_worker": ALIVE, "agent_worker": MISSING, "scheduler": ALIVE}
    doc = s.summarize(
        NOW, facts(heartbeats=held, warmed=False, warming_up=False, last_backup_at=None, first_seen_at=None)
    )
    assert codes(doc) == ["waiting_for_warmup"]
    assert doc["reading"] is True and "backup_never" not in codes(doc)


def test_no_backup_on_the_first_day_is_not_a_problem_but_later_it_is() -> None:
    day_one = facts(last_backup_at=None, first_seen_at=NOW - timedelta(hours=3))
    assert codes(s.summarize(NOW, day_one)) == []
    week = facts(last_backup_at=None, first_seen_at=NOW - timedelta(days=4))
    assert codes(s.summarize(NOW, week)) == ["backup_never"]


def test_a_failed_backup_is_named_even_when_an_old_one_exists() -> None:
    doc = s.summarize(NOW, facts(backup_failed_at=NOW - timedelta(hours=1), last_backup_at=NOW - timedelta(hours=20)))
    assert codes(doc) == ["backup_failed"] and doc["backup"]["ok"] is False


def test_the_pc_just_woke_up_is_one_calm_sentence_not_three_alarms() -> None:
    doc = s.summarize(NOW, facts(heartbeats=NO_WORKERS, woke_s_ago=40.0))
    assert codes(doc) == ["waking_up"] and doc["message"] == s.WAKING
    assert doc["reading"] is False  # honest: nothing is being read this minute


def test_a_machine_that_did_not_just_wake_gets_the_real_problems() -> None:
    assert codes(s.summarize(NOW, facts(heartbeats=NO_WORKERS))) == ["ingest_down", "agents_down", "scheduler_down"]


def test_the_database_being_away_is_the_only_thing_said() -> None:
    doc = s.summarize(NOW, facts(heartbeats=NO_WORKERS, db_ok=False))
    assert codes(doc) == ["db_down"]


def test_a_missing_model_key_is_a_setting_not_a_crash() -> None:
    held = {"ingest_worker": ALIVE, "agent_worker": MISSING, "scheduler": ALIVE}
    assert codes(s.summarize(NOW, facts(heartbeats=held, llm_ready=False))) == ["llm_missing"]


def test_waiting_for_starting_money_is_never_listed_as_a_problem() -> None:
    assert all("money" not in c and "setup" not in c for c in codes(s.summarize(NOW, facts())))


def test_alerts_fact_is_additive_and_a_failing_channel_is_a_problem() -> None:
    quiet = s.summarize(NOW, facts(alerts={"ntfy": True, "email": False, "last_sent_at": None, "last_error_tr": None}))
    assert quiet["alerts"] == {"ok": True, "ntfy": True, "email": False, "last_sent_at": None}
    assert quiet["problems"] == []
    bad = {"ntfy": True, "email": False, "last_sent_at": None, "last_error_tr": "Telefon bildirimi gönderilemedi."}
    doc = s.summarize(NOW, facts(alerts=bad))
    assert codes(doc) == ["alerts_failing"] and doc["alerts"]["ok"] is False


def test_down_codes_are_the_parts_the_alert_watch_counts() -> None:
    assert {"ingest_down", "ingest_stale", "agents_down"} == s.DOWN_CODES


def test_wake_watch_notices_a_jump_of_the_wall_clock_only() -> None:
    wall, mono = [1000.0], [50.0]
    watch = s.WakeWatch(lambda: wall[0], lambda: mono[0])
    wall[0], mono[0] = 1010.0, 60.0
    assert watch.look() is None
    wall[0], mono[0] = 5010.0, 70.0  # the wall clock ran 4 990 s ahead of the process clock: asleep
    assert watch.look() == 0.0
    wall[0], mono[0] = 5110.0, 170.0
    assert watch.look() == 100.0
    wall[0], mono[0] = 5110.0 + s.WAKE_GRACE_S + 1, 170.0 + s.WAKE_GRACE_S + 1
    assert watch.look() is None
