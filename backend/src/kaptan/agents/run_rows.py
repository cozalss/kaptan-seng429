"""Per-run rows (FR-19, 07 §9): `trading.agent_outputs` (one per executed node) and `trading.risk_checks`
(one per gate check), written from the assembled Explain inside the run's persistence transaction.

The rows are derived from `explain` only, so writing them cannot change any API output or audit hash
(nothing reads them back into a response). A re-run of the same run_id (demo re-inject, a resumed live
run) first deletes that run's rows: the tables always mirror the latest explain.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

#: trace node → the explain key holding its output (nodes without one get output NULL).
OUTPUT_KEY: Final[dict[str, str]] = {
    "route": "route",
    "pre_gate": "pre_gate",
    "guard": "guard",
    "classifier": "classifier",
    "reader": "reader",
    "materiality": "materiality",
    "evidence": "evidence_card",
    "merge": "merged",
    "skeptic": "skeptic",
    "rule_engine": "rule_decision",
    "compliance": "compliance",
    "request_approval": "approval",
}

DELETE_OUTPUTS_SQL: Final = "DELETE FROM trading.agent_outputs WHERE run_id = %s"
DELETE_CHECKS_SQL: Final = "DELETE FROM trading.risk_checks WHERE run_id = %s"
INSERT_OUTPUT_SQL: Final = """
INSERT INTO trading.agent_outputs (run_id, node, status, model_id, prompt_version, prompt_manifest_hash, output,
  tokens_in, tokens_out, cached, latency_ms)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""
INSERT_CHECK_SQL: Final = """
INSERT INTO trading.risk_checks (run_id, proposal_id, phase, rule_code, outcome, detail)
VALUES (%s, %s, %s, %s, %s, %s)
"""


def output_rows(explain: Mapping[str, Any], manifest_hash: str) -> list[tuple[Any, ...]]:
    run_id = explain["run"]["run_id"]
    rows: list[tuple[Any, ...]] = []
    for node in explain["trace"]["nodes"]:
        name = str(node["node"])
        key = OUTPUT_KEY.get(name)
        if name == "risk_gate":
            output: Any = {"checks": explain.get("risk_checks", [])}
        else:
            output = explain.get(key) if key else None
        rows.append(
            (
                run_id,
                name,
                str(node.get("status", "done")),
                node.get("model_id"),
                node.get("prompt_version"),
                manifest_hash,
                None if output is None else Jsonb(output),
                int(node.get("tokens_in") or 0),
                int(node.get("tokens_out") or 0),
                bool(node.get("cached")),
                node.get("latency_ms"),
            )
        )
    return rows


def check_rows(explain: Mapping[str, Any]) -> list[tuple[Any, ...]]:
    run_id = explain["run"]["run_id"]
    proposal = explain.get("proposal") or {}
    proposal_id = proposal.get("proposal_id")
    return [
        (run_id, proposal_id, c["phase"], c["rule_code"], c["outcome"], Jsonb(dict(c)))
        for c in explain.get("risk_checks", [])
    ]


async def write_run_rows(conn: AsyncConnection[Any], explain: Mapping[str, Any], manifest_hash: str) -> int:
    """Replace this run's rows; call inside the run transaction. Returns the number of rows written."""
    run_id = explain["run"]["run_id"]
    await conn.execute(DELETE_OUTPUTS_SQL, (run_id,))
    await conn.execute(DELETE_CHECKS_SQL, (run_id,))
    outputs, checks = output_rows(explain, manifest_hash), check_rows(explain)
    async with conn.cursor() as cur:
        if outputs:
            await cur.executemany(INSERT_OUTPUT_SQL, outputs)
        if checks:
            await cur.executemany(INSERT_CHECK_SQL, checks)
    return len(outputs) + len(checks)
