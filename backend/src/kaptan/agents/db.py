"""SQL of the agent pipeline (parametrised; table names are constants). Reads desk state, writes a run."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.domain.schemas._base import iso_ms

LIST_COLUMNS: Final = (
    "disclosure_index",
    "disclosure_oid",
    "stock_codes",
    "related_stocks",
    "primary_ticker",
    "company_name",
    "disclosure_class",
    "disclosure_type",
    "subject",
    "summary",
    "reason",
    "related_index",
    "is_late",
    "attachment_count",
    "has_multilang",
    "is_noise",
    "subject_route",
    "subject_map_version",
    "published_at",
    "first_seen_at",
    "available_at",
    "ingest_source",
    "classification",
    "run_id",
    "linked_news_count",
    "note_count",
)

DEMO_RUN_SQL: Final = """
SELECT run_id, disclosure_index, ticker, company_name, strategy_version, is_fixture, injected_at
  FROM trading.agent_runs WHERE scenario = %s AND run_set = 'demo' ORDER BY run_id LIMIT 1
"""
DISCLOSURE_SQL: Final = f"SELECT {', '.join(LIST_COLUMNS)} FROM core.disclosures WHERE disclosure_index = %s"  # noqa: S608
TEXTS_SQL: Final = (
    "SELECT lang, body FROM core.disclosure_texts WHERE disclosure_index = %s ORDER BY lang <> 'tr', lang"
)
ISSUER_SQL: Final = "SELECT in_universe, price, adv20_try, free_float FROM core.issuers WHERE ticker = %s"
RESTRICTIONS_SQL: Final = (
    "SELECT kind, source_ref FROM core.restricted_securities WHERE ticker = %s ORDER BY added_at, id"
)
RISK_SQL: Final = (
    "SELECT kill_switch, halted_today, daily_pnl_pct, drawdown_pct, regime FROM trading.risk_state WHERE id = 1"
)
BOOK_SQL: Final = """
SELECT count(*) AS n_open, coalesce(bool_or(ticker = %s), false) AS holds_ticker
  FROM trading.positions WHERE book = 'paper'
"""
QUOTA_SQL: Final = "SELECT coalesce(bool_and(used < limit_n), true) AS ok FROM trading.quota_usage"
LIVE_SQL: Final = "SELECT coalesce(bool_or(armed), false) AS armed FROM trading.live_arm"

SHOW_DISCLOSURE_SQL: Final = """
UPDATE core.disclosures SET visible = true, published_at = %s, first_seen_at = %s, available_at = %s,
       classification = %s WHERE disclosure_index = %s
"""
UPDATE_RUN_SQL: Final = """
UPDATE trading.agent_runs
   SET visible = true, injected_at = %s, event_type = %s, status = %s, outcome = %s, started_at = %s,
       finished_at = %s, llm_calls = %s, tokens_in = %s, tokens_out = %s, latency_ms = %s, explain = %s
 WHERE run_id = %s
"""
UPSERT_PROPOSAL_SQL: Final = """
INSERT INTO trading.trade_proposals (proposal_id, run_id, ticker, doc, created_at) VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (proposal_id) DO UPDATE SET doc = EXCLUDED.doc, created_at = EXCLUDED.created_at
"""
# A re-injection refreshes the card but keeps a decision already taken (the mock's approval patches persist).
UPSERT_APPROVAL_SQL: Final = """
INSERT INTO trading.approvals (proposal_id, run_id, card, status, created_at, expires_at)
VALUES (%s, %s, %s, 'pending', %s, %s)
ON CONFLICT (proposal_id) DO UPDATE SET card = EXCLUDED.card, created_at = EXCLUDED.created_at,
       expires_at = EXCLUDED.expires_at
"""
ADD_CALLS_SQL: Final = """
INSERT INTO core.day_counters (d, llm_calls, llm_tokens, updated_at) VALUES (%s, %s, %s, now())
ON CONFLICT (d) DO UPDATE SET llm_calls = core.day_counters.llm_calls + EXCLUDED.llm_calls,
       llm_tokens = core.day_counters.llm_tokens + EXCLUDED.llm_tokens, updated_at = now()
