"""A running KAPtan has no demo: no routes, no fixture reads, no replay, no waived restart; old ledgers still verify."""

from __future__ import annotations

import ast
import os
import shutil
import subprocess
import sys
import textwrap
from collections.abc import AsyncIterator
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from asgi_lifespan import LifespanManager
from pydantic import SecretStr, ValidationError

from kaptan.api.deps import settings_dep
from kaptan.api.main import API_PREFIX, create_app
from kaptan.audit.verify import verify_db
from kaptan.audit.writer import AuditDraft, append
from kaptan.db import DictConn, connect
from kaptan.domain.schemas import iso_ms
from kaptan.llm import get_provider
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer, reseed_test_db
from tests.harness.clock import FIXTURE_ANCHOR
from tests.harness.seed import SeedResult

pytestmark = pytest.mark.integration

BACKEND = Path(__file__).resolve().parents[2]
SRC = BACKEND / "src" / "kaptan"
MINIMAL_ENV = {"DATABASE_URL": "postgresql://x@localhost/x"}


def _imports(path: Path) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
            names.update(f"{node.module}.{a.name}" for a in node.names)
    return names


def test_nothing_under_src_imports_demo_replay_or_tests() -> None:
    bad: dict[str, list[str]] = {}
    for path in SRC.rglob("*.py"):
        hits = [
            name
            for name in _imports(path)
            if name == "tests"
            or name.startswith(("tests.", "kaptan.demo", "kaptan.llm.replay", "kaptan.agents.scenario"))
            or name.endswith(("DemoFixtures", "ReplayProvider", "ReplayToolbox"))
        ]
        if hits:
            bad[str(path.relative_to(SRC))] = hits
    assert bad == {}
    assert not (SRC / "demo").exists()
    assert not (SRC / "llm" / "replay.py").exists()


def test_the_image_copies_no_tests_and_no_entrypoint_seeds() -> None:
    dockerfile = (BACKEND / "Dockerfile").read_text(encoding="utf-8")
    assert "COPY tests" not in dockerfile
    assert "tests/" in (BACKEND / ".dockerignore").read_text(encoding="utf-8").splitlines()
    assert "seed_demo" not in (BACKEND / "docker-entrypoint.sh").read_text(encoding="utf-8")


def test_no_compose_file_sets_a_harness_switch() -> None:
    for name in ("docker-compose.yml", "../docker-compose.yml", "../live.env"):
        text = (BACKEND / name).read_text(encoding="utf-8")
        assert "DEMO_MODE" not in text, name
        assert "LLM_MODE: replay" not in text and "LLM_MODE=replay" not in text, name
        assert ":-replay" not in text, name


@pytest.mark.parametrize("env", ["dev", "prod"])
def test_replay_is_refused_outside_the_test_environment(env: str) -> None:
    with pytest.raises(ValidationError, match="LLM_MODE=replay"):
        Settings(_env_file=None, kaptan_env=env, llm_mode="replay", **MINIMAL_ENV)  # type: ignore[arg-type,call-arg]


def test_llm_mode_defaults_to_live_and_only_live_has_a_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_MODE", raising=False)
    settings = Settings(_env_file=None, kaptan_env="dev", **MINIMAL_ENV)  # type: ignore[arg-type,call-arg]
    assert settings.llm_mode == "live"
    assert not hasattr(settings, "demo_mode")
    with pytest.raises(ValueError, match="only has `live`"):
        get_provider("replay")


@pytest.fixture
async def production_app(migrated: Settings, seeded: SeedResult) -> AsyncIterator[httpx.AsyncClient]:
    """The app exactly as a running system builds it: no harness clock, no harness routes."""
    app = create_app(migrated)
    app.dependency_overrides[settings_dep] = lambda: migrated
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app, client=("198.51.99.5", 50000))
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as http:
            yield http


async def test_demo_routes_do_not_exist(production_app: httpx.AsyncClient) -> None:
    assert not [p for p in create_app().openapi()["paths"] if "/demo" in p]
    login = await production_app.post(f"{API_PREFIX}/auth/login", json={"passphrase": DEMO_PASSPHRASE})
    assert login.status_code == 200, login.text
    headers = bearer(login.json()["access_token"])
    for path, body in (("inject", {"scenario": "e3_contract"}), ("tamper", {"on": True}), ("reset", None)):
        res = await production_app.post(f"{API_PREFIX}/demo/{path}", json=body, headers=headers)
        assert res.status_code == 404, path


async def test_health_says_nothing_of_a_demo_and_tells_whether_a_model_is_configured(
    production_app: httpx.AsyncClient,
) -> None:
    body = (await production_app.get(f"{API_PREFIX}/health")).json()
    assert "demo_mode" not in body
    assert isinstance(body["llm_ready"], bool)
    assert not body["now"].startswith("2027-01-11")  # the real clock, not the fixture day


