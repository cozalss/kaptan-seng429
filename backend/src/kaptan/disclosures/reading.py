"""One disclosure in full (`GET /disclosures/{index}`): its text, the numbers read out of it, what KAPtan did."""

from __future__ import annotations

from typing import Any, Final

from kaptan.companies.profile import DECISIONS_SQL, decision_of
from kaptan.db import DictConn
from kaptan.disclosures.listing import LIST_ITEM_COLUMNS, to_item
from kaptan.reference._sql import fetch_all, fetch_one

ONE_SQL: Final = f"SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures WHERE disclosure_index = %s"  # noqa: S608
TEXTS_SQL: Final = "SELECT lang, body FROM core.disclosure_texts WHERE disclosure_index = %s ORDER BY lang DESC"
MATERIALITY_SQL: Final = """
SELECT explain->'materiality' AS m FROM trading.agent_runs WHERE run_id = %s AND visible
"""
RUN_SQL: Final = DECISIONS_SQL.replace("WHERE r.ticker = %(t)s", "WHERE r.run_id = %(run)s")
NUMBER_FIELDS: Final = ("denominator", "market_cap", "trade_day_close")
NUMBER_LISTS: Final = ("secondary", "e4_lines", "fx_rates")


def numbers_of(materiality: Any) -> list[dict[str, Any]]:
    """The named numbers in a stored materiality document, in a stable order, no duplicates. Pure."""
    if not isinstance(materiality, dict):
        return []
    refs: list[Any] = [materiality.get(k) for k in NUMBER_FIELDS]
    for key in NUMBER_LISTS:
        value = materiality.get(key)
        refs.extend(value if isinstance(value, list) else [])
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for ref in refs:
        named = isinstance(ref, dict) and isinstance(ref.get("name"), str) and isinstance(ref.get("value"), int | float)
        if named and ref["name"] not in seen:
            seen.add(ref["name"])
            out.append({"name": ref["name"], "value": float(ref["value"])})
    return out


async def disclosure_reading(conn: DictConn, index: int, *, now: Any) -> dict[str, Any] | None:
    row = await fetch_one(conn, ONE_SQL, (index,))
    if row is None:
        return None
    item = to_item(dict(row))
    texts = await fetch_all(conn, TEXTS_SQL, (index,))
    numbers: list[dict[str, Any]] = []
    decision: dict[str, Any] | None = None
    if item["run_id"]:
        mat = await fetch_one(conn, MATERIALITY_SQL, (item["run_id"],))
        numbers = numbers_of(None if mat is None else mat["m"])
        run = await fetch_one(conn, RUN_SQL, {"run": item["run_id"], "now": now, "limit": 1})
        decision = None if run is None else decision_of(run)
    return {
        **item,
        "texts": [{"lang": t["lang"], "body": t["body"]} for t in texts],
        "numbers": numbers,
        "decision": None if decision is None else decision["decision"],
        "proposal_id": None if decision is None else decision["proposal_id"],
        "approval_status": None if decision is None else decision["approval_status"],
        "side": None if decision is None else decision["side"],
    }
