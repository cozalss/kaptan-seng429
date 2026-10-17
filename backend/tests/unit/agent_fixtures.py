"""Build a graph RunContext from the demo fixtures alone (no Postgres): unit tests of the pipeline."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from kaptan.agents.context import DeskState, DisclosureInput, Restriction, RunContext
from kaptan.agents.tools import ReplayToolbox
from kaptan.demo.fixtures import DemoFixtures
from kaptan.llm.replay import ReplayProvider

FX = DemoFixtures()


def fixture_run(run_id: str) -> dict[str, Any]:
    return next(r for r in FX.runs if r["explain"]["run"]["run_id"] == run_id)


def ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def context_for(run_id: str, *, published_at: datetime | None = None, **desk: Any) -> RunContext:
    r = fixture_run(run_id)
    e = r["explain"]
    disc = e["disclosure"]
    issuer = next(i for i in FX.json("issuers.json") if i["ticker"] == disc["primary_ticker"])
    risk = FX.json("risk_state.json")
    published = published_at or ts(disc["published_at"])
    restrictions = tuple(
        Restriction(x["kind"], x["source_ref"]) for x in FX.json("restricted.json") if x["ticker"] == issuer["ticker"]
    )
    desk_kw: dict[str, Any] = {
        "in_universe": issuer.get("inUniverse", True),
        "last_price": Decimal(str(issuer["price"])),
        "adv20_try": Decimal(str(issuer["adv20Try"])),
        "free_float": issuer["freeFloat"],
        "equity_try": Decimal(str(FX.meta["paper_equity_try"])),
        "restrictions": restrictions,
        "daily_pnl_pct": Decimal(str(risk["daily_pnl_pct"])),
        "drawdown_pct": Decimal(str(risk["drawdown_pct"])),
        **desk,
    }
    return RunContext(
        provider=ReplayProvider(),
        tools=ReplayToolbox(),
        disclosure=DisclosureInput(
            run_id=e["run"]["run_id"],
            disclosure_index=disc["disclosure_index"],
            ticker=disc["primary_ticker"],
            company_name=disc["company_name"],
            subject=disc["subject"],
            summary=disc["summary"],
            text_tr=next(t["body"] for t in e["texts"] if t["lang"] == "tr"),
            published_at=published,
            available_at=published + timedelta(seconds=21),
            strategy_version=e["run"]["strategy_version"],
            is_fixture=e["run"]["is_fixture"],
            stored_classification=disc["classification"],
        ),
        desk=DeskState(**desk_kw),
        prompt_manifest_hash=FX.meta["prompt_manifest_hash"],
    )


def disclosure_doc(run_id: str) -> dict[str, Any]:
    return dict(fixture_run(run_id)["explain"]["disclosure"])


def texts(run_id: str) -> list[dict[str, str]]:
    return list(fixture_run(run_id)["explain"]["texts"])


def diff(a: Any, b: Any, path: str = "") -> list[str]:
    """Paths where two JSON documents differ (numbers compare by value)."""
    if isinstance(a, dict) and isinstance(b, dict):
        out: list[str] = []
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{path}.{k} (missing on one side)")
            else:
                out.extend(diff(a[k], b[k], f"{path}.{k}"))
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path} (len {len(a)} != {len(b)})"]
        return [d for i, (x, y) in enumerate(zip(a, b, strict=True)) for d in diff(x, y, f"{path}[{i}]")]
    return [] if a == b else [f"{path}: {a!r} != {b!r}"]