async def test_the_restart_wait_always_applies_and_nothing_writes_a_waiver(
    migrated: Settings, seeded: SeedResult
) -> None:
    from kaptan.api.errors import ApiError
    from kaptan.risk import kill_switch as ks

    conn = await connect(migrated.database_url.get_secret_value())
    now = FIXTURE_ANCHOR
    try:
        await ks.engage(conn, by="user:sahip", reason="Deneme durdurması", role="owner", now=now)
        await ks.start_reset(conn, uid="sahip", name="Sahip", role="owner", reason="Olay incelendi, tamam.", now=now)
        await conn.commit()
        with pytest.raises(ApiError) as early:
            await ks.confirm_reset(conn, uid="sahip", role="owner", reason="Olay incelendi, tamam.", now=now)
        assert early.value.status == 409 and "24 saat" in early.value.detail
        await conn.rollback()
        async with conn.cursor() as cur:
            await cur.execute("SELECT count(*) AS n FROM audit.audit_log WHERE action = 'kill_switch.wait_waived'")
            row = await cur.fetchone()
        assert row is not None and row["n"] == 0
        await ks.confirm_reset(
            conn, uid="sahip", role="owner", reason="Olay incelendi, tamam.", now=now + timedelta(days=8)
        )
        await conn.commit()
    finally:
        await conn.close()
        await reseed_test_db(migrated)


async def test_old_demo_rows_still_read_and_verify(migrated: Settings, seeded: SeedResult) -> None:
    """A ledger written before this version keeps its `demo.injected` and `kill_switch.wait_waived` rows."""
    from kaptan.api.routers.audit import audit_page
    from kaptan.domain.schemas.governance import AuditListQuery

    now = FIXTURE_ANCHOR
    conn: DictConn = await connect(migrated.database_url.get_secret_value())
    try:
        await append(
            conn,
            [
                AuditDraft(
                    actor="user:sahip",
                    action="demo.injected",
                    entity_type="disclosure",
                    entity_id="1",
                    payload={"scenario": "e3_contract", "ticker": "ORNEK", "fixture": True},
                    occurred_at=now,
                ),
                AuditDraft(
                    actor="user:sahip",
                    action="kill_switch.wait_waived",
                    entity_type="system_flag",
                    entity_id="kill_switch",
                    payload={"waiver": "demo_restart_wait", "flow": "kill_reset", "ready_at": iso_ms(now)},
                    occurred_at=now,
                ),
            ],
            now=now,
        )
        await conn.commit()
        page = await audit_page(
            conn, AuditListQuery.model_validate({"scope": "all", "q": None, "limit": 2}), now.date()
        )
        assert [e["action"] for e in page["items"]] == ["kill_switch.wait_waived", "demo.injected"]
        assert "tamper_on" not in page
        verdict = await verify_db(conn, iso_ms(now))
        assert verdict["ok"] is True
    finally:
        await conn.rollback()
        await conn.close()
        await reseed_test_db(migrated)


# ── the image's file set, without tests/ ───────────────────────────────────────
#: What runs inside: every module imports, the API starts, one live-shaped disclosure goes through the real graph.
#: The fake provider lives here, in the script the test harness writes; the code under test has no way to name it.
IMAGE_SCRIPT = textwrap.dedent(
    """
    import asyncio, importlib, importlib.util, json, pkgutil, selectors, sys
    from datetime import UTC, datetime

    import httpx

    import kaptan
    from kaptan.settings import BACKEND_DIR

    assert str(BACKEND_DIR) == sys.argv[1], BACKEND_DIR
    assert not (BACKEND_DIR / "tests").exists()
    for mod in pkgutil.walk_packages(kaptan.__path__, "kaptan."):
        if mod.name.endswith("__main__") or mod.name == "kaptan.ops.__main__":
            continue
        importlib.import_module(mod.name)
    assert importlib.util.find_spec("tests") is None
    assert not [m for m in sys.modules if m == "tests" or m.startswith("tests.")]

    from kaptan.agents.feed_run import LiveDeps, run_disclosure
    from kaptan.agents.tools import NoTools
    from kaptan.api.main import API_PREFIX, create_app
    from kaptan.db import connect
    from kaptan.llm.provider import LLMResult, LLMUsage, ProviderError
    from kaptan.settings import get_settings


    class FakeProvider:
        name = "fake"

        async def complete(self, request):
            if request.agent == "guard":
                return LLMResult(output={"injection_score": 0.0}, usage=LLMUsage(model_id=None), provider=self.name)
            raise ProviderError("no answer", provider=self.name, retryable=False)


    async def main():
        settings = get_settings()
        app = create_app(settings)
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as http:
                health = (await http.get(f"{API_PREFIX}/health")).json()
                demo = await http.post(f"{API_PREFIX}/demo/reset")
        conn = await connect(settings.database_url.get_secret_value())
        try:
            deps = LiveDeps(provider=FakeProvider(), tools=NoTools(), live_desk=True)
            result = await run_disclosure(conn, int(sys.argv[2]), datetime.now(UTC), deps)
            await conn.commit()
        finally:
            await conn.close()
        print(json.dumps({
            "health": health,
            "demo_status": demo.status_code,
            "run_id": result.run_id,
            "outcome": result.outcome,
        }))


    with asyncio.Runner(loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())) as runner:
        runner.run(main())
    """
)


