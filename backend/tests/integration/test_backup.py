"""ops/backup.sh → ops/restore.sh into a scratch database, then the audit chain still verifies."""
# ruff: noqa: ASYNC221 - the dump/restore run as subprocesses on purpose (test only)

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest

from kaptan.ops.backup import verify_database
from kaptan.settings import Settings
from tests.conftest import BACKEND
from tests.integration import scratch_db

pytestmark = pytest.mark.integration

DB = "kaptan_test_p_restore"
CONTAINER = os.environ.get("KAPTAN_PG_CONTAINER", "kaptan-postgres-1")


def _runner() -> list[str] | None:
    """`docker exec -i <postgres container> sh -s` (pg_dump 16 inside), else a local sh with pg_dump."""
    if shutil.which("docker"):
        probe = subprocess.run(["docker", "exec", CONTAINER, "pg_dump", "--version"], capture_output=True, check=False)
        if probe.returncode == 0:
            return [
                "docker",
                "exec",
                "-i",
                "-e",
                "BACKUP_DATABASE_URL",
                "-e",
                "RESTORE_DATABASE_URL",
                "-e",
                "BACKUP_OUT",
                CONTAINER,
                "sh",
                "-s",
                "--",
            ]
    if shutil.which("pg_dump") and shutil.which("sh"):
        return ["sh", "-s", "--"]
    return None


@pytest.fixture(scope="module")
def restore_db(migrated: Settings) -> Iterator[str]:
    owner = migrated.database_owner_url
    assert owner is not None
    url = scratch_db.recreate(owner.get_secret_value(), DB)
    yield url
    scratch_db.drop(owner.get_secret_value(), DB)


async def test_backup_and_restore_keep_the_audit_chain(
    seeded: object, migrated: Settings, restore_db: str, tmp_path: Path
) -> None:
    runner = _runner()
    if runner is None:
        pytest.skip("neither the compose postgres container nor a local pg_dump is available")
    owner = migrated.database_owner_url
    assert owner is not None
    script = (BACKEND / "ops" / "backup.sh").read_bytes()
    dump = subprocess.run(
        runner,
        input=script,
        env={**os.environ, "BACKUP_DATABASE_URL": owner.get_secret_value(), "BACKUP_OUT": "-"},
        capture_output=True,
        check=False,
    )
    assert dump.returncode == 0, dump.stderr.decode(errors="replace")
    assert dump.stdout[:5] == b"PGDMP"  # pg_dump custom format
    file = tmp_path / "kaptan.dump"
    file.write_bytes(dump.stdout)
    assert owner.get_secret_value().split("@")[0].split(":")[-1].encode() not in dump.stderr

    # restore.sh reads the dump from stdin ("-"): ship the script as `sh -c` text and the dump on stdin
    restore_sh = (BACKEND / "ops" / "restore.sh").read_text(encoding="utf-8")
    restore_cmd = [*runner[: runner.index("sh")], "sh", "-c", restore_sh, "restore", "-"]
    res = subprocess.run(
        restore_cmd,
        input=file.read_bytes(),
        env={**os.environ, "RESTORE_DATABASE_URL": restore_db},
        capture_output=True,
        check=False,
    )
    assert res.returncode == 0, res.stderr.decode(errors="replace")

    source = await verify_database(owner.get_secret_value())
    restored = await verify_database(restore_db)
    assert restored["ok"] is True
    assert restored["checked"] == source["checked"] > 0
    assert restored["head_hash"] == source["head_hash"]
    assert restored["migrations"] == "ok"

    again = subprocess.run(
        restore_cmd,
        input=file.read_bytes(),
        env={**os.environ, "RESTORE_DATABASE_URL": restore_db},
        capture_output=True,
        check=False,
    )
    assert again.returncode == 3  # a non-empty target is refused without RESTORE_CLEAN=1
