"""Versioned rule thresholds (`learn.rule_versions`), the way `trading.limit_versions` versions the limits.

    params = await active_rule_params(conn)        # RuleParams the next run decides with
    v = await record_change(conn, decision, now, apply=True)    # a new version + audit `learn.rule_changed`
    await revert_change(conn, v, now)              # "Geri al": a new version + audit `learn.rule_reverted`

A version stores only the thresholds that differ from the canonical `RuleParams`; its `rules_hash` is the canonical
hash when nothing differs and otherwise sha256(seed + the sorted overrides)[:16], so every proposal and audit row names
the exact thresholds it was decided with. Versions are never edited except their status; a change and its undo are
both new rows. Every write and its audit row are one transaction.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, fields, replace
from datetime import datetime
from typing import Any, Final

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from kaptan.audit.writer import AuditDraft, append
from kaptan.learn.tunables import BY_KEY
from kaptan.rules.params import DEFAULT_PARAMS, RULES_SEED, RuleParams, rules_hash_of

Conn = Any
ACTOR: Final = "agent:learn"
LOCK_SQL: Final = "LOCK TABLE learn.rule_versions IN SHARE ROW EXCLUSIVE MODE"
ACTIVE_SQL: Final = "SELECT version, params, rules_hash FROM learn.rule_versions WHERE status = 'active'"
NEXT_SQL: Final = "SELECT coalesce(max(version), 0) + 1 AS v FROM learn.rule_versions"
INSERT_SQL: Final = """
INSERT INTO learn.rule_versions (version, params, rules_hash, status, origin, rule, from_value, to_value, evidence,
  reason_tr, reverts, created_at, created_by)
VALUES (%(version)s, %(params)s, %(rules_hash)s, %(status)s, %(origin)s, %(rule)s, %(from_value)s, %(to_value)s,
  %(evidence)s, %(reason_tr)s, %(reverts)s, %(at)s, %(by)s)
"""
SUPERSEDE_SQL: Final = "UPDATE learn.rule_versions SET status = 'superseded' WHERE status = 'active'"
ROW_SQL: Final = "SELECT * FROM learn.rule_versions WHERE version = %s FOR UPDATE"
LATEST_OF_RULE_SQL: Final = """
SELECT version FROM learn.rule_versions WHERE rule = %s AND status IN ('active', 'superseded')
 ORDER BY version DESC LIMIT 1
"""
HISTORY_SQL: Final = "SELECT * FROM learn.rule_versions ORDER BY version DESC LIMIT %s"
#: Values the person took back ("Geri al"): the loop never applies the same step again by itself.
REVERTED_SQL: Final = """
SELECT r.rule, c.to_value FROM learn.rule_versions r JOIN learn.rule_versions c ON c.version = r.reverts
 WHERE r.origin = 'revert'
