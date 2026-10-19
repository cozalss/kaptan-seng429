"""Runtime configuration (pydantic-settings). Reads env vars and backend/.env.

Secrets are `SecretStr` and never logged. Outside `KAPTAN_ENV=dev` a missing JWT secret or
passphrase hash fails at startup; in dev they fall back to clearly-marked dev defaults
(the demo passphrase `kaptan2026` printed on the panel's /login, and a per-process random key).
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

#: The demo passphrase printed on the panel's /login (kaptan-panel/src/lib/auth/passphrase.ts).
DEMO_PASSPHRASE = "kaptan2026"  # noqa: S105 - public demo value, used only when KAPTAN_ENV=dev
MIN_JWT_SECRET_BYTES = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    kaptan_env: Literal["dev", "test", "prod"] = "dev"

    database_url: SecretStr = Field(description="App role (kaptan_app) connection string.")
    database_owner_url: SecretStr | None = Field(
        default=None, description="Owner connection: migrations, seed, demo reset/tamper."
    )
    test_database_url: SecretStr | None = Field(default=None, description="Integration tests (app role).")
    test_database_owner_url: SecretStr | None = Field(default=None, description="Integration tests (owner).")
    redis_url: SecretStr = SecretStr("redis://127.0.0.1:6379/0")

    jwt_secret: SecretStr | None = None
    jwt_issuer: str = "kaptan"
    jwt_audience: str = "kaptan-web"
    access_token_ttl_s: int = Field(default=15 * 60, gt=0)
    refresh_token_ttl_s: int = Field(default=8 * 60 * 60, gt=0)

    passphrase_hash: SecretStr | None = None

    demo_mode: bool = False
    #: DEMO_MODE: release the day's post-13:40 disclosures every 7–12 s (package C ticker).
    demo_live_ticker: bool = True
    llm_mode: Literal["replay", "live"] = "replay"
    #: Live providers (M2). Empty = that provider is skipped in the chain.
    gemini_api_key: SecretStr | None = None
    deepseek_api_key: SecretStr | None = None
    groq_api_key: SecretStr | None = None
    #: Live LLM hard caps per UTC day (kaptan.llm.budget); model IDs live in config/models.yaml.
    llm_cap_gemini_rpd: int = Field(default=400, ge=0)  # Flash-Lite free tier ~500 RPD (measured)
    llm_cap_groq_rpd: int = Field(default=900, ge=0)  # gpt-oss free ~1K RPD
    llm_cap_groq_tpd: int = Field(default=180_000, ge=0)  # gpt-oss free ~200K TPD
    llm_cap_guard_rpd: int = Field(default=14_000, ge=0)  # Prompt Guard 2 free 14.4K RPD
    llm_cap_deepseek_rpd: int = Field(default=200, ge=0)
    llm_cap_deepseek_usd: float = Field(default=0.50, ge=0)  # paid: the owner's balance
    llm_cache_ttl_s: int = Field(default=30 * 24 * 3600, gt=0)

    #: Live KAP ingestion (M2, kaptan.ingest). Off by default; DEMO_MODE stays the default.
    kap_live: bool = False
    kap_base_url: str = "https://www.kap.org.tr"
    #: A real browser User-Agent: MKK's WAF blocks non-browser clients (07 §1).
    kap_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
    )
    #: Poll interval in session (08:00–19:00 on weekdays); never below 30 s (canonical).
    kap_poll_session_s: float = Field(default=30.0, ge=30.0)
    kap_poll_offhours_s: float = Field(default=60.0, ge=30.0)
    kap_poll_night_s: float = Field(default=300.0, ge=60.0)
    #: Minimum gap between any two KAP requests of one process (backfill: ≥ 2 s per request).
    kap_min_interval_s: float = Field(default=2.0, ge=1.0)
    kap_timeout_s: float = Field(default=60.0, gt=0)
    kap_max_retries: int = Field(default=4, ge=0, le=8)
    #: Fetch full texts (BildirimPdf → text, /tr/Bildirim fallback) for target subjects.
    kap_fetch_details: bool = True

    #: Marks from core.prices_daily (kaptan.prices, M2) instead of the demo's replay marks. Off by default.
    prices_live: bool = False
    #: Minimum gap between two price-source requests (İş Yatırım / Yahoo), seconds.
    prices_min_interval_s: float = Field(default=2.0, ge=0.5)

    #: RAG (M2, kaptan.rag): embedder of the disclosure archive (model + size in config/rag.yaml).
    rag_embedder: Literal["gemini", "fake"] = "gemini"
    #: "Benzer geçmiş bildirimler" in the analysts' TASK_CONTEXT: LLM_MODE=live only; 0 = off.
    rag_context_k: int = Field(default=5, ge=0, le=10)
    #: `kaptan.rag.index.index_new_disclosures` (the ingest hook) does nothing unless this is on.
    rag_index_on_ingest: bool = False
    rag_embed_cap_rpd: int = Field(default=500, ge=0)  # batch calls per UTC day (gemini-embedding-001 free tier)
    rag_embed_cap_tpd: int = Field(default=1_500_000, ge=0)  # estimated input tokens per UTC day
    rag_embed_batch: int = Field(default=16, ge=1, le=100)
    rag_embed_min_interval_s: float = Field(default=1.0, ge=0)

    #: LangGraph checkpointer: memory (default, M1 behaviour) | postgres (AsyncPostgresSaver, migration 0010).
    checkpointer: Literal["memory", "postgres"] = "memory"
    #: KAP → agent worker (kaptan.workers.agent_worker): LLM-spending runs allowed per rolling hour.
    agent_max_runs_per_hour: int = Field(default=6, ge=0)

    cookie_secure: bool = True
    allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    login_rate_per_minute: int = Field(default=5, gt=0)
    db_pool_min: int = Field(default=1, ge=1)
    db_pool_max: int = Field(default=10, ge=1)

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator(
        "passphrase_hash",
        "jwt_secret",
        "database_owner_url",
        "test_database_url",
        "test_database_owner_url",
        mode="before",
    )
    @classmethod
    def _empty_is_none(cls, v: object) -> object:
        return None if isinstance(v, str) and not v.strip() else v

    @model_validator(mode="after")
    def _require_secrets_outside_dev(self) -> Settings:
        if self.kaptan_env == "dev":
            return self
        if self.jwt_secret is None:
            raise ValueError("JWT_SECRET is required outside KAPTAN_ENV=dev")
        if self.passphrase_hash is None:
            raise ValueError("PASSPHRASE_HASH is required outside KAPTAN_ENV=dev")
        if len(self.jwt_secret.get_secret_value().encode()) < MIN_JWT_SECRET_BYTES:
            raise ValueError("JWT_SECRET must be at least 32 bytes")
        return self

    @property
    def refresh_cookie_name(self) -> str:
        # The __Host- prefix is only valid with Secure, Path=/ and no Domain.
        return "__Host-kaptan_rt" if self.cookie_secure else "kaptan_rt"

    def jwt_key(self) -> str:
        if self.jwt_secret is not None:
            return self.jwt_secret.get_secret_value()
        return _dev_jwt_key()


@lru_cache(maxsize=1)
def _dev_jwt_key() -> str:
    # Dev only: a fresh key per process, so restarting the API signs everybody out.
    return secrets.token_urlsafe(48)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # values come from the environment
