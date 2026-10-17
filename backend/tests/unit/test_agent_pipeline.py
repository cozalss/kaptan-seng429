"""The LangGraph pipeline in replay mode, without Postgres: parity with the panel's recorded runs,
interrupt/resume, failures and the run animation plan."""

from __future__ import annotations

import re
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any

import pytest

from kaptan.agents.context import RunContext
from kaptan.agents.explain import assemble
from kaptan.agents.graph import compile_graph
from kaptan.agents.scenario import resume_graph, run_graph
from kaptan.agents.timeline import DONE_AFTER_MS, plan
from kaptan.agents.trace import elapsed_until_now
from kaptan.llm.provider import LLMRequest, LLMResult, ProviderError
from tests.unit.agent_fixtures import context_for, diff, disclosure_doc, fixture_run, texts

DEMO_RUNS = ("run-demo-e3-ornek", "run-demo-redteam-dmogd", "run-demo-r04-tmslj")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


async def _explain(ctx: RunContext, thread: str) -> tuple[dict[str, Any], dict[str, Any]]:
    state = await run_graph(ctx, thread)
    run_id = ctx.disclosure.run_id
    return state, assemble(state, ctx, disclosure_doc(run_id), texts(run_id))


def _mask_times(doc: Any) -> Any:
    if isinstance(doc, dict):
        return {k: _mask_times(v) for k, v in doc.items()}
    if isinstance(doc, list):
        return [_mask_times(v) for v in doc]
    return "<t>" if isinstance(doc, str) and ISO.match(doc) else doc


@pytest.mark.parametrize("run_id", DEMO_RUNS)
async def test_demo_runs_reproduce_the_recorded_explain(run_id: str) -> None:
    ctx = context_for(run_id)
    _, explain = await _explain(ctx, f"{run_id}-parity")
    expected = fixture_run(run_id)["explain"]
    differences = diff(explain, expected)
    # The card is stamped when request_approval runs on the virtual timeline (the mock: +48 s).
    allowed = {".approval.created_at"} if run_id == "run-demo-e3-ornek" else set()
    assert {d.split(":")[0] for d in differences} == allowed, differences


async def test_injected_later_the_document_is_the_same_modulo_timestamps() -> None:
    run_id = "run-demo-e3-ornek"
    at = datetime(2027, 1, 11, 11, 7, 3, 250_000, tzinfo=UTC)
    _, explain = await _explain(context_for(run_id, published_at=at), "e3-later")
    assert explain["disclosure"]["published_at"] == "2027-01-11T11:07:03.250Z"
    assert explain["run"]["started_at"] == "2027-01-11T11:07:24.250Z"
    assert _mask_times(explain) == _mask_times(fixture_run(run_id)["explain"])


async def test_e3_interrupts_at_approval_and_resumes_to_execute() -> None:
    ctx = context_for("run-demo-e3-ornek")
    state = await run_graph(ctx, "e3-resume")
    assert state["status"] == "interrupted"
    assert state["approval_card"]["status"] == "pending"
    snapshot = await compile_graph().aget_state({"configurable": {"thread_id": "e3-resume"}})
    assert snapshot.next == ("approval",)
    done = await resume_graph(ctx, "e3-resume", {"decision": "approve", "approved_notional_try": None, "comment": ""})
    assert done["status"] == "completed"
    assert done["decision"]["decision"] == "approve"
    assert [s["node"] for s in done["steps"]][-3:] == ["approval", "execute", "record"]
    at_send = done["risk"]["checks"][-1]
    assert (at_send["rule_code"], at_send["phase"], at_send["outcome"]) == ("R16", "at_send", "pass")