"""


class RevertError(Exception):
    """A change that cannot be undone (unknown, not applied, or a newer change of its rule exists)."""

    def __init__(self, code: str, detail_tr: str) -> None:
        super().__init__(code)
        self.code = code
        self.detail_tr = detail_tr


@dataclass(frozen=True, slots=True)
class Change:
    """One threshold step the weekly pass decided on (`kaptan.learn.tuning`)."""

    rule: str
    from_value: float
    to_value: float
    reason_tr: str
    evidence: dict[str, Any]


TUNABLE_FIELDS: Final = frozenset(f.name for f in fields(RuleParams)) & frozenset(BY_KEY)


def hash_of(overrides: dict[str, float]) -> str:
    if not overrides:
        return rules_hash_of()
    body = json.dumps(dict(sorted(overrides.items())), separators=(",", ":"))
    return rules_hash_of(f"{RULES_SEED}+{body}")


def params_from(overrides: dict[str, Any]) -> RuleParams:
    """The canonical params with `overrides` (tunable keys only; anything else is ignored)."""
    known: dict[str, Any] = {k: float(v) for k, v in overrides.items() if k in TUNABLE_FIELDS}
    if not known:
        return DEFAULT_PARAMS
    return replace(DEFAULT_PARAMS, **known, rules_hash=hash_of(known))


async def _one(conn: Conn, sql: str, params: Any = ()) -> dict[str, Any] | None:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        row: dict[str, Any] | None = await cur.fetchone()
        return row


async def active_overrides(conn: Conn) -> dict[str, float]:
    row = await _one(conn, ACTIVE_SQL)
    return {} if row is None else {k: float(v) for k, v in dict(row["params"]).items()}


async def active_rule_params(conn: Conn) -> RuleParams:
    """The thresholds the next decision uses (canonical when the loop never changed one)."""
    return params_from(await active_overrides(conn))


async def history(conn: Conn, limit: int = 100) -> list[dict[str, Any]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(HISTORY_SQL, (limit,))
        return list(await cur.fetchall())


async def reverted_steps(conn: Conn) -> set[tuple[str, float]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(REVERTED_SQL)
        return {(str(r["rule"]), float(r["to_value"])) for r in await cur.fetchall()}


async def _insert(conn: Conn, row: dict[str, Any]) -> None:
    async with conn.cursor() as cur:
        await cur.execute(INSERT_SQL, row)


def _draft(action: str, version: int, payload: dict[str, Any]) -> AuditDraft:
    return AuditDraft(actor=ACTOR, action=action, entity_type="rules", entity_id=str(version), payload=payload)


async def record_change(conn: Conn, change: Change, now: datetime, *, apply: bool) -> int:
    """A new version for `change`: active (apply) or only proposed. Audited in the same transaction."""
    async with conn.transaction():
        await conn.execute(LOCK_SQL)
        base = await active_overrides(conn)
        overrides = {**base, change.rule: change.to_value}
        if overrides[change.rule] == float(getattr(DEFAULT_PARAMS, change.rule)):
            overrides.pop(change.rule)
        version = int((await _one(conn, NEXT_SQL) or {"v": 1})["v"])
        if apply:
            await conn.execute(SUPERSEDE_SQL)
        row = {
            "version": version, "params": Jsonb(overrides), "rules_hash": hash_of(overrides),
            "status": "active" if apply else "proposed", "origin": "learn", "rule": change.rule,
            "from_value": change.from_value, "to_value": change.to_value, "evidence": Jsonb(change.evidence),
            "reason_tr": change.reason_tr, "reverts": None, "at": now, "by": ACTOR,
        }  # fmt: skip
        await _insert(conn, row)
        payload = {
            "rule": change.rule, "from": change.from_value, "to": change.to_value, "applied": apply,
            "rules_hash": row["rules_hash"], "gain_bps": change.evidence.get("gain_bps"),
            "ci_bps": [change.evidence.get("ci_low_bps"), change.evidence.get("ci_high_bps")],
            "n": change.evidence.get("n"),
        }  # fmt: skip
        await append(conn, [_draft("learn.rule_changed", version, payload)], now=now)
    return version


async def revert_change(conn: Conn, version: int, now: datetime, *, actor: str) -> int:
    """ "Geri al": the rule goes back to the value before `version`, as a new active version. Audited."""
    async with conn.transaction():
        await conn.execute(LOCK_SQL)
        row = await _one(conn, ROW_SQL, (version,))
        if row is None:
            raise RevertError("not_found", "Bu değişiklik bulunamadı.")
        latest = await _one(conn, LATEST_OF_RULE_SQL, (row["rule"],))
        if row["origin"] != "learn" or row["status"] not in ("active", "superseded") or latest is None:
            raise RevertError("not_revertable", "Bu değişiklik uygulanmadığı için geri alınamaz.")
        if int(latest["version"]) != version:
            raise RevertError("not_revertable", "Bu değişiklik artık geri alınamaz: aynı kural sonra yine değişti.")
        rule, back = str(row["rule"]), float(row["from_value"])
        overrides = {**(await active_overrides(conn)), rule: back}
        if back == float(getattr(DEFAULT_PARAMS, rule)):
            overrides.pop(rule)
        new = int((await _one(conn, NEXT_SQL) or {"v": 1})["v"])
        await conn.execute(SUPERSEDE_SQL)
        reason = f"Geri alındı: {BY_KEY[rule].label_tr} önceki değerine döndü."
        await _insert(
            conn,
            {
                "version": new, "params": Jsonb(overrides), "rules_hash": hash_of(overrides), "status": "active",
                "origin": "revert", "rule": rule, "from_value": float(row["to_value"]), "to_value": back,
                "evidence": Jsonb({}), "reason_tr": reason, "reverts": version, "at": now, "by": actor,
            },
        )  # fmt: skip
        payload = {"rule": rule, "reverts": version, "back_to": back, "rules_hash": hash_of(overrides)}
        await append(conn, [AuditDraft(actor, "learn.rule_reverted", "rules", str(new), payload)], now=now)
    return new
