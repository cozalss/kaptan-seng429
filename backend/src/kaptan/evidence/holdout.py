"""The event definition evidence is built on, and the holdout seal (07 P7, 06 §12.1, 12 §1).

One definition for every reader (the study, `core.events`, the holdout run), so they never disagree:

- typed like the live graph: the KAP subject map (`subject_route`), or the Classifier's stored answer;
- a "Düzeltme" or a cancellation is not an event (06 §3); "Güncelleme: Evet" is, every executed buyback says it;
- E1 is an *executed* buyback (06 §3.1): the deterministic parser found its transactions table;
- E2 is a *net purchase* (06 §3.2): the parser read a table with bought and no sold nominal. MKK-forwarded notices
  keep the trade in an attachment and old free-text forms have no table: direction unknown, not evidence.

The trigger thresholds of 06 §3 (E1 ratio, E2 role and value, E3 materiality and status, E4 SUE and tone) are not
applied here: most need the Reader's answer, which history does not have. The evidence is the type's average.

Sealed: 2025-01-01 → 2026-10-31 (Istanbul) stays out of live evidence and out of `core.event_returns` until the one
run (`kaptan.evalreports.holdout`) has finished; a decision older than that run still does not see it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Final

from kaptan.prices.calendar import IST

HOLDOUT_START: Final = datetime(2025, 1, 1, tzinfo=IST)
HOLDOUT_END: Final = datetime(2026, 11, 1, tzinfo=IST)  # exclusive

E_CODES: Final = ["E1", "E2", "E3", "E4"]

#: `d` = core.disclosures. Parameters: none. Whether a disclosure can be an event at all, whatever its type.
EVENT_ROW_SQL: Final = """d.origin = 'kap' AND d.primary_ticker IS NOT NULL AND NOT d.is_noise
   AND d.reason NOT IN ('CORR', 'CANC')
   AND (d.subject_route <> 'E1' OR d.parsed ->> 'status' = 'ok')
   AND (d.subject_route <> 'E2' OR d.parsed ->> 'direction' = 'buy')"""

_IN_WINDOW: Final = "{col} >= timestamptz '2025-01-01 00:00:00+03' AND {col} < timestamptz '2026-11-01 00:00:00+03'"
IN_HOLDOUT_SQL: Final = _IN_WINDOW.format(col="d.published_at")


def unsealed_sql(col: str, as_of_param: str) -> str:
    """SQL: `col` is outside the holdout window, or the main run finished before the bound `as_of`."""
    window = _IN_WINDOW.format(col=col)
    return (
        f"(NOT ({window}) OR EXISTS (SELECT 1 FROM core.holdout_runs h "  # noqa: S608 - module constants only
        f"WHERE h.kind = 'main' AND h.finished_at < %({as_of_param})s))"
    )
