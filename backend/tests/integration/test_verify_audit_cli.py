"""09 §7.2 auditor CLI: chain + every anchor line, exit codes 0 / 1 / 2."""

from __future__ import annotations

import json
from pathlib import Path

import psycopg
import pytest

from kaptan.audit.verify_cli import AnchorFileError, anchor_mismatches, main, read_anchor_lines
from kaptan.settings import Settings

pytestmark = pytest.mark.integration


def _anchors(tmp: Path, lines: list[dict[str, object]]) -> Path:
    path = tmp / "anchors.jsonl"
    path.write_text("\n".join(json.dumps(x) for x in lines) + "\n\n", encoding="utf-8")
    return path


def test_cli_exit_codes(migrated: Settings, seeded: object, tmp_path: Path) -> None:
    url = migrated.database_url.get_secret_value()
    with psycopg.connect(url) as conn:
        found = conn.execute("SELECT hash FROM audit.audit_log WHERE chain_pos = 10").fetchone()
    assert found is not None
    head = {"hash": found[0]}
    good = _anchors(tmp_path, [{"anchored_at": "x", "chain_pos": 10, "hash": head["hash"]}])
    assert main(["--url", url]) == 0
    assert main(["--url", url, "--anchor-file", str(good)]) == 0
    bad = _anchors(tmp_path, [{"anchored_at": "x", "chain_pos": 10, "hash": "0" * 64}])
    assert main(["--url", url, "--anchor-file", str(bad)]) == 1
    assert main(["--url", url, "--anchor-file", str(tmp_path / "none.jsonl")]) == 2
    (tmp_path / "broken.jsonl").write_text("{nope\n", encoding="utf-8")
    assert main(["--url", url, "--anchor-file", str(tmp_path / "broken.jsonl")]) == 2


def test_cli_without_a_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AUDITOR_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert main([]) == 2


def test_anchor_lines(tmp_path: Path) -> None:
    path = _anchors(tmp_path, [{"chain_pos": 1, "hash": "a"}, {"chain_pos": 9, "hash": "b"}])
    lines = read_anchor_lines(path)
    assert [x["line"] for x in lines] == [1, 2]

    class E:
        def __init__(self, pos: int, h: str) -> None:
            self.chain_pos, self.hash = pos, h

    bad = anchor_mismatches([E(1, "a")], lines)  # type: ignore[list-item]
    assert bad == [{"line": 2, "chain_pos": 9, "hash": "b", "found": None}]
    (tmp_path / "x.jsonl").write_text('{"hash": "a"}\n', encoding="utf-8")
    with pytest.raises(AnchorFileError):
        read_anchor_lines(tmp_path / "x.jsonl")
