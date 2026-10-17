"""Load the demo day into Postgres (scripts/seed_demo.py, and later POST /demo/reset).

Needs the OWNER connection (DATABASE_OWNER_URL): it empties the append-only ledger, which the app
role cannot do. Everything runs in one transaction; the ledger's mutation triggers are disabled
only inside it. auth.users is upserted (not truncated) so refresh-token families survive a reset.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.audit.writer import INSERT_SQL as AUDIT_INSERT_SQL
from kaptan.demo.fixtures import DemoFixtures, Row, ts

#: Every table the seed owns, emptied before loading (children first is not needed: TRUNCATE … CASCADE).
SEEDED_TABLES = (
    "audit.audit_log",
    "audit.anchors",
    "ops.demo_injections",
    "ops.demo_state",
    "trading.positions",
    "trading.fills",
    "trading.order_tickets",
    "trading.orders",
    "trading.proposal_notes",
    "trading.approval_decisions",
    "trading.approvals",
    "trading.trade_proposals",
    "trading.agent_runs",
    "trading.pnl_daily",
    "trading.limits",
    "trading.limit_versions",
    "trading.risk_state",
    "trading.quota_usage",
    "trading.live_arm",
    "core.disclosure_texts",
    "core.disclosures",
    "core.issuers",
    "core.restricted_securities",
    "core.watchlist",
    "core.day_counters",
)


@dataclass(frozen=True, slots=True)
class SeedResult:
    started_at: datetime
    counts: dict[str, int]


def _jsonb(row: Row, cols: Iterable[int]) -> Row:
    idx = set(cols)
    return tuple(Jsonb(v) if i in idx and v is not None else v for i, v in enumerate(row))


async def _insert(conn: AsyncConnection[Any], sql: str, rows: Sequence[Row], counts: dict[str, int], name: str) -> None:
    async with conn.cursor() as cur:
        await cur.executemany(sql, rows)
    counts[name] = len(rows)


def _placeholders(n: int) -> str:
    return ", ".join(["%s"] * n)


async def _load_reference(conn: AsyncConnection[Any], fx: DemoFixtures, counts: dict[str, int]) -> None:
    await _insert(
        conn,
        f"""
        INSERT INTO auth.users (uid, display_name, role, duty_tr, ord) VALUES ({_placeholders(5)})
        ON CONFLICT (uid) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role,
          duty_tr = EXCLUDED.duty_tr, ord = EXCLUDED.ord, is_active = true""",
        fx.user_rows(),
        counts,
        "auth.users",
    )
    await _insert(
        conn, f"INSERT INTO core.issuers VALUES ({_placeholders(8)})", fx.issuer_rows(), counts, "core.issuers"
    )
    await _insert(
        conn,
        f"""
        INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
          company_name, disclosure_class, disclosure_type, subject, summary, reason, related_index, is_late,
          attachment_count, has_multilang, is_noise, subject_route, subject_map_version, published_at, first_seen_at,
          available_at, ingest_source, classification, run_id, linked_news_count, note_count, day_slot, visible,
          release_order, scenario) VALUES ({_placeholders(30)})""",
        [_jsonb(r, [22]) for r in fx.disclosure_rows()],
        counts,
        "core.disclosures",
    )
    await _insert(
        conn, "INSERT INTO core.disclosure_texts VALUES (%s, %s, %s)", fx.text_rows(), counts, "core.disclosure_texts"
    )
    await _insert(
        conn,
        f"INSERT INTO core.restricted_securities VALUES ({_placeholders(6)})",
        fx.restricted_rows(),
        counts,
        "core.restricted_securities",
    )
    await _insert(conn, "INSERT INTO core.watchlist VALUES (%s, %s)", fx.watchlist_rows(), counts, "core.watchlist")
    await _insert(
        conn,
        "INSERT INTO core.day_counters (d, llm_calls, llm_tokens) VALUES (%s, %s, %s)",
        [fx.day_counter_row()],
        counts,
        "core.day_counters",
    )


async def _load_runs(conn: AsyncConnection[Any], fx: DemoFixtures, counts: dict[str, int]) -> None:
    await _insert(
        conn,
        f"""
        INSERT INTO trading.agent_runs (run_id, disclosure_index, ticker, company_name, event_type, kind, status,
          outcome, mode, run_set, scenario, visible, strategy_version, is_fixture, started_at, finished_at, llm_calls,
          tokens_in, tokens_out, latency_ms, spec, explain) VALUES ({_placeholders(22)})""",
        [_jsonb(r, [20, 21]) for r in fx.run_rows()],
        counts,
        "trading.agent_runs",
    )
    await _insert(
        conn,
        "INSERT INTO trading.trade_proposals VALUES (%s, %s, %s, %s, %s)",
        [_jsonb(r, [3]) for r in fx.proposal_rows()],
        counts,
        "trading.trade_proposals",
    )
    await _insert(
        conn,
        f"""
        INSERT INTO trading.approvals (proposal_id, run_id, card, status, decided_by, decided_role, decided_at,
          decision_comment, approved_notional_try, created_at, expires_at) VALUES ({_placeholders(11)})""",
        [_jsonb(r, [2]) for r in fx.approval_rows()],
        counts,
        "trading.approvals",
    )
    await _insert(
        conn,
        f"""
        INSERT INTO trading.approval_decisions (proposal_id, uid, name, role, decision, approved_notional_try, comment,
          decided_at) VALUES ({_placeholders(8)})""",
        fx.decision_rows(),
        counts,
        "trading.approval_decisions",
    )


async def _load_execution(conn: AsyncConnection[Any], fx: DemoFixtures, counts: dict[str, int]) -> None:
    await _insert(
        conn,
        f"""
        INSERT INTO trading.orders (id, client_order_id, proposal_id, run_id, ticker, company_name, side, order_type,
          tif, qty, limit_price, status, broker, cancel_reason, is_fixture, created_at) VALUES ({_placeholders(16)})""",
        fx.order_rows(),
        counts,
        "trading.orders",
    )
    await _insert(
        conn, f"INSERT INTO trading.fills VALUES ({_placeholders(9)})", fx.fill_rows(), counts, "trading.fills"
    )
    await _insert(
        conn,
        f"""
        INSERT INTO trading.order_tickets (ticket_no, order_id, proposal_id, run_id, doc, entry_status, created_at,
          valid_until) VALUES ({_placeholders(8)})""",
        [_jsonb(r, [4]) for r in fx.ticket_rows()],
        counts,
        "trading.order_tickets",
    )
    await _insert(
        conn,
        f"""
        INSERT INTO trading.positions (book, ticker, company_name, qty, avg_cost, last_price, opened_at,
          planned_exit_date, source_proposal, run_id, event_type, strategy_version, realized_pnl)
        VALUES ({_placeholders(13)})""",
        fx.position_rows(),
        counts,
        "trading.positions",
    )
    await _insert(
        conn, f"INSERT INTO trading.pnl_daily VALUES ({_placeholders(9)})", fx.pnl_rows(), counts, "trading.pnl_daily"
    )


async def _load_governance(conn: AsyncConnection[Any], fx: DemoFixtures, counts: dict[str, int]) -> None:
    await _insert(
        conn,
        f"INSERT INTO trading.limit_versions VALUES ({_placeholders(7)})",
        [_jsonb(r, [5, 6]) for r in fx.limit_version_rows()],
        counts,
        "trading.limit_versions",
    )
    await _insert(conn, "INSERT INTO trading.limits VALUES (%s, %s, %s, %s)", fx.limit_rows(), counts, "trading.limits")
    await _insert(
        conn,
        f"""
        INSERT INTO trading.risk_state (kill_switch, kill_reason, kill_at, kill_by, halted_today, daily_pnl_pct,
          drawdown_pct, reset_started) VALUES ({_placeholders(8)})""",
        [_jsonb(fx.risk_row(), [7])],
        counts,
        "trading.risk_state",
    )
    await _insert(
        conn,
        "INSERT INTO trading.quota_usage VALUES (%s, %s, %s, %s, %s)",
        fx.quota_rows(),
        counts,
        "trading.quota_usage",
    )
    await _insert(
        conn,
        "INSERT INTO trading.live_arm (config_live, env_enabled, ui_key, armed, expires_at) "
        "VALUES (%s, %s, %s, %s, %s)",
        [fx.live_arm_row()],
        counts,
        "trading.live_arm",
    )


def audit_rows(fx: DemoFixtures) -> list[Row]:
    return [
        (
            e["seq"],
            e["chain_pos"],
            ts(e["occurred_at"]),
            e["actor"],
            e["action"],
            e["entity_type"],
            e["entity_id"],
            e["run_id"],
            e["strategy_version"],
            Jsonb(e["payload"]),
            e["prev_hash"],
            e["hash"],
        )
        for e in fx.audit
    ]


async def reseed(
    conn: AsyncConnection[Any], fx: DemoFixtures | None = None, *, started_at: datetime | None = None
) -> SeedResult:
    """Replace all demo data with the fixture day. `conn` must be the owner connection (not autocommit)."""
    fx = fx or DemoFixtures()
    started = started_at or datetime.now(UTC)
    counts: dict[str, int] = {}
    async with conn.transaction():
        # Fail (instead of hanging) when another session still holds a lock on a seeded table.
        await conn.execute("SET LOCAL lock_timeout = '15s'")
        await conn.execute("ALTER TABLE audit.audit_log DISABLE TRIGGER USER")
        await conn.execute(f"TRUNCATE {', '.join(SEEDED_TABLES)} RESTART IDENTITY CASCADE")
        await conn.execute("ALTER SEQUENCE trading.proposal_note_seq RESTART WITH 1")
        await _load_reference(conn, fx, counts)
        await _load_runs(conn, fx, counts)
        await _load_execution(conn, fx, counts)
        await _load_governance(conn, fx, counts)
        await _insert(conn, AUDIT_INSERT_SQL, audit_rows(fx), counts, "audit.audit_log")
        await conn.execute("ALTER TABLE audit.audit_log ENABLE TRIGGER USER")
        await conn.execute("INSERT INTO ops.demo_state (id, started_at, tamper_on) VALUES (1, %s, false)", (started,))
    return SeedResult(started_at=started, counts=counts)
