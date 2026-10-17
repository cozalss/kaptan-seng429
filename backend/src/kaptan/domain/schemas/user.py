"""Mirror of kaptan-panel/src/lib/domain/user.ts (Me, Signature, TeamMember, login bodies)."""

from __future__ import annotations

from pydantic import Field

from kaptan.domain.roles import Role
from kaptan.domain.schemas._base import IsoDateTime, KModel


class TeamMemberOut(KModel):
    uid: str
    name: str
    role: Role
    duty_tr: str


class Me(KModel):
    id: str
    display_name: str
    role: Role


class Signature(KModel):
    """A signature on a decision: who (person and role) and when."""

    uid: str
    name: str
    role: Role
    at: IsoDateTime
    reason: str | None


class LoginInput(KModel):
    passphrase: str = Field(min_length=1, max_length=200)


class RoleInput(KModel):
    role: Role


class TokenOut(KModel):
    access_token: str


class SessionOut(KModel):
    access_token: str
    user: Me
