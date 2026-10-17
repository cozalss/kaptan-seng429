"""Contract-test harness: validate payloads against the panel's zod schemas (exported as JSON Schema).

    from tests.contract.harness import assert_matches
    assert_matches("ApprovalCard", response.json())          # one object
    assert_matches("ApprovalCard", response.json(), many=True)  # a list of them

Schemas live in tests/contract/schemas (node tests/contract/export_schemas.mjs). They are strict
(additionalProperties: false), exactly like the panel's `schema.safeParse()` on every response —
a mismatch there shows "502 schema" in the panel.
"""

from __future__ import annotations

import json
import subprocess
from functools import cache
from pathlib import Path
from typing import Any, Final

from jsonschema import Draft202012Validator

CONTRACT_DIR: Final = Path(__file__).resolve().parent
SCHEMA_DIR: Final = CONTRACT_DIR / "schemas"
PANEL_DIR: Final = CONTRACT_DIR.parents[2] / "kaptan-panel"


@cache
def schema(name: str) -> dict[str, Any]:
    path = SCHEMA_DIR / f"{name}.json"
    if not path.exists():
        raise KeyError(f"no exported zod schema named {name!r} (re-run export_schemas.mjs?)")
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return data


@cache
def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(schema(name))


def schema_errors(name: str, payload: Any) -> list[str]:
    errors = sorted(_validator(name).iter_errors(payload), key=lambda e: list(e.absolute_path))
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in errors]


def assert_matches(name: str, payload: Any, *, many: bool = False) -> None:
    """Fail with every violation listed when `payload` does not match zod schema `name`."""
    items = payload if many else [payload]
    if many and not isinstance(payload, list):
        raise AssertionError(f"{name}[]: expected a JSON array, got {type(payload).__name__}")
    problems: list[str] = []
    for i, item in enumerate(items):
        problems += [f"[{i}] {p}" if many else p for p in schema_errors(name, item)]
    if problems:
        shown = "\n  ".join(problems[:20])
        raise AssertionError(f"payload does not match zod schema {name}:\n  {shown}")


def node_available() -> bool:
    try:
        subprocess.run(["node", "--version"], check=True, capture_output=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return False
    return (PANEL_DIR / "node_modules" / "jiti").exists()


def panel_oracle(request: dict[str, Any]) -> Any:
    """Run the panel's own TS functions (panel_oracle.mjs) on `request`; returns the parsed JSON."""
    proc = subprocess.run(
        ["node", str(CONTRACT_DIR / "panel_oracle.mjs")],
        input=json.dumps(request, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"panel_oracle failed: {proc.stderr[-2000:]}")
    return json.loads(proc.stdout)
