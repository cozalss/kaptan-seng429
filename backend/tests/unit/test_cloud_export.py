"""The files the Cloudflare Worker shares with the backend must be what the backend would generate now.

If this fails, run `uv run python scripts/export_cloud_data.py` from `backend/` and commit the result: the Worker's
subject map, calendar and parity fixture come from here, so there is one source of truth.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "export_cloud_data.py"


def _script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("export_cloud_data", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_generated_worker_data_is_up_to_date() -> None:
    stale = _script().stale()
    assert stale == [], f"out of date, run scripts/export_cloud_data.py: {[p.name for p in stale]}"


def test_the_export_covers_the_digest_kinds_the_calendar_and_the_parity_rows() -> None:
    module = _script()
    files = {p.name: json.loads(text) for p, text in module.render().items()}
    subject_map = files["subject_map.json"]
    assert set(subject_map["kind_order"]) == set(subject_map["kind_titles"])
    assert "noise" in subject_map["routes"].values()
    assert set(subject_map["route_kinds"].values()) == {"buyback", "contract", "earnings", "restriction"}
    assert "2026-10-29" in files["calendar.json"]["holidays"]
    rows = files["parity.json"]["rows"]
    assert any(r["important"] for r in rows) and any(not r["important"] for r in rows)
    flat = json.dumps(subject_map["lines"], ensure_ascii=False)
    assert "₺" not in flat and "adet" not in flat  # no money in the default lines
