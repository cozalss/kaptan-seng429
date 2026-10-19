"""Prompt manifest and `graph_version` (NFR-07, FR-45, 05 §9).

The manifest hashes every file of `prompts/v<version>/` plus `config/models.yaml` (pinned model IDs and
chains): change a prompt or a model and the digest changes. Live runs and their proposals carry
`<digest16>@<git sha>` in the existing `prompt_manifest_hash` field (env `GIT_SHA`, else "dev"). Replay
keeps the demo `meta.json` value so every recorded output and audit hash stays byte-identical.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

from kaptan.llm.prompts import PROMPT_DIR
from kaptan.llm.registry import MODELS_FILE
from kaptan.llm.replay import PROMPT_VERSION

DIGEST_CHARS: Final = 16


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True, slots=True)
class PromptManifest:
    prompt_version: str
    files: tuple[tuple[str, str], ...]  # (relative path, sha256), sorted
    models_yaml_sha256: str

    @property
    def digest(self) -> str:
        lines = [f"{name} {sha}" for name, sha in self.files] + [f"config/models.yaml {self.models_yaml_sha256}"]
        return _sha("\n".join([self.prompt_version, *lines]).encode("utf-8"))[:DIGEST_CHARS]

    def as_dict(self) -> dict[str, Any]:
        return {
            "prompt_version": self.prompt_version,
            "files": dict(self.files),
            "models_yaml_sha256": self.models_yaml_sha256,
            "digest": self.digest,
        }


def build_manifest(
    prompt_dir: Path = PROMPT_DIR, version: str = PROMPT_VERSION, models_file: Path = MODELS_FILE
) -> PromptManifest:
    folder = prompt_dir / f"v{version}"
    if not folder.is_dir():
        raise FileNotFoundError(f"no prompt folder {folder}")
    files = tuple(
        sorted((p.relative_to(prompt_dir).as_posix(), _sha(p.read_bytes())) for p in folder.rglob("*") if p.is_file())
    )
    return PromptManifest(version, files, _sha(models_file.read_bytes()))


def git_sha() -> str:
    raw = os.environ.get("GIT_SHA", "").strip()
    return raw[:12] if raw else "dev"


@lru_cache(maxsize=1)
def _digest() -> str:
    return build_manifest().digest


def graph_version() -> str:
    """`<manifest digest>@<git sha>`: what a live run and its proposal are stamped with."""
    return f"{_digest()}@{git_sha()}"


def manifest_hash_for(provider: Any, replay_value: str) -> str:
    """The live LLM chain gets the real graph version; replay (and any fake) keeps the demo value."""
    return graph_version() if getattr(provider, "name", "") == "live" else replay_value
