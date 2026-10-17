"""RBAC table and the plain Turkish refusal texts (same as the panel's permissions.ts)."""

from __future__ import annotations

import pytest

from kaptan.domain.permissions import ACTION_LABEL, ACTIONS, ROLE_ACTIONS, can, denied_reason, role_that_can, roles_for
from kaptan.domain.roles import DEFAULT_ROLE, ROLES, TEAM, is_role, member_by_uid, member_for_role


@pytest.mark.parametrize(
    ("action", "role", "text"),
    [
        ("proposal.decide", "analyst", "Bunu Risk Sorumlusu yapar."),
        ("proposal.decide", "admin", "Bunu Risk Sorumlusu yapar."),
        ("kill.stop", "analyst", "Bunu Risk Sorumlusu ya da Yönetici yapar."),
        ("proposal.note", "auditor", "Denetçi yalnızca bakar. Bunu Analist, Risk Sorumlusu ya da Yönetici yapar."),
        ("kill.reset_start", "risk_officer", "Bunu Yönetici yapar."),
        ("users.view", "analyst", "Bunu Yönetici yapar."),
        ("audit.verify", "analyst", "Bunu Risk Sorumlusu ya da Yönetici yapar."),
        ("demo.run", None, "Bunu Yönetici yapar."),
    ],
)
def test_denied_reason(action: str, role: str | None, text: str) -> None:
    assert denied_reason(action, role) == text  # type: ignore[arg-type]


def test_role_table_matches_api_md() -> None:
    assert ROLE_ACTIONS["analyst"] == {"proposal.note"}
    assert ROLE_ACTIONS["auditor"] == {"audit.verify", "users.view"}
    assert can("risk_officer", "proposal.decide")
    assert not can("admin", "proposal.decide")
    assert can("admin", "demo.run")
    assert not can(None, "proposal.note")
    assert roles_for("kill.stop") == ["risk_officer", "admin"]
    assert role_that_can("audit.verify") == "risk_officer"
    assert role_that_can("users.view") == "admin"
    assert set(ACTION_LABEL) == set(ACTIONS)


def test_every_action_has_a_non_auditor_role() -> None:
    for action in ACTIONS:
        assert role_that_can(action) is not None


def test_team_and_roles() -> None:
    assert DEFAULT_ROLE == "risk_officer"
    assert [m.uid for m in TEAM] == ["uye-1", "uye-2", "uye-3", "uye-4", "denetci"]
    assert member_for_role("risk_officer").uid == "uye-3"
    assert member_for_role("analyst").uid == "uye-2"
    assert member_for_role("admin").uid == "uye-1"
    assert member_for_role("auditor").uid == "denetci"
    assert member_by_uid("user:uye-4") is not None
    assert member_by_uid("uye-9") is None
    assert member_by_uid(None) is None
    assert all(is_role(r) for r in ROLES)
    assert not is_role("root")
    assert not is_role(None)
