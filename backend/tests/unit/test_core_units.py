"""Settings, clock, tokens, rate limiter, error texts, timestamp format, loop helpers."""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta

import pytest
from pydantic import SecretStr, ValidationError

from kaptan.api.errors import validation_detail
from kaptan.api.loop import run, selector_loop_factory
from kaptan.auth.passphrase import verify_passphrase
from kaptan.auth.ratelimit import SlidingWindowLimiter
from kaptan.auth.tokens import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    new_refresh_token,
    refresh_token_hash,
)
from kaptan.clock import DEMO_ANCHOR, Clock, istanbul_date
from kaptan.domain.schemas import iso_ms
from kaptan.domain.schemas._base import _parse_date, _parse_dt
from kaptan.settings import Settings

SECRET = "unit-test-secret-unit-test-secret-0123456789"


def _settings(**kw: object) -> Settings:
    base: dict[str, object] = {"database_url": "postgresql://x@localhost/x", "kaptan_env": "dev", "jwt_secret": SECRET}
    base.update(kw)
    return Settings(_env_file=None, **base)  # type: ignore[call-arg, arg-type]


def test_settings_require_secrets_outside_dev() -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET is required"):
        _settings(kaptan_env="prod", jwt_secret=None, passphrase_hash="$argon2id$x")
    with pytest.raises(ValidationError, match="PASSPHRASE_HASH is required"):
        _settings(kaptan_env="prod", jwt_secret=SECRET)
    with pytest.raises(ValidationError, match="at least 32 bytes"):
        _settings(kaptan_env="prod", jwt_secret="short", passphrase_hash="$argon2id$x")
    ok = _settings(kaptan_env="prod", passphrase_hash="$argon2id$x")
    assert ok.jwt_key() == SECRET


def test_settings_parsing_and_cookie_name() -> None:
    s = _settings(allowed_origins="http://a, http://b ,", passphrase_hash="  ", cookie_secure=True)
    assert s.allowed_origins == ["http://a", "http://b"]
    assert s.passphrase_hash is None
    assert s.refresh_cookie_name == "__Host-kaptan_rt"
    assert _settings(cookie_secure=False).refresh_cookie_name == "kaptan_rt"
    dev = _settings(jwt_secret=None)
    assert dev.jwt_key() == dev.jwt_key()  # stable per process
    assert len(dev.jwt_key()) >= 32


def test_demo_passphrase_in_dev_only_and_hash_in_prod() -> None:
    dev = _settings()
    assert verify_passphrase(dev, "kaptan2026")
    assert not verify_passphrase(dev, "kaptan2027")
    assert not verify_passphrase(dev, "x" * 201)
    from kaptan.auth.passphrase import hash_passphrase

    prod = _settings(kaptan_env="prod", passphrase_hash=hash_passphrase("başka-parola"))
    assert verify_passphrase(prod, "başka-parola")
    assert not verify_passphrase(prod, "kaptan2026")
    broken = _settings(kaptan_env="prod", passphrase_hash="not-a-hash")
    assert not verify_passphrase(broken, "kaptan2026")


