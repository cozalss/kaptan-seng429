"""Request dependencies: settings, clock, the caller (JWT), and the RBAC guard.

    @router.post("/approvals/{pid}/decision")
    async def decide(pid: str, actor: Annotated[Actor, Depends(require("proposal.decide"))], conn: Conn): ...

`require(action)` refuses with 403 `forbidden` and exactly the panel's deniedReason() text;
`ensure_second_signer()` refuses with 403 `same_person` (two-person rules, API.md §3.2).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import Depends, Request

from kaptan.api.errors import ApiError, unauthenticated
from kaptan.auth.tokens import InvalidTokenError, decode_access_token
from kaptan.clock import Clock
from kaptan.domain.permissions import SAME_PERSON_TEXT, Action, can, denied_reason
from kaptan.domain.roles import Role
from kaptan.settings import Settings, get_settings


@dataclass(frozen=True, slots=True)
class Actor:
    """The signed-in person and the role they act in."""

    uid: str
    name: str
    role: Role
    family: str

    @property
    def audit_actor(self) -> str:
        return f"user:{self.uid}"

    def signature(self, at: datetime, reason: str | None) -> dict[str, Any]:
        """A Signature (domain/schemas/user.py) for a decision."""
        return {"uid": self.uid, "name": self.name, "role": self.role, "at": at, "reason": reason}

    def me(self) -> dict[str, str]:
        return {"id": self.uid, "display_name": self.name, "role": self.role}


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
    """The caller from the Bearer access token, or 401 `unauthenticated`."""
    token = bearer_token(request)
    if token is None:
        raise unauthenticated()
    try:
        claims = decode_access_token(settings, token)
    except InvalidTokenError as exc:
        raise unauthenticated("Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.") from exc
    return Actor(uid=claims.uid, name=claims.name, role=claims.role, family=claims.family)


CurrentUser = Annotated[Actor, Depends(current_user)]


def require(action: Action) -> Callable[[Actor], Awaitable[Actor]]:
    """Dependency factory: the caller, or 403 `forbidden` with the plain reason ("Bunu Risk Sorumlusu yapar.")."""

    async def checker(actor: CurrentUser) -> Actor:
        if not can(actor.role, action):
            raise ApiError(403, "forbidden", denied_reason(action, actor.role))
        return actor

    checker.__name__ = f"require_{action.replace('.', '_')}"
    return checker


def ensure_second_signer(first_uid: str, actor: Actor, kind: Literal["kill_reset", "limits"]) -> None:
    """Two-person rule: the second signature must come from someone else (403 `same_person`)."""
    if first_uid == actor.uid:
        raise ApiError(403, "same_person", SAME_PERSON_TEXT[kind])


def require_demo_mode(settings: SettingsDep) -> None:
    """The /demo/* endpoints exist only when DEMO_MODE=true."""
    if not settings.demo_mode:
        raise ApiError(404, "not_found", "Demo modu kapalı.")
