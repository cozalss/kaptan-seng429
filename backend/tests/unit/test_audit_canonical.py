"""The Python canonical form must equal the panel's JSON.stringify byte for byte."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from kaptan.audit.canonical import ChainFields, canonical_of, hash_of, js_json, js_number, js_string
from kaptan.audit.verify import StoredEntry, verify_chain

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "demo"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, "0"),
        (-0.0, "0"),
        (620, "620"),
        (48.32, "48.32"),
        (2.0, "2"),
        (100.0, "100"),
        (0.1, "0.1"),
        (0.004, "0.004"),
        (-0.0392, "-0.0392"),
        (1e-6, "0.000001"),
        (1e-7, "1e-7"),
        (1.5e-7, "1.5e-7"),
        (123456789012345680000.0, "123456789012345680000"),
        (1e21, "1e+21"),
        (1.7976931348623157e308, "1.7976931348623157e+308"),
        (5e-324, "5e-324"),
        (10**21, "1e+21"),
        (1_016_480, "1016480"),
        (math.nan, "null"),
        (math.inf, "null"),
    ],
)
def test_js_number_matches_ecmascript(value: float, expected: str) -> None:
    assert js_number(value) == expected


def test_js_string_escapes_like_json_stringify() -> None:
    assert js_string('a"b\\c') == '"a\\"b\\\\c"'
    assert js_string("\n\r\t\b\f") == '"\\n\\r\\t\\b\\f"'
    assert js_string("\x01\x1f") == '"\\u0001\\u001f"'
    assert js_string("ÖRNEK ENERJİ A.Ş. — %18 ✓ 🚢") == '"ÖRNEK ENERJİ A.Ş. — %18 ✓ 🚢"'
    assert js_string(" \x7f") == '" \x7f"'
    assert js_string("\ud800") == '"\\ud800"'


def test_sorted_object_keys_put_array_indices_first() -> None:
    # JS objects list integer-like keys first, ascending numerically, whatever the insertion order.
    payload = {"b": 1, "10": 2, "a": 3, "9": 4, "01": 5, "-1": 6}
    assert js_json(payload, sort_keys=True) == '{"9":4,"10":2,"-1":6,"01":5,"a":3,"b":1}'


def test_nested_structures_are_sorted_recursively() -> None:
    payload = {"z": [{"y": 1, "x": None}, True], "a": {"d": False, "c": "ç"}}
    assert js_json(payload, sort_keys=True) == '{"a":{"c":"ç","d":false},"z":[{"x":null,"y":1},true]}'


def test_js_json_rejects_unknown_types() -> None:
    with pytest.raises(TypeError):
        js_json({"x": object()})


def test_canonical_of_layout() -> None:
    fields = ChainFields(
        1,
        "2027-01-11T10:40:00.000Z",
        "user:uye-3",
        "approval.decided",
        "trade_proposal",
        "prop-x",
        None,
        "v1.1-fwd",
        {"b": 2, "a": 1.0},
    )
    assert canonical_of(fields) == (
        '[1,"2027-01-11T10:40:00.000Z","user:uye-3","approval.decided","trade_proposal","prop-x",null,'
        '"v1.1-fwd",{"a":1,"b":2}]'
    )


def _entries() -> list[StoredEntry]:
    rows = json.loads((FIXTURES / "audit.json").read_text(encoding="utf-8"))
    keys = (
        "chain_pos",
        "occurred_at",
        "actor",
        "action",
        "entity_type",
        "entity_id",
        "run_id",
        "strategy_version",
        "payload",
    )
    return [
        StoredEntry(
            seq=r["seq"], fields=ChainFields(**{k: r[k] for k in keys}), prev_hash=r["prev_hash"], hash=r["hash"]
        )
        for r in rows
    ]


def test_every_panel_hash_of_the_demo_ledger_is_reproduced() -> None:
    entries = _entries()
    assert len(entries) == 4812
    prev = "00"
    for e in entries:
        assert e.prev_hash == prev
        assert hash_of(prev, e.fields) == e.hash, f"chain_pos {e.chain_pos}"
        prev = e.hash
    result = verify_chain(entries, "2027-01-11T10:40:00.000Z")
    assert result["ok"] is True
    assert result["checked"] == 4812
    assert result["head_hash"] == entries[-1].hash