def test_access_token_roundtrip_and_rejections() -> None:
    s = _settings()
    token = create_access_token(s, uid="uye-3", name="Üye 3", role="risk_officer", family="fam1")
    claims = decode_access_token(s, token)
    assert (claims.uid, claims.name, claims.role, claims.family) == ("uye-3", "Üye 3", "risk_officer", "fam1")
    assert claims.expires_at > datetime.now(UTC)
    with pytest.raises(InvalidTokenError):
        decode_access_token(_settings(jwt_secret="another-secret-another-secret-0123456789"), token)
    old = create_access_token(
        s, uid="u", name="n", role="admin", family="f", now=datetime.now(UTC) - timedelta(hours=1)
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(s, old)
    with pytest.raises(InvalidTokenError):
        decode_access_token(s, "not.a.jwt")
    import jwt

    forged = jwt.encode(
        {
            "sub": "u",
            "role": "root",
            "fam": "f",
            "jti": "j",
            "iat": 1,
            "exp": 9_999_999_999,
            "iss": "kaptan",
            "aud": "kaptan-web",
        },
        SECRET,
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError, match="unknown role"):
        decode_access_token(s, forged)


def test_refresh_token_material() -> None:
    a, b = new_refresh_token(), new_refresh_token()
    assert a != b and len(a) >= 43
    assert len(refresh_token_hash(a)) == 64


def test_rate_limiter_window() -> None:
    t = [0.0]
    lim = SlidingWindowLimiter(limit=2, window_s=60, clock=lambda: t[0])
    assert lim.allow("ip") and lim.allow("ip")
    assert not lim.allow("ip")
    assert lim.allow("other")
    t[0] = 60.0
    assert lim.allow("ip")
    lim.reset()
    assert lim.allow("ip")


def test_demo_clock() -> None:
    real = [datetime(2026, 10, 17, 12, 0, tzinfo=UTC)]
    clock = Clock(demo=True, started_at=real[0], real_now=lambda: real[0])
    assert clock.now() == DEMO_ANCHOR
    real[0] += timedelta(minutes=5)
    assert clock.now() == DEMO_ANCHOR + timedelta(minutes=5)
    clock.restart()
    assert clock.now() == DEMO_ANCHOR
    assert Clock(demo=True, real_now=lambda: real[0]).now() == DEMO_ANCHOR
    wall = Clock(demo=False, real_now=lambda: real[0])
    assert wall.now() == real[0]
    assert istanbul_date(datetime(2027, 1, 11, 21, 30, tzinfo=UTC)) == date(2027, 1, 12)


def test_iso_ms_and_parsers() -> None:
    assert iso_ms(datetime(2027, 1, 11, 10, 40, 0, 999999, tzinfo=UTC)) == "2027-01-11T10:40:00.999Z"
    with pytest.raises(ValueError, match="naive"):
        iso_ms(datetime(2027, 1, 11))
    assert _parse_dt("2027-01-11T13:40:00+03:00") == DEMO_ANCHOR
    with pytest.raises(ValueError, match="ISO-8601"):
        _parse_dt("2027-01-11")
    with pytest.raises(ValueError, match="Saat dilimi"):
        _parse_dt(datetime(2027, 1, 11))
    assert _parse_date("2027-01-11") == date(2027, 1, 11)
    assert _parse_date(date(2027, 1, 11)) == date(2027, 1, 11)
    with pytest.raises(ValueError, match="Tarih"):
        _parse_date(DEMO_ANCHOR)
    with pytest.raises(ValueError, match="Tarih"):
        _parse_date("11.01.2027")


def test_validation_detail_texts() -> None:
    assert validation_detail([]) == "Girdi geçersiz."
    assert validation_detail([{"type": "value_error", "msg": "Value error, Not en az 3 harf olmalı"}]) == (
        "Not en az 3 harf olmalı"
    )
    assert validation_detail([{"type": "missing", "loc": ("body", "reason"), "msg": "x"}]) == "Eksik alan: reason."
    assert validation_detail([{"type": "missing", "loc": ("body",), "msg": "x"}]) == "Eksik alan."
    assert validation_detail([{"type": "json_invalid", "loc": ("body", 1), "msg": "x"}]) == (
        "Gövde geçerli bir JSON değil."
    )
    assert validation_detail([{"type": "int_parsing", "loc": ("query", "limit"), "msg": "x"}]) == (
        "Geçersiz değer: limit."
    )
    assert validation_detail([{"type": "int_parsing", "loc": ("body",), "msg": "x"}]) == "Girdi geçersiz."


def test_selector_loop_helpers() -> None:
    factory = selector_loop_factory()
    loop = factory()
    try:
        assert isinstance(loop, asyncio.SelectorEventLoop)
    finally:
        loop.close()

    async def answer() -> int:
        return 42

    assert run(answer()) == 42


def test_secret_values_are_hidden() -> None:
    s = _settings()
    assert SECRET not in repr(s)
    assert isinstance(s.database_url, SecretStr)
