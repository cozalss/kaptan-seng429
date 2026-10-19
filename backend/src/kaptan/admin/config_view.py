"""`/admin/config`: the effective, non-secret configuration (ConfigView + settings + the active limits).

Secrets never leave: every `SecretStr` and every setting whose name looks like a credential or a connection
string (key, secret, token, password, hash, url, dsn) is dropped, not masked.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any, Final

from pydantic import SecretStr

from kaptan.db import DictConn
from kaptan.demo.fixtures import DemoFixtures
from kaptan.llm.registry import ModelsConfig, default_models
from kaptan.risk.limits import limits_view
from kaptan.rules.params import RULES_SEED, rules_hash_of
from kaptan.settings import BACKEND_DIR, Settings
from kaptan.text.turkish import IST

CONFIG_DIR: Final = BACKEND_DIR / "config"
SECRET_NAME: Final = re.compile(r"(key|secret|token|password|passphrase|hash|url|dsn)", re.IGNORECASE)
#: 08 §4.1: the two forward arms, frozen at their start (Istanbul).
STRATEGY_VERSIONS: Final = (
    ("v1.0-fwd", datetime(2026, 11, 9, 9, 0, tzinfo=IST), "Sınıflandırıcı + kurallar; Kanıt, Şüpheci ve Uyum yok"),
    ("v1.1-fwd", datetime(2026, 11, 23, 9, 0, tzinfo=IST), "Tüm ajanlar"),
)
AGENT_ROLE_TR: Final = {
    "classifier": "Sınıflandırıcı",
    "reader": "Okuyucu",
    "materiality": "Önemlilik",
    "evidence": "Kanıt",
    "skeptic": "Şüpheci",
    "compliance": "Uyum",
}
PROVIDER_NOTE_TR: Final = {
    "gemini": "Ücretsiz katman, günlük istek sınırı",
    "deepseek": "Ücretli, günlük maliyet sınırı",
    "groq": "Ücretsiz katman, günlük token sınırı",
    "ollama": "Yerel model; OLLAMA_BASE_URL verilince açılır",
}
APPROVAL_DEADLINE_TR: Final = "Bir sonraki seansın 09:50'si"


def config_hash(directory: Any = CONFIG_DIR) -> str:
    """sha256 over the frozen config files (name + bytes, sorted), first 16 hex characters."""
    h = hashlib.sha256()
    for path in sorted(directory.glob("*.yaml")):
        h.update(path.name.encode())
        h.update(path.read_bytes())
    return h.hexdigest()[:16]


def public_settings(settings: Settings) -> dict[str, Any]:
    raw = settings.model_dump()
    as_json = settings.model_dump(mode="json")
    return {
        name: as_json[name]
        for name, value in raw.items()
        if not isinstance(value, SecretStr) and not SECRET_NAME.search(name)
    }


def _chain(models: ModelsConfig, settings: Settings) -> list[dict[str, str]]:
    names: list[str] = [*models.default_chain]
    if getattr(settings, "ollama_base_url", None) and "ollama" in models.providers:
        names.append("ollama")
    return [
        {"provider": n, "model_id": models.providers[n].model, "note_tr": PROVIDER_NOTE_TR.get(n, "")}  # type: ignore[index]
        for n in names
    ]


def config_view(settings: Settings, models: ModelsConfig | None = None) -> dict[str, Any]:
    models = models or default_models()
    mode = settings.kaptan_mode if settings.kaptan_mode in ("paper", "personal", "live") else "paper"
    agent_models = [
        {"role_tr": role_tr, "model_id": models.providers[models.chain_for(agent)[0]].model}
        for agent, role_tr in AGENT_ROLE_TR.items()
    ]
    return {
        "execution_mode": mode,
        "strategy_versions": [{"id": i, "frozen_at": at, "scope_tr": s} for i, at, s in STRATEGY_VERSIONS],
        "rules_version": RULES_SEED,
        "rules_hash": rules_hash_of(),
        "prompt_manifest_hash": str(DemoFixtures().meta["prompt_manifest_hash"]),
        "config_hash": config_hash(),
        "models": agent_models,
        "fallback_chain": _chain(models, settings),
        "kap_poll_seconds": int(settings.kap_poll_session_s),
        "approval_deadline_tr": APPROVAL_DEADLINE_TR,
        "demo_mode": settings.demo_mode,
    }


async def admin_config(conn: DictConn, settings: Settings) -> dict[str, Any]:
    limits = await limits_view(conn)
    active = limits["active"]
    return {
        "view": config_view(settings),
        "settings": public_settings(settings),
        "limits": {"version": active["version"], "values": active["values"]},
    }
