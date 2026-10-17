"""Python ports vs the panel's own TypeScript, run in node (skipped when node/node_modules are missing).

- audit chain: appendToChain() in audit-chain.ts vs kaptan.audit.writer.chain_entries()
- RBAC texts:  deniedReason() in permissions.ts vs kaptan.domain.permissions.denied_reason()
- limits:      limitViolations() in governance.ts vs kaptan.domain.schemas.limit_violations()
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from kaptan.audit.canonical import ChainFields, hash_of
from kaptan.domain.permissions import ACTIONS, denied_reason
from kaptan.domain.roles import ROLES
from kaptan.domain.schemas import LimitValue, limit_violations
from tests.contract.harness import panel_oracle

pytestmark = [pytest.mark.node, pytest.mark.usefixtures("require_node")]

TRICKY_PAYLOADS: list[dict[str, Any]] = [
    {"ticker": "ORNEK", "company": "ÖRNEK ENERJİ A.Ş.", "qty": 620, "price": 48.32},
    {"decision": "approve", "role": "risk_officer", "note": False, "ratio": 0.004, "big": 1e21, "tiny": 1e-7},
    {"10": "a", "9": "b", "b": [1, 2.5, None, {"z": 1, "y": "ş"}], "a": {"nested": {"k": -0.0392}}},
    {"text": 'quote " backslash \\ newline \n tab \t ctrl \x01 emoji 🚢 dash — ✓'},
    {"reasons": ["R03 evren ✓", "R04 tedbir yok ✓"], "llm_calls": 0, "drawdown": -0.01132},
    {},
]


def _fields(i: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "occurred_at": datetime(2027, 1, 11, 10, 40 + i, tzinfo=UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "actor": "user:uye-3" if i % 2 else "agent:risk_gate",
        "action": "approval.decided",
        "entity_type": "trade_proposal",
        "entity_id": f"prop-{i}",
        "run_id": None if i % 3 == 0 else f"run-{i}",
        "strategy_version": "v1.1-fwd" if i % 2 else None,
        "payload": payload,
    }


def test_audit_chain_hashes_match_node() -> None:
    fields = [_fields(i, p) for i, p in enumerate(TRICKY_PAYLOADS)]
    node_chain = panel_oracle({"op": "chain", "fields": fields})
    prev = "00"
    for i, (f, node) in enumerate(zip(fields, node_chain, strict=True)):
        mine = hash_of(prev, ChainFields(chain_pos=i + 1, **f))
        assert node["prev_hash"] == prev
        assert node["hash"] == mine, f"entry {i}: payload {f['payload']!r}"
        prev = mine


def test_denied_reason_texts_match_node() -> None:
    node = panel_oracle({"op": "denied"})
    assert set(node) == set(ACTIONS)
    for action in ACTIONS:
        for role in ROLES:
            assert denied_reason(action, role) == node[action][role], (action, role)
        assert denied_reason(action) == node[action]["none"]


def test_limit_violations_match_node() -> None:
    base = [
        ("risk_per_trade_pct", 0.005),
        ("max_position_pct", 0.1),
        ("max_concurrent_positions", 10),
        ("target_concurrent_positions", 8),
        ("max_adv_share", 0.01),
        ("price_band_pct", 0.02),
        ("daily_loss_halt_pct", -0.01),
        ("kill_drawdown_pct", -0.05),
        ("min_edge_cost_ratio", 2),
        ("crisis_exposure_mult", 0.5),
        ("leak_ret5d_threshold", 0.08),
        ("max_sector_pct", 0.25),
        ("max_group_pct", 0.2),
    ]

    def with_(key: str, value: float) -> list[tuple[str, float]]:
        return [(k, value if k == key else v) for k, v in base]

    cases = [
        base,
        with_("risk_per_trade_pct", 0.004),
        with_("risk_per_trade_pct", 0.006),
        with_("daily_loss_halt_pct", -0.02),
        with_("daily_loss_halt_pct", 0.01),
        with_("max_concurrent_positions", 7.5),
        with_("target_concurrent_positions", 11),
        [kv for kv in base if kv[0] != "max_group_pct"],
    ]
    node = panel_oracle({"op": "limits", "cases": [[{"key": k, "value": v} for k, v in c] for c in cases]})
    for case, expected in zip(cases, node, strict=True):
        assert limit_violations([LimitValue(key=k, value=v) for k, v in case]) == expected  # type: ignore[arg-type]