"""
ADD_QUOTA_SQL: Final = "UPDATE trading.quota_usage SET used = used + per_injection"


async def _one(conn: AsyncConnection[Any], sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def _all(conn: AsyncConnection[Any], sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def demo_run(conn: AsyncConnection[Any], scenario: str) -> dict[str, Any]:
    row = await _one(conn, DEMO_RUN_SQL, (scenario,))
    if row is None:
        raise LookupError(f"no demo run for scenario {scenario}")
    return row


async def disclosure(conn: AsyncConnection[Any], index: int) -> dict[str, Any]:
    row = await _one(conn, DISCLOSURE_SQL, (index,))
    if row is None:
        raise LookupError(f"disclosure {index} not found")
    return row


async def texts(conn: AsyncConnection[Any], index: int) -> list[dict[str, str]]:
    return [{"lang": r["lang"], "body": r["body"]} for r in await _all(conn, TEXTS_SQL, (index,))]


async def issuer(conn: AsyncConnection[Any], ticker: str) -> dict[str, Any]:
    row = await _one(conn, ISSUER_SQL, (ticker,))
    if row is None:
        raise LookupError(f"issuer {ticker} not found")
    return row


async def restrictions(conn: AsyncConnection[Any], ticker: str) -> list[dict[str, Any]]:
    return await _all(conn, RESTRICTIONS_SQL, (ticker,))


async def risk_state(conn: AsyncConnection[Any]) -> dict[str, Any]:
    row = await _one(conn, RISK_SQL)
    return row or {
        "kill_switch": "off",
        "halted_today": False,
        "daily_pnl_pct": 0,
        "drawdown_pct": 0,
        "regime": "normal",
    }


async def book(conn: AsyncConnection[Any], ticker: str) -> dict[str, Any]:
    row = await _one(conn, BOOK_SQL, (ticker,))
    return row or {"n_open": 0, "holds_ticker": False}


async def quota_ok(conn: AsyncConnection[Any]) -> bool:
    row = await _one(conn, QUOTA_SQL)
    return bool(row and row["ok"])


async def live_armed(conn: AsyncConnection[Any]) -> bool:
    row = await _one(conn, LIVE_SQL)
    return bool(row and row["armed"])


def list_item(row: dict[str, Any]) -> dict[str, Any]:
    """A core.disclosures row as the panel's DisclosureListItem (times as toISOString())."""
    out = dict(row)
    for k in ("published_at", "first_seen_at", "available_at"):
        out[k] = iso_ms(out[k])
    out["stock_codes"] = list(out["stock_codes"])
    out["related_stocks"] = list(out["related_stocks"])
    return out


def _ts(value: str | None) -> datetime | None:
    return None if value is None else datetime.fromisoformat(value.replace("Z", "+00:00"))


async def show_disclosure(conn: AsyncConnection[Any], disc: dict[str, Any]) -> None:
    cls = disc["classification"]
    params = (
        _ts(disc["published_at"]),
        _ts(disc["first_seen_at"]),
        _ts(disc["available_at"]),
        None if cls is None else Jsonb(cls),
        disc["disclosure_index"],
    )
    await conn.execute(SHOW_DISCLOSURE_SQL, params)


async def update_run(conn: AsyncConnection[Any], run: dict[str, Any], explain: dict[str, Any], now: datetime) -> None:
    params = (
        now,
        run["event_type"],
        run["status"],
        run["outcome"],
        _ts(run["started_at"]),
        _ts(run["finished_at"]),
        run["llm_calls"],
        run["tokens_in"],
        run["tokens_out"],
        run["latency_ms"],
        Jsonb(explain),
        run["run_id"],
    )
    await conn.execute(UPDATE_RUN_SQL, params)


async def upsert_proposal(conn: AsyncConnection[Any], proposal: dict[str, Any], card: dict[str, Any]) -> None:
    created = _ts(card["created_at"])
    await conn.execute(
        UPSERT_PROPOSAL_SQL, (proposal["proposal_id"], proposal["run_id"], proposal["ticker"], Jsonb(proposal), created)
    )
    await conn.execute(
        UPSERT_APPROVAL_SQL, (card["proposal_id"], card["run_id"], Jsonb(card), created, _ts(card["expires_at"]))
    )


async def add_usage(conn: AsyncConnection[Any], day: date, calls: int, tokens: int) -> None:
    """First injection of a scenario only: today's LLM usage and the provider quotas move once."""
    await conn.execute(ADD_CALLS_SQL, (day, calls, tokens))
    await conn.execute(ADD_QUOTA_SQL)
