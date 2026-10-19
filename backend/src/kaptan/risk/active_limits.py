"""The active limit version → `GateLimits` (06 §10/§13, FR-33: limits change only with four eyes).

Every run and every at-send check reads the version that is `active` *now*, so an approved change
(risk/limits.py `decide`) takes effect on the next run. Keys are `GateLimits` field names; a key the
gate does not know (e.g. `leak_ret5d_threshold`, read by the rule engine) is ignored, a field without
a row keeps its canonical default. Documented extra keys that the panel's v1 set does not carry:

- `risk_tolerance` (default 1.05): R07's lot-rounding band on the per-trade risk budget
  (risk budget × tolerance / (price × stop) is the risk cap in lots).
- `max_daily_entries` (3), `max_price_age_s` (1200), `max_kap_delay_s` (300), `max_restriction_age_h` (24),
  `near_limit_up_pct` (0.01), `amount_tolerance` (0.005), `min_evidence_n` (5).
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.risk.gate import GateLimits

ACTIVE_SQL: Final = """
SELECT v.version, l.key, l.value
  FROM trading.limit_versions v
  LEFT JOIN trading.limits l ON l.version = v.version
 WHERE v.status = 'active'
 ORDER BY l.ord
"""

_INT_FIELDS: Final = frozenset(f.name for f in fields(GateLimits) if f.type in ("int", int))
_DEC_FIELDS: Final = frozenset(f.name for f in fields(GateLimits)) - _INT_FIELDS


@dataclass(frozen=True, slots=True)
class ActiveLimits:
    limits: GateLimits
    version: int | None  # None: no active version (defaults)


def to_gate_limits(values: dict[str, float], base: GateLimits | None = None) -> GateLimits:
    """Known keys override the defaults (counts as int, the rest as Decimal via str: 0.1 stays 0.1)."""
    changes: dict[str, Any] = {}
    for key, value in values.items():
        if key in _INT_FIELDS:
            changes[key] = int(value)
        elif key in _DEC_FIELDS:
            changes[key] = Decimal(str(value))
    return replace(base or GateLimits(), **changes)


async def active_limits(conn: AsyncConnection[Any]) -> ActiveLimits:
    """The active version's limits; the canonical defaults when no version is active."""
    async with conn.cursor() as cur:
        await cur.execute(ACTIVE_SQL)
        rows = await cur.fetchall()
    if not rows:
        return ActiveLimits(GateLimits(), None)
    values = {str(r["key"]): float(r["value"]) for r in rows if r["key"] is not None}
    return ActiveLimits(to_gate_limits(values), int(rows[0]["version"]))
