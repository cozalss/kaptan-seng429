"""09 §2.2 LLM06 / §13.1 (excessive agency): the LLM side cannot reach execution. No module under
kaptan.agents, kaptan.llm or kaptan.rag may import the brokers, the approval/execution service, the kill
switch, the limit service or the live-arm keys, at module level or lazily inside a function. The
deterministic risk gate (kaptan.risk.gate) stays allowed: it is pure logic and only says no."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Final

SRC: Final = Path(__file__).resolve().parents[2] / "src" / "kaptan"
LLM_SIDE: Final = ("agents", "llm", "rag")
FORBIDDEN: Final = (
    "kaptan.brokers",
    "kaptan.approvals",
    "kaptan.risk.kill_switch",
    "kaptan.risk.limits",
    "kaptan.portfolio.closing",
)


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            out |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            out.add(node.module)
            out |= {f"{node.module}.{a.name}" for a in node.names}
    return out


def _violations(package: str) -> list[str]:
    bad = []
    for path in sorted((SRC / package).rglob("*.py")):
        for name in _imports(path):
            if any(name == f or name.startswith(f + ".") for f in FORBIDDEN):
                bad.append(f"{path.relative_to(SRC)} imports {name}")
    return bad


def test_the_llm_side_cannot_import_execution() -> None:
    found = [v for pkg in LLM_SIDE for v in _violations(pkg)]
    assert found == []


def test_the_scan_sees_lazy_imports(tmp_path: Path) -> None:
    probe = tmp_path / "probe.py"
    probe.write_text("def f():\n    from kaptan.brokers import guarded\n    import kaptan.approvals.execute\n")
    names = _imports(probe)
    assert "kaptan.brokers.guarded" in names and "kaptan.approvals.execute" in names
