"""The demo day as exported from the panel mock (scripts/export_demo_fixtures.mjs → tests/fixtures/demo/).

Pure: reads the JSON files and turns them into table rows (tuples in column order). The seeder
(seed.py) only writes them. Keeping this pure makes the mapping unit-testable without Postgres.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from functools import cached_property
from pathlib import Path
from typing import Any, Final

from kaptan.settings import BACKEND_DIR

FIXTURE_DIR: Final = BACKEND_DIR / "tests" / "fixtures" / "demo"

Row = tuple[Any, ...]


def ts(value: str | None) -> datetime | None:
    """toISOString() → aware datetime."""
    return None if value is None else datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class DemoFixtures:
    root: Path = FIXTURE_DIR

    def _read(self, name: str) -> Any:
        with (self.root / name).open(encoding="utf-8") as fh:
            return json.load(fh)

    @cached_property
    def meta(self) -> dict[str, Any]:
        data: dict[str, Any] = self._read("meta.json")
        return data

    @cached_property
    def runs(self) -> list[dict[str, Any]]:
        data: list[dict[str, Any]] = self._read("runs.json")
        return data

    @cached_property
    def audit(self) -> list[dict[str, Any]]:
        data: list[dict[str, Any]] = self._read("audit.json")
        return data

    def json(self, name: str) -> Any:
        return self._read(name)

    # ── rows ────────────────────────────────────────────────────────────
    def user_rows(self) -> list[Row]:
        return [(m["uid"], m["name"], m["role"], m["duty_tr"], i) for i, m in enumerate(self.json("team.json"))]

    def issuer_rows(self) -> list[Row]:
        return [
            (
                i["ticker"],
                i["name"],
                i["sector"],
                i["group"],
                i["freeFloat"],
                i["adv20Try"],
                i["price"],
                i.get("inUniverse", True),
            )
            for i in self.json("issuers.json")
        ]

    def disclosure_rows(self) -> list[Row]:
        """Today's 318 rows (212 visible at 13:40, the rest released by the live ticker), the demo rows
        (hidden until injected) and the historical runs' disclosures (not part of today's feed)."""
        anchor_total = int(self.meta["day_by_anchor"]["total"])
        rows: list[Row] = []
        seen: set[int] = set()
        for d in self.json("disclosures.json"):
            slot = int(d["slot"])
            visible = bool(d["released_at_anchor"])
            rows.append(
                _disclosure_row(
                    d,
                    day_slot=slot,
                    visible=visible,
                    release_order=None if visible else slot - anchor_total + 1,
                    scenario=None,
                )
            )
            seen.add(int(d["disclosure_index"]))
        for d in self.json("demo_disclosures.json"):
            rows.append(_disclosure_row(d, day_slot=None, visible=False, release_order=None, scenario=d["scenario"]))
            seen.add(int(d["disclosure_index"]))
        for r in self.runs:
            d = r["explain"]["disclosure"]
            if int(d["disclosure_index"]) not in seen:
                rows.append(_disclosure_row(d, day_slot=None, visible=False, release_order=None, scenario=None))
                seen.add(int(d["disclosure_index"]))
        return rows

    def text_rows(self) -> list[Row]:
        out: dict[tuple[int, str], Row] = {}
        for r in self.runs:
            idx = int(r["explain"]["disclosure"]["disclosure_index"])
            for t in r["explain"]["texts"]:
                out[(idx, t["lang"])] = (idx, t["lang"], t["body"])
        return list(out.values())

    def run_rows(self) -> list[Row]:
        rows: list[Row] = []
        for r in self.runs:
            run, spec = r["explain"]["run"], r["spec"]
            rows.append(
                (
                    run["run_id"],
                    run["disclosure_index"],
                    run["ticker"],
                    run["company_name"],
                    run["event_type"],
                    spec["kind"],
                    run["status"],
                    run["outcome"],
                    run["mode"],
                    r["set"],
                    r["scenario"],
                    r["set"] != "demo",
                    run["strategy_version"],
                    run["is_fixture"],
                    ts(run["started_at"]),
                    ts(run["finished_at"]),
                    run["llm_calls"],
                    run["tokens_in"],
                    run["tokens_out"],
                    run["latency_ms"],
                    spec,
                    r["explain"],
                )
            )
        return rows

    def proposal_rows(self) -> list[Row]:
        rows: list[Row] = []
        for r in self.runs:
            p, a = r["explain"]["proposal"], r["explain"]["approval"]
            if p is None:
                continue
            created = a["created_at"] if a else r["explain"]["run"]["started_at"]
            rows.append((p["proposal_id"], p["run_id"], p["ticker"], p, ts(created)))
        return rows

    def approval_rows(self) -> list[Row]:
        rows: list[Row] = []
        for r in self.runs:
            a = r["explain"]["approval"]
            if a is None:
                continue
            rows.append(
                (
                    a["proposal_id"],
                    a["run_id"],
                    a,
                    a["status"],
                    a["decided_by"],
                    a["decided_role"],
                    ts(a["decided_at"]),
                    a["decision_comment"],
                    a["approved_notional_try"],
                    ts(a["created_at"]),
                    ts(a["expires_at"]),
                )
            )
        return rows

    def decision_rows(self) -> list[Row]:
        names = {m["uid"]: m["name"] for m in self.json("team.json")}
        rows: list[Row] = []
        for r in self.runs:
            a = r["explain"]["approval"]
            if a is None or a["status"] not in ("approved", "rejected") or a["decided_by"] is None:
                continue
            decision = "approve" if a["status"] == "approved" else "reject"
            rows.append(
                (
                    a["proposal_id"],
                    a["decided_by"],
                    names.get(a["decided_by"], a["decided_by"]),
                    a["decided_role"] or "risk_officer",
                    decision,
                    a["approved_notional_try"],
                    a["decision_comment"],
                    ts(a["decided_at"]),
                )
            )
        return rows

    def paper_orders(self) -> list[dict[str, Any]]:
        """SimBIST orders at 13:40. Ticket orders (broker order_ticket) are not stored: they are a
        projection of trading.order_tickets (the mock's ticketOrder())."""
        return [o for o in self.json("expected/orders.json") if o["broker"] == "simbist"]

    def order_rows(self) -> list[Row]:
        return [
            (
                o["id"],
                o["client_order_id"],
                o["proposal_id"],
                o["run_id"],
                o["ticker"],
                o["company_name"],
                o["side"],
                o["order_type"],
                o["tif"],
                o["qty"],
                o["limit_price"],
                o["status"],
                o["broker"],
                o.get("cancel_reason"),
                o["is_fixture"],
                ts(o["created_at"]),
            )
            for o in self.paper_orders()
        ]

    def fill_rows(self) -> list[Row]:
        return [
            (
                f["id"],
                f["order_id"],
                f["qty"],
                f["price"],
                f["commission"],
                f["bsmv"],
                f["slippage_bps"],
                ts(f["filled_at"]),
                f["source"],
            )
            for o in self.paper_orders()
            for f in o["fills"]
        ]

    def ticket_rows(self) -> list[Row]:
        """Tickets as issued (raw mark = awaiting); `expired` is derived at read time from valid_until."""
        rows: list[Row] = []
        for t in self.json("expected/tickets.json"):
            doc = {k: v for k, v in t.items() if k != "entry"}
            rows.append(
                (
                    t["ticket_no"],
                    t["order_id"],
                    t["proposal_id"],
                    t["run_id"],
                    doc,
                    "awaiting",
                    ts(t["created_at"]),
                    ts(t["valid_until"]),
                )
            )
        return rows

    def position_rows(self) -> list[Row]:
        return [
            (
                p["book"],
                p["ticker"],
                p["company_name"],
                p["qty"],
                p["avg_cost"],
                p["last_price"],
                ts(p["opened_at"]),
                p["planned_exit_date"],
                p["source_proposal"],
                p["run_id"],
                p["event_type"],
                p["strategy_version"],
                p["realized_pnl"],
            )
            for p in self.json("expected/positions.json")
        ]

    def pnl_rows(self) -> list[Row]:
        return [
            (
                p["strategy"],
                p["d"],
                i,
                p["equity"],
                p["daily_return"],
                p["peak_equity"],
                p["drawdown"],
                p["n_positions"],
                p["n_trades"],
            )
            for i, p in enumerate(self.json("pnl.json"))
        ]

    def limit_version_rows(self) -> list[Row]:
        return [
            (
                v["version"],
                v["status"],
                v["reason"],
                ts(v["created_at"]),
                ts(v["effective_from"]),
                v["proposed_by"],
                v["decided_by"],
            )
            for v in self.json("limit_versions.json")
        ]

    def limit_rows(self) -> list[Row]:
        return [
            (v["version"], item["key"], item["value"], i)
            for v in self.json("limit_versions.json")
            for i, item in enumerate(v["values"])
        ]

    def restricted_rows(self) -> list[Row]:
        return [
            (r["id"], r["ticker"], r["kind"], r["source_ref"], ts(r["added_at"]), r["added_by"])
            for r in self.json("restricted.json")
        ]

    def watchlist_rows(self) -> list[Row]:
        return [(t, i) for i, t in enumerate(self.json("watchlist.json"))]

    def quota_rows(self) -> list[Row]:
        return [
            (q["provider"], i, q["used"], q["per_injection"], q["limit"]) for i, q in enumerate(self.meta["quota_base"])
        ]

    def day_counter_row(self) -> Row:
        """LLM usage of the demo day so far: 31 calls; tokens = the day's runs (the API shows at least the
        mock's floor, meta.counters_base.llm_tokens_floor = 412000)."""
        tokens = sum(r["spec"]["tokens"][0] + r["spec"]["tokens"][1] for r in self.runs if r["set"] == "day")
        return (self.meta["demo_day"], self.meta["counters_base"]["llm_calls"], tokens)

    def risk_row(self) -> Row:
        r = self.json("risk_state.json")
        return (
            r["kill_switch"],
            r["kill_reason"],
            ts(r["kill_at"]),
            r["kill_by"],
            r["halted_today"],
            r["daily_pnl_pct"],
            r["drawdown_pct"],
            r["reset_started"],
        )

    def live_arm_row(self) -> Row:
        a = self.json("live_arm.json")
        return (a["config_live"], a["env_enabled"], a["ui_key"], a["armed"], ts(a["expires_at"]))


def _disclosure_row(
    d: dict[str, Any], *, day_slot: int | None, visible: bool, release_order: int | None, scenario: str | None
) -> Row:
    return (
        d["disclosure_index"],
        d["disclosure_oid"],
        d["stock_codes"],
        d["related_stocks"],
        d["primary_ticker"],
        d["company_name"],
        d["disclosure_class"],
        d["disclosure_type"],
        d["subject"],
        d["summary"],
        d["reason"],
        d["related_index"],
        d["is_late"],
        d["attachment_count"],
        d["has_multilang"],
        d["is_noise"],
        d["subject_route"],
        d["subject_map_version"],
        ts(d["published_at"]),
        ts(d["first_seen_at"]),
        ts(d["available_at"]),
        d["ingest_source"],
        d["classification"],
        d["run_id"],
        d["linked_news_count"],
        d["note_count"],
        day_slot,
        visible,
        release_order,
        scenario,
    )