async def _live_disclosure(migrated: Settings) -> tuple[int, str]:
    conn = await connect(migrated.database_url.get_secret_value())
    index = 991_555_001
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT ticker FROM core.issuers i WHERE in_universe AND NOT EXISTS "
                "(SELECT 1 FROM core.restricted_securities r WHERE r.ticker = i.ticker) ORDER BY ticker LIMIT 1"
            )
            row: Any = await cur.fetchone()
        assert row is not None
        ticker = str(row["ticker"])
        await conn.execute(
            "INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, primary_ticker, "
            "company_name, disclosure_class, disclosure_type, subject, summary, reason, subject_route, "
            "subject_map_version, published_at, available_at, ingest_source, origin, visible, is_noise) "
            "VALUES (%s, %s, %s, %s, 'Canlı A.Ş.', 'ODA', 'ODA', 'Özel Durum Açıklaması', '', 'NEW', 'llm', "
            "'subject_map.v1', now(), now(), 'live', 'kap', true, false)",
            (index, f"{index:032x}", [ticker], ticker),
        )
        await conn.execute(
            "INSERT INTO core.disclosure_texts (disclosure_index, lang, body) VALUES (%s, 'tr', %s)",
            (index, "Şirketimiz yeni bir sözleşme imzalamıştır."),
        )
        await conn.commit()
    finally:
        await conn.close()
    return index, ticker


async def test_the_image_file_set_starts_and_runs_a_live_disclosure_with_an_injected_provider(
    migrated: Settings, seeded: SeedResult, tmp_path: Path
) -> None:
    root = tmp_path / "app"
    root.mkdir()
    for name in ("src", "config", "data", "migrations"):
        ignore = shutil.ignore_patterns("__pycache__")
        shutil.copytree(BACKEND / name, root / name, ignore=ignore)
    for name in ("alembic.ini", "pyproject.toml"):
        shutil.copy(BACKEND / name, root / name)
    script = tmp_path / "image_check.py"
    script.write_text(IMAGE_SCRIPT, encoding="utf-8")
    index, _ticker = await _live_disclosure(migrated)
    env = {
        **{k: v for k, v in os.environ.items() if k in ("PATH", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE")},
        "PYTHONPATH": str(root / "src"),
        "PYTHONUTF8": "1",
        "KAPTAN_ENV": "dev",
        "DATABASE_URL": migrated.database_url.get_secret_value(),
        "REDIS_URL": migrated.redis_url.get_secret_value(),
    }
    try:
        done = subprocess.run(  # noqa: ASYNC221 - a short child process; the test has nothing else to do
            [sys.executable, str(script), str(root), str(index)],
            cwd=tmp_path,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=180,
            check=False,
        )
        assert done.returncode == 0, done.stderr[-3000:]
        import json

        out = json.loads(done.stdout.strip().splitlines()[-1])
        assert out["demo_status"] == 404
        assert out["health"]["llm_mode"] == "live" and out["health"]["llm_ready"] is False
        assert "demo_mode" not in out["health"]
        assert out["run_id"] == f"run-live-{index}"
        assert out["outcome"] == "HOLD"  # the provider gave nothing: the honest answer, never a made-up one
        conn = await connect(migrated.database_url.get_secret_value())
        try:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT run_set, is_fixture FROM trading.agent_runs WHERE run_id = %s", (out["run_id"],)
                )
                assert await cur.fetchone() == {"run_set": "live", "is_fixture": False}
            await conn.commit()
        finally:
            await conn.close()
    finally:
        await reseed_test_db(migrated)


def test_passphrase_hash_is_the_only_way_in() -> None:
    from kaptan.auth.passphrase import hash_passphrase, verify_passphrase

    bare = Settings(_env_file=None, kaptan_env="dev", passphrase_hash=None, **MINIMAL_ENV)  # type: ignore[arg-type,call-arg]
    assert not verify_passphrase(bare, DEMO_PASSPHRASE)
    configured = bare.model_copy(update={"passphrase_hash": SecretStr(hash_passphrase("kendi parolam"))})
    assert verify_passphrase(configured, "kendi parolam")
