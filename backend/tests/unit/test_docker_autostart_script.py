"""`Enable-DockerAutoStart` (backend/ops/kaptan-ortak.ps1): sets "AutoStart": true in Docker Desktop's settings file,
backs it up first, leaves every other key alone, and falls back to the older settings.json.

Runs the real function with Windows PowerShell on a COPY in a temp folder (never the person's own settings)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ORTAK = Path(__file__).resolve().parents[2] / "ops" / "kaptan-ortak.ps1"
POWERSHELL = shutil.which("powershell")

pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="Windows PowerShell not available")

SETTINGS = {
    "AutoDownloadUpdates": False,
    "AutoStart": False,
    "IntegratedWslDistros": ["Ubuntu"],
    "KubernetesEnabled": True,
    "LastContainerdSnapshotterEnable": 1779491154,
    "SettingsVersion": 46,
    "UpdatePreviousVersion": "",
}


def run(folder: Path) -> str:
    script = f". '{ORTAK}'; Enable-DockerAutoStart -Dir '{folder}'"
    assert POWERSHELL is not None
    done = subprocess.run(
        [POWERSHELL, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        check=False,
    )
    assert done.returncode == 0, done.stderr
    return done.stdout.strip().splitlines()[-1]


def test_it_turns_autostart_on_keeps_every_other_key_and_backs_up_first(tmp_path: Path) -> None:
    store = tmp_path / "settings-store.json"
    store.write_text(json.dumps(SETTINGS, indent=2), encoding="utf-8")
    assert run(tmp_path) == "acildi"
    after = json.loads(store.read_text(encoding="utf-8"))
    assert after == {**SETTINGS, "AutoStart": True}
    assert json.loads((tmp_path / "settings-store.json.kaptan-yedek").read_text(encoding="utf-8")) == SETTINGS
    assert not store.read_bytes().startswith(b"\xef\xbb\xbf")
    assert run(tmp_path) == "zaten"  # a second run changes nothing
    assert json.loads((tmp_path / "settings-store.json.kaptan-yedek").read_text(encoding="utf-8")) == SETTINGS


def test_it_adds_the_key_when_it_is_missing_and_falls_back_to_the_old_file(tmp_path: Path) -> None:
    old = tmp_path / "settings.json"
    old.write_text(json.dumps({"UseContainerdSnapshotter": True}), encoding="utf-8")
    assert run(tmp_path) == "acildi"
    assert json.loads(old.read_text(encoding="utf-8")) == {"UseContainerdSnapshotter": True, "AutoStart": True}


def test_the_newer_file_wins_over_the_old_one(tmp_path: Path) -> None:
    (tmp_path / "settings-store.json").write_text(json.dumps(SETTINGS), encoding="utf-8")
    (tmp_path / "settings.json").write_text(json.dumps({"AutoStart": False}), encoding="utf-8")
    assert run(tmp_path) == "acildi"
    assert json.loads((tmp_path / "settings.json").read_text(encoding="utf-8")) == {"AutoStart": False}


def test_no_settings_file_or_a_broken_one_is_reported_and_nothing_is_written(tmp_path: Path) -> None:
    assert run(tmp_path) == "yok"
    (tmp_path / "settings-store.json").write_text("{ not json", encoding="utf-8")
    assert run(tmp_path) == "hata"
    assert (tmp_path / "settings-store.json").read_text(encoding="utf-8") == "{ not json"
    assert not list(tmp_path.glob("*.kaptan-yedek"))