@pytest.mark.parametrize(
    ("decision", "expected"),
    [
        ({"decision": "reject", "approved_notional_try": None, "comment": "Hayır."}, "reject"),
        ({"decision": "expire"}, "expire"),
        ({"decision": "approve", "approved_notional_try": 999_999.0, "comment": ""}, "reject"),
    ],
)
async def test_resume_without_execution(decision: dict[str, Any], expected: str) -> None:
    ctx = context_for("run-demo-e3-ornek")
    thread = f"e3-{expected}-{decision.get('approved_notional_try')}"
    await run_graph(ctx, thread)
    done = await resume_graph(ctx, thread, decision)
    assert done["decision"]["decision"] == expected
    assert done["status"] == "completed"
    assert "execute" not in [s["node"] for s in done["steps"]]


async def test_kill_switch_makes_the_gate_reject() -> None:
    ctx = context_for("run-demo-e3-ornek", kill_switch_on=True)
    state, explain = await _explain(ctx, "e3-killed")
    assert state["outcome"] == "NO_TRADE"
    assert explain["approval"] is None
    assert explain["proposal"] is None
    assert explain["risk_checks"][-1]["rule_code"] == "R01"
    assert explain["risk_checks"][-1]["outcome"] == "reject"


class _Broken:
    name = "broken"

    def __init__(self, fail: set[str]) -> None:
        self.fail = fail
        self.inner = context_for("run-demo-e3-ornek").provider

    async def complete(self, request: LLMRequest) -> LLMResult:
        if request.agent in self.fail:
            raise ProviderError("down", provider=self.name)
        return await self.inner.complete(request)


@pytest.mark.parametrize(
    ("fail", "outcome", "last_nodes"),
    [
        ({"guard"}, "HOLD", ["guard", "record"]),
        ({"classifier"}, "HOLD", ["classifier", "record"]),
        ({"reader"}, "HOLD", ["rule_engine", "record"]),
        ({"compliance"}, "HOLD", ["compliance", "record"]),
        ({"skeptic"}, "PROPOSE", ["request_approval"]),
    ],
)
async def test_a_failed_agent_holds_instead_of_crashing(fail: set[str], outcome: str, last_nodes: list[str]) -> None:
    ctx = replace(context_for("run-demo-e3-ornek"), provider=_Broken(fail))
    state, explain = await _explain(ctx, f"broken-{'-'.join(sorted(fail))}")
    assert state["outcome"] == outcome
    nodes = [n["node"] for n in explain["trace"]["nodes"] if n["status"] != "waiting"]
    assert nodes[-len(last_nodes) :] == last_nodes
    failed = [n for n in explain["trace"]["nodes"] if n["status"] == "failed"]
    assert [n["node"] for n in failed] == sorted(fail)


async def test_unknown_disclosure_holds_on_missing_recordings() -> None:
    ctx = context_for("run-demo-e3-ornek")
    other = replace(ctx, disclosure=replace(ctx.disclosure, text_tr=ctx.disclosure.text_tr + " "))
    state = await run_graph(other, "e3-unknown")
    assert state["outcome"] == "HOLD"


async def test_animation_plan() -> None:
    _, explain = await _explain(context_for("run-demo-e3-ornek"), "e3-plan")
    events = plan(explain)
    nodes = [e for e in events if e.event == "node"]
    assert len(nodes) == 2 * len(explain["trace"]["nodes"])
    assert all(e.at_ms <= DONE_AFTER_MS for e in events)
    tail = [(e.stream, e.event) for e in events if e.at_ms == DONE_AFTER_MS]
    assert ("desk", "approval.requested") in tail
    assert ("feed", "classification") in tail
    assert ("feed", "counters") in tail
    crew = {e.data["agent"] for e in events if e.event == "crew" and e.data}
    assert {"classifier", "reader", "rule_engine", "risk_gate"} <= crew
    _, veto = await _explain(context_for("run-demo-r04-tmslj"), "r04-plan")
    assert not any(e.event == "approval.requested" for e in plan(veto))


def test_virtual_clock_of_an_empty_run() -> None:
    start = datetime(2027, 1, 11, tzinfo=UTC)
    assert elapsed_until_now([], start) == start
