"""KAPTAN_ENV=prod refuses an unsafe configuration (NFR-08), with messages that never carry a secret."""

from __future__ import annotations

import pytest
from pydantic import SecretStr

from kaptan import settings as settings_mod
from kaptan.settings import (
    ConfigError,
    Settings,
    ensure_production_ready,
    production_problems,
    redis_has_password,
    weak_jwt_secret,
)

STRONG = "Zq3vN8kR1pX7mW2cT9yB4hL6fJ0sD5gA-uE_oIa"  # 39 random-looking chars, no marker words
DB_PW = "dbpw-0123456789abcdef"
REDIS_PW = "redispw-0123456789abcdef"
HASH = "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo"


def prod(**over: object) -> Settings:
    values: dict[str, object] = {
        "kaptan_env": "prod",
        "database_url": SecretStr(f"postgresql://kaptan_app:{DB_PW}@db:5432/kaptan"),
        "redis_url": SecretStr(f"redis://:{REDIS_PW}@redis:6379/0"),
        "jwt_secret": SecretStr(STRONG),
        "passphrase_hash": SecretStr(HASH),
        "demo_mode": False,
        "cookie_secure": True,
        "allowed_origins": ["https://panel.example.org"],
        "llm_mode": "replay",
        "gemini_api_key": None,
        "deepseek_api_key": None,
        "groq_api_key": None,
    }
    values.update(over)
    return Settings.model_construct(**values)  # type: ignore[arg-type]


def test_a_safe_prod_configuration_starts() -> None:
    s = prod()
    assert production_problems(s) == []
    ensure_production_ready(s, "api")  # no raise


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({"demo_mode": True}, "DEMO_MODE=true"),
        ({"cookie_secure": False}, "COOKIE_SECURE=false"),
        ({"allowed_origins": []}, "ALLOWED_ORIGINS is empty"),
        ({"redis_url": SecretStr("redis://redis:6379/0")}, "REDIS_URL has no password"),
        ({"llm_mode": "live"}, "LLM_MODE=live but no"),
        ({"jwt_secret": SecretStr("x" * 40)}, "too few distinct characters"),
        ({"jwt_secret": SecretStr("short")}, "shorter than 32 bytes"),
        ({"jwt_secret": SecretStr("<random-48-bytes>-abcdefghijklmnopqrstuvwxyz")}, "placeholder"),
        ({"jwt_secret": None}, "JWT_SECRET is not set"),
        ({"passphrase_hash": SecretStr("plain")}, "PASSPHRASE_HASH is not an argon2 hash"),
    ],
)
def test_each_unsafe_setting_is_refused(change: dict[str, object], expected: str) -> None:
    s = prod(**change)
    problems = production_problems(s)
    assert any(expected in p for p in problems), problems
    with pytest.raises(ConfigError) as info:
        ensure_production_ready(s, "api")
    message = str(info.value)
    assert "api refuses to start" in message
    for secret in (DB_PW, REDIS_PW, STRONG, HASH):
        assert secret not in message


def test_live_llm_with_a_key_is_fine() -> None:
    assert production_problems(prod(llm_mode="live", groq_api_key=SecretStr("gsk_" + "a" * 30))) == []


def test_the_owner_url_is_required_only_by_the_migrate_job() -> None:
    s = prod(database_owner_url=None)
    assert production_problems(s, "api") == []
    assert any("DATABASE_OWNER_URL" in p for p in production_problems(s, "migrate"))
    dev = Settings.model_construct(kaptan_env="dev", database_owner_url=None)
    ensure_production_ready(dev, "api")
    with pytest.raises(ConfigError, match="DATABASE_OWNER_URL"):
        ensure_production_ready(dev, "migrate")


def test_all_problems_are_listed_at_once() -> None:
    s = prod(demo_mode=True, cookie_secure=False, allowed_origins=[])
    with pytest.raises(ConfigError) as info:
        ensure_production_ready(s, "agent_worker")
    assert str(info.value).count("\n  - ") == 3


def test_helpers() -> None:
    assert redis_has_password(SecretStr("redis://:pw@h:6379/0"))
    assert redis_has_password(SecretStr("rediss://user:pw@h:6379/0"))
    assert not redis_has_password(SecretStr("redis://h:6379/0"))
    assert not redis_has_password(SecretStr("redis://h:notaport/0"))
    assert weak_jwt_secret(SecretStr(STRONG)) is None


def test_get_settings_hides_raw_values_in_validation_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    secret_hash = "plain-hash-value-that-must-not-leak"
    monkeypatch.setenv("KAPTAN_ENV", "prod")
    monkeypatch.setenv("JWT_SECRET", "short-secret-xyz")
    monkeypatch.setenv("PASSPHRASE_HASH", secret_hash)
    monkeypatch.setenv("DATABASE_URL", f"postgresql://a:{DB_PW}@h/db")
    settings_mod.get_settings.cache_clear()
    try:
        with pytest.raises(ConfigError) as info:
            settings_mod.get_settings()
    finally:
        settings_mod.get_settings.cache_clear()
    message = str(info.value)
    assert "JWT_SECRET must be at least 32 bytes" in message
    assert secret_hash not in message
    assert DB_PW not in message
    assert "short-secret-xyz" not in message


def test_ops_settings_parse_lists_and_empty_tokens() -> None:
    s = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url=SecretStr("postgresql://a:b@h/db"),
        trusted_proxies="10.0.0.0/8, 127.0.0.1",  # type: ignore[arg-type]
        metrics_token="  ",  # type: ignore[arg-type]
    )
    assert s.trusted_proxies == ["10.0.0.0/8", "127.0.0.1"]
    assert s.metrics_token is None
    assert s.refresh_grace_s == 0
    assert s.mutation_rate_per_minute == 60
