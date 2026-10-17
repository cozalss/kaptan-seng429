"""The four roles and the team (mirror of kaptan-panel/src/lib/domain/role-meta.ts).

One login, four roles: the role is "whose eyes you look through" and each role belongs to one
person of the team, so "a different person signs" is real.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal, TypeGuard, get_args

Role = Literal["analyst", "risk_officer", "admin", "auditor"]
ROLES: Final[tuple[Role, ...]] = get_args(Role)

#: Where you start after login when the door asked for no role (API.md §2).
DEFAULT_ROLE: Final[Role] = "risk_officer"

ROLE_LABEL: Final[dict[Role, str]] = {
    "analyst": "Analist",
    "risk_officer": "Risk Sorumlusu",
    "admin": "Yönetici",
    "auditor": "Denetçi",
}


@dataclass(frozen=True, slots=True)
class TeamMember:
    uid: str
    name: str
    role: Role
    duty_tr: str


TEAM: Final[tuple[TeamMember, ...]] = (
    TeamMember("uye-1", "Üye 1", "admin", "Veri ve RAG · takım lideri"),
    TeamMember("uye-2", "Üye 2", "analyst", "Ajanlar"),
    TeamMember("uye-3", "Üye 3", "risk_officer", "Strateji, risk ve yürütme"),
    TeamMember("uye-4", "Üye 4", "analyst", "Arayüz ve değerlendirme"),
    TeamMember("denetci", "Denetçi", "auditor", "Jüri · salt okunur"),
)


def is_role(value: object) -> TypeGuard[Role]:
    return isinstance(value, str) and value in ROLES


def member_for_role(role: Role) -> TeamMember:
    """The team member who acts for a role (the first one listed)."""
    return next((m for m in TEAM if m.role == role), TEAM[0])


def member_by_uid(uid: str | None) -> TeamMember | None:
    if not uid:
        return None
    key = uid.removeprefix("user:")
    return next((m for m in TEAM if m.uid == key), None)
