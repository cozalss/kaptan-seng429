"""events.publish / events.bus without Redis: names, validation, wire JSON = the panel's zod event unions."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from starlette.applications import Starlette
from starlette.requests import Request

from kaptan.domain.schemas import ApprovalCard
from kaptan.events import bus
from kaptan.events import publish as publish_mod
from kaptan.events.publish import publish
from tests.contract.harness import assert_matches

EXPECTED = Path(__file__).resolve().parents[1] / "fixtures" / "demo" / "expected"


def _fixture(name: str) -> Any:
    return json.loads((EXPECTED / name).read_text(encoding="utf-8"))


def _wire(stream: str, event: str, data: Any) -> dict[str, Any]:
    return {"event": event, "data": json.loads(publish_mod.encode(stream, event, data))}


def test_stream_keys() -> None:
    assert bus.stream_key("feed") == "kaptan:feed"
    assert bus.stream_key("desk") == "kaptan:desk"
    assert bus.stream_key("run:run-demo-e3-ornek") == "kaptan:run:run-demo-e3-ornek"
    for bad in ("run", "run:", "run:a b", "audit", "desk:x"):
        with pytest.raises(ValueError, match="unknown event stream"):
            bus.stream_key(bad)


def test_stream_id_shape() -> None:
    assert bus.is_stream_id("1736592000000-0")
    assert not bus.is_stream_id("$")
    assert not bus.is_stream_id("12-x")


def test_desk_events_match_the_panel_schema() -> None:
    card = _fixture("approvals_all.json")[0]
    for event in ("approval.requested", "approval.decided"):
        wire = _wire("desk", event, card)
        assert_matches("DeskEvent", wire)
        assert wire["data"] == card  # byte-identical to the REST payload
    assert_matches("DeskEvent", _wire("desk", "halt", _fixture("risk_status.json")))
    assert_matches("DeskEvent", _wire("desk", "kill_switch", _fixture("risk_status.json")))
    crisis = {**_fixture("risk_status.json"), "regime": "crisis"}
    assert_matches("DeskEvent", _wire("desk", "regime", crisis))
    sell = {**_fixture("tickets.json")[0], "side": "sell"}
    assert_matches("DeskEvent", _wire("desk", "ticket", sell))
    assert_matches("DeskEvent", _wire("desk", "limits.changed", _fixture("limits_view.json")))
    assert_matches("DeskEvent", _wire("desk", "ticket", _fixture("tickets.json")[0]))
    assert_matches("DeskEvent", _wire("desk", "order", _fixture("orders.json")[0]))


def test_feed_and_run_events_match_the_panel_schema() -> None:
    counters = _fixture("counters.json")
    assert_matches("FeedEvent", _wire("feed", "counters", counters))
    node = {
        "node": "classifier",
        "phase": "end",
        "at": "2027-01-11T10:40:01.250Z",
        "latency_ms": 820,
        "tokens_in": 1200,
        "tokens_out": 90,
    }
    assert_matches("RunEvent", _wire("run:run-demo-e3-ornek", "node", node))
    assert_matches("RunEvent", _wire("run:r1", "done", {"status": "completed", "outcome": None}))


def test_a_model_instance_is_accepted() -> None:
    card = ApprovalCard.model_validate(_fixture("approvals_all.json")[0])
    assert json.loads(publish_mod.encode("desk", "approval.decided", card))["proposal_id"] == card.proposal_id


def test_wrong_event_or_payload_is_a_programming_error() -> None:
    with pytest.raises(ValueError, match="not part of the feed stream"):
        publish_mod.encode("feed", "approval.decided", {})
    with pytest.raises(ValueError, match="unknown event stream"):
        publish_mod.encode("audit", "counters", {})
    with pytest.raises(ValidationError):
        publish_mod.encode("feed", "counters", {"total": "many"})


def test_frames_are_sse_text() -> None:
    assert bus.sse_frame("1-0", "halt", '{"a":1}') == 'id: 1-0\nevent: halt\ndata: {"a":1}\n\n'
    assert bus.comment_frame("keep-alive") == ": keep-alive\n\n"


def test_redis_of_accepts_app_request_or_client() -> None:
    client = Redis()
    app = Starlette()
    app.state.redis = client
    request = Request({"type": "http", "app": app, "headers": [], "method": "GET", "path": "/"})
    assert publish_mod.redis_of(client) is client
    assert publish_mod.redis_of(app) is client
    assert publish_mod.redis_of(request) is client


async def test_publish_survives_a_redis_outage(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    async def down(*_: Any) -> str:
        raise RedisConnectionError("down")

    monkeypatch.setattr(bus, "append", down)
    counters = _fixture("counters.json")
    assert await publish(Redis(), "feed", "counters", counters) is None
    assert "sse publish failed: stream=feed event=counters" in caplog.text
    with pytest.raises(ValidationError):  # validation still raises before Redis is touched
        await publish(Redis(), "feed", "counters", {})
