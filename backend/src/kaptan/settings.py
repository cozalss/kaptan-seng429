"""Runtime configuration (pydantic-settings). Reads env vars and backend/.env.

Secrets are `SecretStr` and never logged. Outside `KAPTAN_ENV=dev` a missing JWT secret or
passphrase hash fails at startup; in dev they fall back to clearly-marked dev defaults
(the demo passphrase `kaptan2026` printed on the panel's /login, and a per-process random key).
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Final, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator
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
    #: M3 B3 (FR-21): a local Ollama (OpenAI-compatible, e.g. http://127.0.0.1:11434/v1) as the last link
    #: of every live chain, after Groq. Empty = off (the default). Model in config/models.yaml `ollama`.
    ollama_base_url: str | None = None
    #: Azure OpenAI (Azure for Students, FR-21): after Groq, before Ollama. All three set = on; any empty = off.
    azure_openai_endpoint: str | None = None  # https://<resource>.openai.azure.com
    azure_openai_api_key: SecretStr | None = None
    azure_openai_deployment: str | None = None
    azure_openai_api_version: str = "2024-10-21"
    llm_cap_azure_rpd: int = Field(default=300, ge=0)  # the $100 student credit: keep it small
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
    #: Reference data jobs (M3, kaptan.reference / kaptan.fundamentals / kaptan.dq). The intraday quote
    #: delay (Yahoo/BIST free data is ~15 min late): a bar counts as known only this long after it ends.
    quote_delay_s: int = Field(default=15 * 60, ge=0)
    #: tedbir_sync: also parse the SPK bulletin PDF at this URL (off when empty; KAP notices always run).
    tedbir_bulletin_url: str | None = None
    #: Nightly audit anchor (scheduler 23:30, kaptan.audit.anchor): also append each anchor as a JSON line
    #: to this local file (off when empty; audit.anchors is always written outside DEMO_MODE).
    audit_anchor_file: str | None = None
    #: Nightly retention (scheduler 03:30, kaptan.dq.retention): ops.job_runs rows older than this many days go.
    job_runs_keep_days: int = Field(default=90, ge=7)

    #: RAG (M2, kaptan.rag): embedder of the disclosure archive (model + size in config/rag.yaml).
    rag_embedder: Literal["gemini", "fake"] = "gemini"
    #: "Benzer geçmiş bildirimler" in the analysts' TASK_CONTEXT: LLM_MODE=live only; 0 = off.
    rag_context_k: int = Field(default=5, ge=0, le=10)
    #: Regulation paragraphs (SPK II-15.1 / II-22.1, kaptan.rag.bases) in the compliance agent's context; live only.
    rag_regulation_k: int = Field(default=3, ge=0, le=10)
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

    #: KAPTAN_MODE (04 §env): paper | personal | live | backtest. `personal` turns on the one-person
    #: kill-switch restart rule (06 §11: ≥ 24 h between the two signatures and ≥ 5 sessions since the kill).
    kaptan_mode: Literal["paper", "personal", "live", "backtest"] = "paper"
    #: Starting capital of the paper desk (kaptan.risk.book): equity = capital + fills' cash flows + marks.
    paper_capital_try: float = Field(default=1_000_000.0, gt=0)
    #: M3 A3 (kaptan.brokers): the personal account the order tickets size for (12 §4; the demo's 350.000 TL).
    personal_account_try: float = Field(default=350_000.0, gt=0)
    #: K2 of the three live keys (09 §8): true only on the production host. Without a real broker
    #: adapter every order still goes to SimBIST (paper) and the fallback is audited.
    kaptan_live_enabled: bool = False

    cookie_secure: bool = True
    allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    login_rate_per_minute: int = Field(default=5, gt=0)
    db_pool_min: int = Field(default=1, ge=1)
    db_pool_max: int = Field(default=10, ge=1)

    # ── ops (M3 A5: deploy-ready backend; kaptan.ops) ─────────────────────────
    #: Mutating endpoints (POST/PUT/PATCH/DELETE) per user (or client IP) per minute (09 §6, NFR-09).
    #: Never below LOGIN_RATE_PER_MINUTE, so the e2e override (600) raises both.
    mutation_rate_per_minute: int = Field(default=60, gt=0)
    #: auto = Redis in prod (shared by every API process), in-process otherwise; memory | redis force one.
    rate_limit_backend: Literal["auto", "memory", "redis"] = "auto"
    #: Reverse proxies whose X-Forwarded-For is believed (IPs or CIDRs, comma separated). Empty = none.
    trusted_proxies: Annotated[list[str], NoDecode] = Field(default_factory=list)
    #: A refresh token rotated at most this many seconds ago may be presented again (two tabs refreshing
    #: at once) without revoking its family. 0 = off (M1 behaviour); docker-compose.prod.yml uses 10.
    refresh_grace_s: int = Field(default=0, ge=0, le=60)
    #: GET /metrics: Bearer token. Unset = loopback clients only.
    metrics_token: SecretStr | None = None
    #: auto = text in dev/test, JSON in prod.
    log_format: Literal["auto", "text", "json"] = "auto"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    hsts_max_age_s: int = Field(default=365 * 24 * 3600, ge=0)

    @field_validator("allowed_origins", "trusted_proxies", mode="before")
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
        "metrics_token",
        "azure_openai_api_key",
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
    try:
        return Settings()  # values come from the environment
    except ValidationError as exc:
        # pydantic's message repeats the raw input (secrets included); keep only the reasons.
        reasons = "; ".join(f"{'.'.join(map(str, e['loc'])) or 'settings'}: {e['msg']}" for e in exc.errors())
        raise ConfigError(f"invalid configuration: {reasons}") from None


# ── production readiness (NFR-08) ─────────────────────────────────────────────

#: Text that marks a JWT_SECRET as a placeholder or a test value.
WEAK_SECRET_MARKERS: Final = ("change", "example", "placeholder", "<", "test-only", "dev-", "secret", "password")
MIN_SECRET_DISTINCT_CHARS: Final = 12
Component = Literal["api", "ingest_worker", "agent_worker", "scheduler", "migrate", "bootstrap", "ops"]


class ConfigError(RuntimeError):
    """The configuration cannot start this process. The message never contains a secret value."""


def weak_jwt_secret(secret: SecretStr | None) -> str | None:
    """Why the signing key is weak (None = fine). Reasons only, never the value."""
    if secret is None:
        return "JWT_SECRET is not set"
    value = secret.get_secret_value()
    if len(value.encode()) < MIN_JWT_SECRET_BYTES:
        return f"JWT_SECRET is shorter than {MIN_JWT_SECRET_BYTES} bytes"
    if len(set(value)) < MIN_SECRET_DISTINCT_CHARS:
        return "JWT_SECRET has too few distinct characters (not random)"
    lowered = value.lower()
    if any(marker in lowered for marker in WEAK_SECRET_MARKERS):
        return "JWT_SECRET looks like a placeholder or a test value"
    return None


def redis_has_password(url: SecretStr) -> bool:
    try:
        return bool(urlsplit(url.get_secret_value()).password)
    except ValueError:
        return False


def production_problems(settings: Settings, component: Component = "api") -> list[str]:
    """Every reason this configuration must not run in KAPTAN_ENV=prod (empty = ready)."""
    problems: list[str] = []
    if settings.demo_mode:
        problems.append("DEMO_MODE=true (the demo endpoints, clock and reset must be off in prod)")
    if not settings.cookie_secure:
        problems.append("COOKIE_SECURE=false (the refresh cookie must be Secure in prod)")
    if not settings.allowed_origins:
        problems.append("ALLOWED_ORIGINS is empty (list the panel's origin)")
    if not redis_has_password(settings.redis_url):
        problems.append("REDIS_URL has no password (use redis://:<password>@host:6379/0)")
    has_key = (
        bool(settings.ollama_base_url)
        or bool(settings.azure_openai_api_key)
        or any(k is not None for k in (settings.gemini_api_key, settings.deepseek_api_key, settings.groq_api_key))
    )
    if settings.llm_mode == "live" and not has_key:
        problems.append("LLM_MODE=live but no GEMINI_API_KEY / DEEPSEEK_API_KEY / GROQ_API_KEY is set")
    weak = weak_jwt_secret(settings.jwt_secret)
    if weak is not None:
        problems.append(weak)
    if settings.passphrase_hash is None or not settings.passphrase_hash.get_secret_value().startswith("$argon2"):
        problems.append("PASSPHRASE_HASH is not an argon2 hash (scripts/hash_passphrase.py)")
    if component == "migrate" and settings.database_owner_url is None:
        problems.append("DATABASE_OWNER_URL is not set (the migrate job runs as the owner role)")
    return problems


def ensure_production_ready(settings: Settings, component: Component = "api") -> None:
    """Refuse to start in prod with an unsafe configuration; outside prod only the migrate job checks
    for its owner URL."""
    if settings.kaptan_env != "prod":
        if component == "migrate" and settings.database_owner_url is None:
            raise ConfigError("DATABASE_OWNER_URL is not set (the migrate job runs as the owner role)")
        return
    problems = production_problems(settings, component)
    if problems:
        listed = "\n".join(f"  - {p}" for p in problems)
        raise ConfigError(f"KAPTAN_ENV=prod: {component} refuses to start:\n{listed}")
