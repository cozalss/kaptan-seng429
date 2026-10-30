"""Every scheduler job imports its module lazily, in a fresh process: no entry point may hit an import cycle.

Regression: `kaptan.reference.profiles` (the market_changes job) failed with ImportError because
`kaptan.evidence` eagerly imported its toolbox, which imports `kaptan.agents`, whose graph imports the toolbox.
"""

from __future__ import annotations

import subprocess
import sys

import pytest

ENTRY_MODULES = (
    "kaptan.reference.profiles",
    "kaptan.reference.event_returns",
    "kaptan.reference.universe",
    "kaptan.evidence.repo",
    "kaptan.sizing.load",
    "kaptan.evidence",
    "kaptan.agents",
    "kaptan.live.warmup",
)


@pytest.mark.parametrize("module", ENTRY_MODULES)
def test_module_imports_first_in_a_fresh_interpreter(module: str) -> None:
    proc = subprocess.run(
        [sys.executable, "-c", f"import {module}"], capture_output=True, text=True, timeout=120, check=False
    )
    assert proc.returncode == 0, proc.stderr[-2000:]


def test_evidence_package_still_exports_the_toolbox() -> None:
    import kaptan.evidence as evidence
    from kaptan.evidence.toolbox import LiveToolbox

    assert evidence.LiveToolbox is LiveToolbox
    with pytest.raises(AttributeError):
        _ = evidence.not_there  # type: ignore[attr-defined]
