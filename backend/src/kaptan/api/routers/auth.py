"""Auth: one passphrase, four roles (API.md §2).

    POST /auth/login    {"passphrase", "role"?} -> 200 {"access_token", "user": Me} + Set-Cookie refresh
    POST /auth/role     {"role"}                 -> 200 {"access_token", "user": Me}   (Bearer)
    POST /auth/refresh  X-KAPtan-CSRF: 1, cookie -> 200 {"access_token"}            (rotates the cookie)
    POST /auth/logout   cookie                   -> 204                              (revokes the family)
    GET  /me            Bearer                   -> 200 Me

The role is a *request*: the backend grants it (every role belongs to a team member) and the
panel uses `user.role` from the answer. An unknown role value is 400; no role = risk_officer.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Request, Response
from pydantic import Field

from kaptan.api.deps import CurrentUser, SettingsDep
from kaptan.api.errors import ApiError, unauthenticated
from kaptan.auth import sessions
from kaptan.auth.passphrase import verify_passphrase
from kaptan.auth.ratelimit import SlidingWindowLimiter
from kaptan.auth.tokens import create_access_token
from kaptan.db import Conn
from kaptan.domain.roles import DEFAULT_ROLE, Role, is_role, member_for_role
from kaptan.domain.schemas import KModel, Me, SessionOut, TokenOut
from kaptan.settings import Settings

router = APIRouter(tags=["auth"])

BAD_ROLE = "Bilinmeyen rol."
LOGIN_FAILED = "Parola doğrulanamadı."
CSRF_HEADER = "x-kaptan-csrf"


class LoginBody(KModel):
    passphrase: str = Field(max_length=200)
    role: str | None = None


class RoleBody(KModel):
    role: str


def _wall_now() -> datetime:
    return datetime.now(UTC)


def _role_or_400(value: str | None, default: Role | None = None) -> Role:
    if value is None and default is not None:
        return default
    if not is_role(value):
        raise ApiError(400, "validation", BAD_ROLE)
    return value


def _limiter(request: Request, settings: Settings) -> SlidingWindowLimiter:
    limiter: SlidingWindowLimiter | None = getattr(request.app.state, "login_limiter", None)
    if limiter is None:
        limiter = SlidingWindowLimiter(limit=settings.login_rate_per_minute)
        request.app.state.login_limiter = limiter
    return limiter


def _set_refresh_cookie(response: Response, settings: Settings, session: sessions.RefreshSession) -> None:
    max_age = max(0, int((session.expires_at - _wall_now()).total_seconds()))
    response.set_cookie(
        settings.refresh_cookie_name,
        session.token,
        max_age=max_age,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.refresh_cookie_name, path="/", secure=settings.cookie_secure, httponly=True, samesite="strict"
    )


def _session_out(settings: Settings, *, role: Role, family: str) -> dict[str, Any]:
    member = member_for_role(role)
    token = create_access_token(settings, uid=member.uid, name=member.name, role=role, family=family)
    return {"access_token": token, "user": {"id": member.uid, "display_name": member.name, "role": role}}


@router.post("/auth/login", response_model=SessionOut)
async def login(
    request: Request, response: Response, body: Annotated[LoginBody, Body()], settings: SettingsDep, conn: Conn
) -> dict[str, Any]:
    client = request.client.host if request.client else "unknown"
    if not _limiter(request, settings).allow(f"login:{client}"):
        raise ApiError(429, "rate_limited", "Çok fazla deneme. Bir dakika sonra yeniden deneyin.")
    role = _role_or_400(body.role, DEFAULT_ROLE)
    if not verify_passphrase(settings, body.passphrase):
        raise unauthenticated(LOGIN_FAILED)
    member = member_for_role(role)
    async with conn.transaction():
        session = await sessions.start_family(
            conn, uid=member.uid, role=role, now=_wall_now(), ttl_s=settings.refresh_token_ttl_s
        )
    _set_refresh_cookie(response, settings, session)
    return _session_out(settings, role=role, family=session.family)


@router.post("/auth/role", response_model=SessionOut)
async def set_role(body: Annotated[RoleBody, Body()], actor: CurrentUser, settings: SettingsDep, conn: Conn) -> Any:
    role = _role_or_400(body.role)
    member = member_for_role(role)
    async with conn.transaction():
        await sessions.set_family_role(conn, family=actor.family, uid=member.uid, role=role)
    return _session_out(settings, role=role, family=actor.family)


def _check_csrf(request: Request, settings: Settings) -> None:
    if request.headers.get(CSRF_HEADER) != "1":
        raise ApiError(403, "csrf", "İstek doğrulanamadı.")
    origin = request.headers.get("origin")
    if origin and settings.allowed_origins and origin not in settings.allowed_origins:
        raise ApiError(403, "csrf", "İstek doğrulanamadı.")


@router.post("/auth/refresh", response_model=TokenOut)
async def refresh(request: Request, response: Response, settings: SettingsDep, conn: Conn) -> dict[str, str]:
    _check_csrf(request, settings)
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token:
        raise unauthenticated()
    try:
        async with conn.transaction():
            session = await sessions.rotate(conn, token, _wall_now())
    except sessions.RefreshRejectedError as exc:
        # A reused token revoked its family inside rotate(); that revocation must persist.
        if exc.reason == "reused":
            async with conn.transaction():
                await sessions.revoke_by_token(conn, token, _wall_now())
        _clear_refresh_cookie(response, settings)
        raise unauthenticated() from exc
    _set_refresh_cookie(response, settings, session)
    member = member_for_role(session.role)
    access = create_access_token(settings, uid=member.uid, name=member.name, role=session.role, family=session.family)
    return {"access_token": access}


@router.post("/auth/logout", status_code=204)
async def logout(request: Request, settings: SettingsDep, conn: Conn) -> Response:
    token = request.cookies.get(settings.refresh_cookie_name)
    if token:
        async with conn.transaction():
            await sessions.revoke_by_token(conn, token, _wall_now())
    response = Response(status_code=204)
    _clear_refresh_cookie(response, settings)
    return response


@router.get("/me", response_model=Me)
async def me(user: CurrentUser) -> dict[str, str]:
    return user.me()
