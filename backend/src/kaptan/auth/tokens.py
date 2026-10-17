"""Access tokens (JWT, HS256, 15 min) and opaque refresh tokens (09 §6).

Access token claims: sub (uid), name, role, fam (refresh family), jti, iat, exp, iss, aud.
The access token lives only in the browser's memory; the refresh token is an opaque 256-bit
value in the `__Host-kaptan_rt` cookie, stored server-side only as its sha256.
JWT times use the wall clock, never the demo clock.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final

import jwt

from kaptan.domain.roles import Role, is_role
from kaptan.settings import Settings

ALGORITHM: Final = "HS256"


@dataclass(frozen=True, slots=True)
class AccessClaims:
    uid: str
    name: str
    role: Role
    family: str
    jti: str
    expires_at: datetime


class InvalidTokenError(Exception):
    """The token is missing, malformed, expired or signed with another key."""


def create_access_token(
    settings: Settings, *, uid: str, name: str, role: Role, family: str, now: datetime | None = None
) -> str:
    issued = now or datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": uid,
        "name": name,
        "role": role,
        "fam": family,
        "jti": uuid.uuid4().hex,
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(seconds=settings.access_token_ttl_s)).timestamp()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    return jwt.encode(claims, settings.jwt_key(), algorithm=ALGORITHM)


def decode_access_token(settings: Settings, token: str) -> AccessClaims:
    try:
        claims = jwt.decode(
            token,
            settings.jwt_key(),
            algorithms=[ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "role", "fam", "jti", "exp", "iat", "iss", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
    role = claims.get("role")
    if not is_role(role):
        raise InvalidTokenError("unknown role")
    return AccessClaims(
        uid=str(claims["sub"]),
        name=str(claims.get("name", claims["sub"])),
        role=role,
        family=str(claims["fam"]),
        jti=str(claims["jti"]),
        expires_at=datetime.fromtimestamp(int(claims["exp"]), UTC),
    )


def new_refresh_token() -> str:
    """Opaque, 256-bit, URL-safe."""
    return secrets.token_urlsafe(32)


def refresh_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_family_id() -> str:
    return uuid.uuid4().hex
