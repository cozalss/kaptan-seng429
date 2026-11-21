"""Auth: one passphrase, one person (API.md §2).

    POST /auth/login    {"passphrase"}           -> 200 {"access_token", "user": Me} + Set-Cookie refresh
    POST /auth/refresh  X-KAPtan-CSRF: 1, cookie -> 200 {"access_token"}            (rotates the cookie)
    POST /auth/logout   cookie                   -> 204                              (revokes the family)
    GET  /me            Bearer                   -> 200 Me
    POST /auth/password Bearer {"current", "new"} -> 200 {"signed_out_others": n}
    POST /auth/logout-all Bearer                 -> 204                  (every device, this one too)

Password change: the current password is checked first (wrong: 403 `wrong_password`), the new one needs 6..200
characters, not the public demo word, not the same (422). It is stored as an argon2id hash in
`auth.credentials` and takes precedence over the installer's `PASSPHRASE_HASH` (kaptan.auth.credentials). Every
other session is signed out in the same transaction and `auth.password_changed` is audited (no secret in it).
At most `LOGIN_RATE_PER_MINUTE` tries a minute (429). `auth.signed_out_everywhere` is audited by logout-all.

Unknown fields in the login body (an old client's `role`) are ignored.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Request, Response
from pydantic import Field

from kaptan.api.deps import CurrentUser, SettingsDep
from kaptan.api.errors import ApiError, unauthenticated
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.auth import credentials, sessions
from kaptan.auth.ratelimit import Limiter
from kaptan.auth.tokens import create_access_token
from kaptan.db import Conn
from kaptan.domain.roles import OWNER
from kaptan.domain.schemas import KModel, Me, SessionOut, TokenOut
from kaptan.ops.http import app_limiter, request_ip
from kaptan.settings import Settings

router = APIRouter(tags=["auth"])

LOGIN_FAILED = "Parola doğrulanamadı."
CSRF_HEADER = "x-kaptan-csrf"


class LoginBody(KModel):
    passphrase: str = Field(max_length=200)


def _wall_now() -> datetime:
    return datetime.now(UTC)


def _limiter(request: Request, settings: Settings) -> Limiter:
    """LOGIN_RATE_PER_MINUTE per client IP: in-process in dev/test, Redis (all API processes) in prod."""
    if getattr(request.app.state, "settings", None) is None:
        request.app.state.settings = settings
    return app_limiter(request.app, "login", settings.login_rate_per_minute)


def _overall_limiter(request: Request, settings: Settings) -> Limiter:
    limit = max(settings.login_overall_rate_per_minute, settings.login_rate_per_minute)
    return app_limiter(request.app, "login_overall", limit)


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


def _access_token(settings: Settings, family: str) -> str:
    return create_access_token(settings, uid=OWNER.uid, name=OWNER.name, family=family)


@router.post("/auth/login", response_model=SessionOut)
async def login(
    request: Request, response: Response, body: Annotated[LoginBody, Body()], settings: SettingsDep, conn: Conn
) -> dict[str, Any]:
    peer = request.client.host if request.client else None
    client = request_ip(request.app, peer, request.headers.get("x-forwarded-for"))
    allowed = await _limiter(request, settings).hit(f"login:{client}")
    if not allowed or not await _overall_limiter(request, settings).hit("login_overall"):
        raise ApiError(429, "rate_limited", "Çok fazla deneme. Bir dakika sonra yeniden dene.")
    if not await credentials.verify_login(conn, settings, body.passphrase):
        await _audit_login_failed(request, conn, client)
        raise unauthenticated(LOGIN_FAILED)
    async with conn.transaction():
        session = await sessions.start_family(conn, now=_wall_now(), ttl_s=settings.refresh_token_ttl_s)
    _set_refresh_cookie(response, settings, session)
    return {
        "access_token": _access_token(settings, session.family),
        "user": {"id": OWNER.uid, "display_name": OWNER.name},
    }


async def _audit_login_failed(request: Request, conn: Conn, client: str | None) -> None:
    """09 §7.1: a failed login is an audit event; no secret and no raw IP (a short hash of the client)."""
    client_hash = hashlib.sha256((client or "?").encode()).hexdigest()[:16]
    async with conn.transaction():
        await append(
            conn,
            [
                AuditDraft(
                    actor="system:auth",
                    action="auth.login_failed",
                    entity_type="session",
                    entity_id="login",
                    payload={"client": client_hash},
                    occurred_at=request.app.state.clock.now(),
                )
            ],
        )


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
            session = await sessions.rotate(conn, token, _wall_now(), grace_s=settings.refresh_grace_s)
    except sessions.RefreshRejectedError as exc:
        # A reused token revoked its family inside rotate(); that revocation must persist.
        if exc.reason == "reused":
            async with conn.transaction():
                await sessions.revoke_by_token(conn, token, _wall_now())
        _clear_refresh_cookie(response, settings)
        raise unauthenticated() from exc
    _set_refresh_cookie(response, settings, session)
    return {"access_token": _access_token(settings, session.family)}


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


class PasswordBody(KModel):
    current: str = Field(max_length=200)
    new: str = Field(max_length=2000)


CURRENT_IS_WRONG = "Şimdiki parolan doğru değil."


@router.post("/auth/password")
async def change_password(
    request: Request, body: Annotated[PasswordBody, Body()], actor: CurrentUser, settings: SettingsDep, conn: Conn
) -> dict[str, int]:
    if not await app_limiter(request.app, "password_change", settings.login_rate_per_minute).hit(actor.uid):
        raise ApiError(429, "rate_limited", "Çok fazla deneme. Bir dakika sonra yeniden dene.")
    if not await credentials.verify_login(conn, settings, body.current):
        async with conn.transaction():
            await append(
                conn,
                [AuditDraft(user_actor(actor.uid), "auth.password_change_failed", "session", actor.family)],
            )
        raise ApiError(403, "wrong_password", CURRENT_IS_WRONG)
    problem = credentials.new_password_problem(body.current, body.new)
    if problem is not None:
        raise ApiError(422, "weak_password", problem)
    hashed = await credentials.hash_in_thread(body.new)
    now = _wall_now()
    async with conn.transaction():
        await credentials.store_hash(conn, hashed, now)
        closed = await sessions.revoke_others(conn, actor.family, now)
        await append(
            conn,
            [
                AuditDraft(
                    user_actor(actor.uid), "auth.password_changed", "session", actor.family, {"signed_out": closed}
                )
            ],
        )
    return {"signed_out_others": closed}


@router.post("/auth/logout-all", status_code=204)
async def logout_all(actor: CurrentUser, settings: SettingsDep, conn: Conn) -> Response:
    async with conn.transaction():
        closed = await sessions.revoke_all(conn, _wall_now())
        await append(
            conn,
            [
                AuditDraft(
                    user_actor(actor.uid), "auth.signed_out_everywhere", "session", actor.family, {"signed_out": closed}
                )
            ],
        )
    response = Response(status_code=204)
    _clear_refresh_cookie(response, settings)
    return response
