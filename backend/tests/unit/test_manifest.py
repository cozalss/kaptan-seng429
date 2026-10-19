"""Prompt manifest + graph_version (NFR-07, FR-45): live runs are stamped, replay keeps meta.json."""

from __future__ import annotations

from pathlib import Path

import pytest

from kaptan.demo.fixtures import DemoFixtures
from kaptan.eval import manifest as mf
from kaptan.eval.manifest import build_manifest, git_sha, graph_version, manifest_hash_for


class _Named:
    def __init__(self, name: str) -> None:
        self.name = name


def _tree(tmp: Path, prompt: str = "sen bir okuyucusun", models: str = "a: 1") -> tuple[Path, Path]:
    (tmp / "p" / "v1.1.0").mkdir(parents=True)
    (tmp / "p" / "v1.1.0" / "reader.md").write_text(prompt, encoding="utf-8")
    (tmp / "models.yaml").write_text(models, encoding="utf-8")
    return tmp / "p", tmp / "models.yaml"


def test_digest_changes_with_a_prompt_or_the_model_registry(tmp_path: Path) -> None:
    prompts, models = _tree(tmp_path / "a")
    base = build_manifest(prompts, "1.1.0", models).digest
    p2, m2 = _tree(tmp_path / "b", prompt="sen bir okuyucusun!")
    p3, m3 = _tree(tmp_path / "c", models="a: 2")
    assert len(base) == 16
    assert build_manifest(prompts, "1.1.0", models).digest == base  # deterministic
    assert build_manifest(p2, "1.1.0", m2).digest != base
    assert build_manifest(p3, "1.1.0", m3).digest != base
    doc = build_manifest(prompts, "1.1.0", models).as_dict()
    assert list(doc["files"]) == ["v1.1.0/reader.md"]


def test_missing_prompt_version_is_an_error(tmp_path: Path) -> None:
    prompts, models = _tree(tmp_path)
    with pytest.raises(FileNotFoundError):
        build_manifest(prompts, "9.9.9", models)


def test_the_committed_prompts_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    files = dict(build_manifest().files)
    assert "v1.1.0/reader.md" in files
    monkeypatch.setenv("GIT_SHA", "0123456789abcdef0123")
    assert git_sha() == "0123456789ab"
    assert graph_version() == f"{build_manifest().digest}@0123456789ab"
    monkeypatch.delenv("GIT_SHA")
    assert git_sha() == "dev"


def test_replay_keeps_the_demo_value_live_gets_the_graph_version(monkeypatch: pytest.MonkeyPatch) -> None:
    demo = str(DemoFixtures().meta["prompt_manifest_hash"])
    monkeypatch.delenv("GIT_SHA", raising=False)
    assert manifest_hash_for(_Named("replay"), demo) == demo
    assert manifest_hash_for(_Named("redteam"), demo) == demo
    assert manifest_hash_for(_Named("live"), demo) == f"{mf._digest()}@dev"
