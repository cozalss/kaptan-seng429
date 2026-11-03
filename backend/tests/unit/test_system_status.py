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
    assert doc["message"] == "KAPtan şu an bildirim okumuyor."


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
