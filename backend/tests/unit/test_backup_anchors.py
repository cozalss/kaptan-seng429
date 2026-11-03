"""The off-Docker anchor file as an outside witness for a restored ledger (kaptan.ops.backup)."""

from __future__ import annotations

import json
from pathlib import Path

from kaptan.ops.backup import compare_anchors, read_anchor_lines


def test_read_anchor_lines_skips_a_torn_last_line(tmp_path: Path) -> None:
    f = tmp_path / "a.jsonl"
    good = json.dumps({"anchored_at": "t", "chain_pos": 2, "hash": "aa"})
    f.write_text(good + "\n" + '{"anchored_at": "t2", "chain', encoding="utf-8")
    assert read_anchor_lines(f) == [(2, "aa")]


def test_a_missing_file_is_no_witness_not_an_error(tmp_path: Path) -> None:
    assert read_anchor_lines(tmp_path / "nope.jsonl") == []


def test_compare_anchors_matches_ignores_later_ones_and_flags_a_rewrite() -> None:
    ledger = {1: "aa", 2: "bb"}
    assert compare_anchors([(1, "aa"), (2, "bb")], ledger.get) == {"matched": 2, "later": 0, "mismatched": []}
    # An anchor newer than the dump is normal: the backup is simply older than that night.
    assert compare_anchors([(2, "bb"), (9, "zz")], ledger.get) == {"matched": 1, "later": 1, "mismatched": []}
    assert compare_anchors([(2, "XX")], ledger.get) == {"matched": 0, "later": 0, "mismatched": [2]}
