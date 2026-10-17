"""Versioned Turkish prompts for the live agents (05 §2.3, §9): `v<version>/common.md` + `<agent>.md`.

The graph names a prompt `agent@version` ("reader@1.1.0"); the Reader also gets its event-type rules
(`reader_E3.md`). `sha256` covers the template text (before the per-call nonce), so editing a prompt
changes the cache key and the audit trail. Untrusted text is fenced with a random nonce per call
(spotlighting, 09 §3 L4 / 05 §8 L3).
"""

from __future__ import annotations

import hashlib
import json
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

PROMPT_DIR: Final = Path(__file__).resolve().parent
EVENT_RULES_AGENTS: Final = frozenset({"reader"})


class PromptNotFoundError(LookupError):
    """No prompt file for this agent/version: the live call cannot be made (the node HOLDs)."""


@dataclass(frozen=True, slots=True)
class PromptSpec:
    agent: str
    version: str
    template: str
    sha256: str

    def system(self, nonce: str) -> str:
        return self.template.replace("{nonce}", nonce)


def split_version(prompt_version: str) -> tuple[str, str]:
    """ "reader@1.1.0" → ("reader", "1.1.0")."""
    agent, sep, version = prompt_version.partition("@")
    if not sep or not agent or not version:
        raise PromptNotFoundError(f"bad prompt version: {prompt_version!r}")
    return agent, version


def _read(folder: Path, name: str) -> str:
    path = folder / name
    if not path.is_file():
        raise PromptNotFoundError(f"missing prompt file {folder.name}/{name}")
    return path.read_text(encoding="utf-8").strip()


@lru_cache(maxsize=64)
def load_prompt(prompt_version: str, event_type: str | None = None) -> PromptSpec:
    agent, version = split_version(prompt_version)
    folder = PROMPT_DIR / f"v{version}"
    parts = [_read(folder, "common.md"), _read(folder, f"{agent}.md")]
    if agent in EVENT_RULES_AGENTS:
        if event_type is None:
            raise PromptNotFoundError(f"{agent} needs an event type")
        parts.append(_read(folder, f"{agent}_{event_type}.md"))
    template = "\n\n".join(parts).replace("{event_type}", event_type or "")
    return PromptSpec(agent, version, template, hashlib.sha256(template.encode("utf-8")).hexdigest())


def new_nonce() -> str:
    return secrets.token_hex(8)


def neutralise(text: str) -> str:
    """Delimiter look-alikes inside untrusted data cannot close the fence."""
    return text.replace("<<<", "‹‹‹").replace(">>>", "›››").replace("DATA_", "DATA-")


def render_user(context: Mapping[str, Any], document: str, nonce: str) -> str:
    """User message template (05 §2.3): trusted TASK_CONTEXT, then the fenced untrusted DATA."""
    ctx = json.dumps(context, ensure_ascii=False, sort_keys=True, default=str)
    return (
        "TASK_CONTEXT (güvenilir, KAPtan kodu üretti):\n"
        f"{ctx}\n\n"
        f"<<<DATA_{nonce}\n{neutralise(document)}\nDATA_{nonce}>>>\n\n"
        "JSON nesnesini şimdi döndür."
    )
