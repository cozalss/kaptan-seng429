"""Request dependencies: settings, clock and the caller (JWT).

    @router.post("/approvals/{pid}/decision")
    async def decide(pid: str, actor: CurrentUser, conn: Conn): ...

Signed in = allowed: one person runs KAPtan, so no endpoint asks who the caller is beyond the token.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any

from fastapi import Depends, Request

from kaptan.api.errors import unauthenticated
from kaptan.auth.tokens import InvalidTokenError, decode_access_token
from kaptan.clock import Clock
from kaptan.domain.roles import OWNER, Role
from kaptan.settings import Settings, get_settings

SESSION_EXPIRED = "Oturumunun süresi doldu. Yeniden giriş yap."


@dataclass(frozen=True, slots=True)
class Actor:
    """The signed-in person."""

    uid: str
    name: str
    family: str

    @property
    def role(self) -> Role:
        """The fixed value of the stored `role` fields (domain/roles.py)."""
        return OWNER.role

    @property
    def audit_actor(self) -> str:
        return f"user:{self.uid}"

    def signature(self, at: datetime, reason: str | None) -> dict[str, Any]:
        """A Signature (domain/schemas/user.py) for a decision."""
        return {"uid": self.uid, "name": self.name, "role": self.role, "at": at, "reason": reason}

    def me(self) -> dict[str, str]:
        return {"id": self.uid, "display_name": self.name}


def settings_dep() -> Settings:
    return get_settings()


def clock_dep(request: Request) -> Clock:
    clock: Clock = request.app.state.clock
    return clock


SettingsDep = Annotated[Settings, Depends(settings_dep)]
ClockDep = Annotated[Clock, Depends(clock_dep)]


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


async def current_user(request: Request, settings: SettingsDep) -> Actor:
    """The caller from the Bearer access token, or 401 `unauthenticated` (a token from the team days too)."""
    token = bearer_token(request)
    if token is None:
        raise unauthenticated()
    try:
        claims = decode_access_token(settings, token)
    except InvalidTokenError as exc:
        raise unauthenticated(SESSION_EXPIRED) from exc
    if claims.uid != OWNER.uid:
        raise unauthenticated(SESSION_EXPIRED)
    return Actor(uid=claims.uid, name=claims.name, family=claims.family)


CurrentUser = Annotated[Actor, Depends(current_user)]
