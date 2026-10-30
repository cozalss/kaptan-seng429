"""The process entry points (container healthcheck, prod serve, migrate job, `python -m kaptan.reference`)
with their I/O faked: argument handling, routing and exit codes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import pytest

import kaptan.reference.__main__ as ref_cli
from kaptan.api.loop import run
from kaptan.ops import healthcheck, migrate, serve
from kaptan.ops.health import code_heads
from kaptan.settings import ConfigError, get_settings

# ── healthcheck ──────────────────────────────────────────────────────────


def test_component_from_env_cmdline_or_unknown(tmp_path: Path) -> None:
    assert healthcheck.component({"KAPTAN_COMPONENT": "scheduler"}) == "scheduler"
    missing = tmp_path / "nope"
    assert healthcheck.component({}, missing) == "unknown"
    cmd = tmp_path / "cmdline"
    for raw, want in (
        (b"python\0-m\0kaptan.workers.agent_worker\0", "agent_worker"),
        (b"python\0-m\0kaptan.ops.serve\0", "api"),
        (b"/entrypoint\0api\0", "api"),
        (b"python\0-m\0kaptan.ops.migrate\0", "other"),
    ):
        cmd.write_bytes(raw)
        assert healthcheck.component({}, cmd) == want


def test_api_and_worker_probes(monkeypatch: pytest.MonkeyPatch) -> None:
    assert healthcheck.api_healthy(1) is False  # nothing listens on port 1

    class Res:
        status = 200

        def __enter__(self) -> Res:
            return self

        def __exit__(self, *a: object) -> None:
            return None

    monkeypatch.setattr(healthcheck.urllib.request, "urlopen", lambda *a, **k: Res())
    assert healthcheck.api_healthy(8000) is True

    class FakeRedis:
        @classmethod
        def from_url(cls, *a: object, **k: object) -> FakeRedis:
            return cls()

        def exists(self, key: str) -> int:
            return 1 if key.endswith("scheduler") else 0

    import redis

    monkeypatch.setattr(redis, "Redis", FakeRedis)
    assert healthcheck.worker_healthy("scheduler") is True
    assert healthcheck.worker_healthy("agent_worker") is False

    def boom(*a: object, **k: object) -> None:
        raise OSError("down")

    monkeypatch.setattr(FakeRedis, "from_url", boom)
    assert healthcheck.worker_healthy("scheduler") is False


def test_healthcheck_main(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, api_ok, worker_ok, want in (
        ("api", True, False, 0),
        ("api", False, False, 1),
        ("scheduler", False, True, 0),
        ("scheduler", False, False, 1),
        ("bootstrap", False, False, 0),
    ):
        monkeypatch.setattr(healthcheck, "component", lambda n=name: n)
        monkeypatch.setattr(healthcheck, "api_healthy", lambda port, ok=api_ok: ok)
        monkeypatch.setattr(healthcheck, "worker_healthy", lambda n, ok=worker_ok: ok)
        assert healthcheck.main() == want


# ── serve ────────────────────────────────────────────────────────────────


def test_serve_runs_uvicorn_with_safe_options(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(serve.uvicorn, "run", lambda target, **kw: calls.append({"target": target, **kw}))
    monkeypatch.setattr(serve, "setup_logging", lambda *a, **k: None)
    assert serve.main(["--port", "8123", "--workers", "0"]) == 0
    (call,) = calls
    assert call["target"] == "kaptan.ops.serve:app_factory" and call["port"] == 8123 and call["workers"] == 1
    assert call["proxy_headers"] is False and call["access_log"] is False

    def refuse(*a: object) -> None:
        raise ConfigError("JWT_SECRET is the dev default")

    monkeypatch.setattr(serve, "ensure_production_ready", refuse)
    assert serve.main([]) == 2


def test_serve_app_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    import kaptan.api.main as api_main

    monkeypatch.setattr(serve, "setup_logging", lambda *a, **k: None)
    monkeypatch.setattr(api_main, "create_app", lambda settings: ("app", settings))
    assert serve.app_factory() == ("app", get_settings())


# ── migrate ──────────────────────────────────────────────────────────────


def test_migrate_exit_codes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(migrate, "setup_logging", lambda *a, **k: None)
    monkeypatch.setattr(migrate, "upgrade", lambda s: code_heads())
    assert migrate.main() == 0
    monkeypatch.setattr(migrate, "upgrade", lambda s: frozenset({"0001"}))
    assert migrate.main() == 1

    def refuse(*a: object) -> None:
        raise ConfigError("DATABASE_OWNER_URL is not set")

    monkeypatch.setattr(migrate, "ensure_production_ready", refuse)
    assert migrate.main() == 2


def test_migrate_upgrade_logs_before_and_after(monkeypatch: pytest.MonkeyPatch) -> None:
    import alembic.command

    seen: list[str] = []
    monkeypatch.setattr(migrate, "db_heads", lambda s: frozenset({"0001"}) if not seen else code_heads())
    monkeypatch.setattr(alembic.command, "upgrade", lambda cfg, rev: seen.append(rev))
    assert migrate.upgrade(get_settings()) == code_heads()
    assert seen == ["head"]


# ── python -m kaptan.reference ───────────────────────────────────────────


@dataclass
class _Report:
    n: int
    when: date


class _Conn:
    def __init__(self) -> None:
        self.committed = self.closed = False

    async def commit(self) -> None:
        self.committed = True

    async def close(self) -> None:
        self.closed = True


def test_jsonable() -> None:
    out = ref_cli._jsonable({"r": _Report(2, date(2026, 10, 30)), "xs": (1, None, Path("a"))})
    assert out == {"r": {"n": 2, "when": "2026-10-30"}, "xs": [1, None, "a"]}


def test_reference_cli_routes_every_job(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    from kaptan import dq, fundamentals, reference
    from kaptan.prices import intraday

    conn = _Conn()

    async def fake_connect(url: str) -> _Conn:
        return conn

    def job(name: str) -> Any:
        async def run(*a: object, **k: object) -> dict[str, str]:
            return {"job": name}

        return run

    monkeypatch.setattr(ref_cli, "connect", fake_connect)
    for mod, fn in (
        (reference, "sync_market_changes"), (reference, "run_universe"), (reference, "run_tedbir_sync"),
        (reference, "run_event_returns"), (dq, "run_dq"), (dq, "run_retention"),
        (reference, "run_issuer_profiles"), (fundamentals, "run_fundamentals"), (intraday, "refresh_quotes"),
        (intraday, "run_intraday_archive"),
    ):  # fmt: skip
        monkeypatch.setattr(mod, fn, job(fn))
    monkeypatch.setattr(reference, "spk_bulletin_source", lambda *a, **k: None)
    for name in ref_cli.JOBS:
        argv = [name, "--day", "2026-10-20", "--tickers", "thyao, asels"]
        assert run(ref_cli.main(argv)) == 0
    out = capsys.readouterr().out
    for fn in ("run_universe", "run_dq", "refresh_quotes", "run_intraday_archive", "run_fundamentals"):
        assert fn in out
    assert conn.committed and conn.closed


def test_reference_cli_without_a_test_database(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings().model_copy(update={"test_database_url": None})
    monkeypatch.setattr(ref_cli, "get_settings", lambda: settings)
    assert run(ref_cli.main(["dq", "--test"])) == 2
