"""The pydantic mirrors produce exactly the zod shapes.

For every response fixture of the demo day (what the panel mock answers at 13:40), parse it with the
pydantic model and dump it back (`mode="json"`): the dump must still validate against the zod JSON
Schema and equal the original. That pins field names, nullability, enums and the timestamp format.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, TypeAdapter

from kaptan.domain import schemas as s
from tests.contract.harness import assert_matches, schema, schema_errors

EXPECTED = Path(__file__).resolve().parents[1] / "fixtures" / "demo" / "expected"
FIXTURES = EXPECTED.parent


def _load(name: str) -> Any:
    return json.loads((EXPECTED / name).read_text(encoding="utf-8"))


def _roundtrip(model: type[BaseModel], payload: Any) -> Any:
    return model.model_validate(payload).model_dump(mode="json")


def _numbers_equal(a: Any, b: Any) -> bool:
    """JSON equality where 620 == 620.0 (pydantic floats) but types otherwise match."""
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_numbers_equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_numbers_equal(x, y) for x, y in zip(a, b, strict=True))
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, int | float) and isinstance(b, int | float):
        return float(a) == float(b)
    return bool(a == b)


SINGLE = [
    ("counters.json", "DayCounters", s.DayCounters),
    ("risk_status.json", "RiskStatus", s.RiskStatus),
    ("limits_view.json", "LimitsView", s.LimitsView),
]
LISTS = [
    ("approvals_all.json", "ApprovalCard", s.ApprovalCard),
    ("tickets.json", "OrderTicket", s.OrderTicket),
    ("orders.json", "Order", s.Order),
    ("positions.json", "Position", s.Position),
    ("users.json", "TeamMember", s.TeamMemberOut),
]


@pytest.mark.parametrize(("fixture", "zod", "model"), SINGLE)
def test_single_payloads(fixture: str, zod: str, model: type[BaseModel]) -> None:
    original = _load(fixture)
    assert_matches(zod, original)
    dumped = _roundtrip(model, original)
    assert_matches(zod, dumped)
    assert _numbers_equal(dumped, original)


@pytest.mark.parametrize(("fixture", "zod", "model"), LISTS)
def test_list_payloads(fixture: str, zod: str, model: type[BaseModel]) -> None:
    original = _load(fixture)
    assert original, fixture
    assert_matches(zod, original, many=True)
    dumped = [_roundtrip(model, item) for item in original]
    assert_matches(zod, dumped, many=True)
    assert _numbers_equal(dumped, original)


def test_explain_documents_roundtrip() -> None:
    docs: dict[str, Any] = _load("explain.json")
    assert len(docs) == 20
    for run_id, doc in docs.items():
        assert_matches("Explain", doc)
        dumped = _roundtrip(s.Explain, doc)
        assert not schema_errors("Explain", dumped), run_id
        assert _numbers_equal(dumped, doc), run_id


def test_pnl_and_audit_fixtures() -> None:
    pnl = json.loads((FIXTURES / "pnl.json").read_text(encoding="utf-8"))
    assert_matches("PnlPoint", pnl, many=True)
    dumped = TypeAdapter(list[s.PnlPoint]).dump_python(TypeAdapter(list[s.PnlPoint]).validate_python(pnl), mode="json")
    assert _numbers_equal(dumped, pnl)
    audit = json.loads((FIXTURES / "audit.json").read_text(encoding="utf-8"))
    sample = audit[:50] + audit[-50:]
    assert_matches("AuditEntry", sample, many=True)
    assert _numbers_equal([_roundtrip(s.AuditEntry, e) for e in sample], sample)


def test_inputs_parse_like_zod() -> None:
    d = s.ApprovalDecision.model_validate({"decision": "approve", "approved_notional_try": None, "comment": "  ok  "})
    assert d.comment == "ok"
    mark = TypeAdapter(s.TicketMarkInput).validate_python(
        {"mark": "entered", "filled_qty": 620, "avg_price": 48.32, "filled_at": "2027-01-11T10:50:00.000Z"}
    )
    assert isinstance(mark, s.TicketMarkEntered)
    assert TypeAdapter(s.TicketMarkInput).validate_python({"mark": "unfilled"}).mark == "unfilled"
    assert s.LimitDecisionInput.model_validate({"decision": "reject"}).comment == ""
    with pytest.raises(ValueError, match="Gerekçe en az 10 harf olmalı"):
        s.LimitProposalInput.model_validate({"key": "risk_per_trade_pct", "value": 0.004, "reason": "kısa"})
    with pytest.raises(ValueError, match="Not en az 3 harf olmalı"):
        s.NoteInput.model_validate({"body": " a "})
    with pytest.raises(ValueError, match=r"Gerekçe en az 5 harf olmalı."):
        s.KillSwitchInput.model_validate({"reason": "abc"})
    with pytest.raises(ValueError, match=r"Gerekçe en az 10 harf olmalı."):
        s.KillResetInput.model_validate({"reason": "kısa"})
    assert s.KillResetInput.model_validate({"reason": "  Olay incelendi, eşikler doğru.  "}).reason.startswith("Olay")


def test_every_api_response_schema_is_exported() -> None:
    for name in (
        "ApprovalCard",
        "AuditPage",
        "ChainVerifyResult",
        "DayCounters",
        "Explain",
        "LimitsView",
        "Me",
        "OrderTicket",
        "PnlPoint",
        "Position",
        "ProposalNote",
        "RiskStatus",
        "TeamMember",
    ):
        assert schema(name)["$schema"].endswith("2020-12/schema")
