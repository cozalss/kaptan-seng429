"""The two-person rule (API.md §3.2, 09 §5) and its single-user waiver (KAPTAN_SINGLE_USER).

Every second signature calls `second_signature()` inside the decision's transaction:
- a different person signs → nothing to do;
- the same person and the mode is off → 403 `same_person` with the flow's own text;
- the same person in single-user mode → allowed, and the waiver is written to the audit chain as
  `auth.single_user_waiver` {waiver: "single_user_waiver", flow, entity_type, entity_id, first_uid}, so the
  trail says plainly that one person signed both steps.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.settings import get_settings

WAIVER_ACTION: Final = "auth.single_user_waiver"


def single_user_enabled(single_user: bool | None = None) -> bool:
    return get_settings().kaptan_single_user if single_user is None else single_user


async def second_signature(
    conn: AsyncConnection[Any],
    *,
    first_uid: str,
    uid: str,
    flow: str,
    refusal: str,
    entity_type: str,
    entity_id: str,
    now: datetime,
    single_user: bool | None = None,
) -> bool:
    """Enforce or waive the two-person rule; True when a waiver was audited."""
    if first_uid != uid:
        return False
    if not single_user_enabled(single_user):
        raise ApiError(403, "same_person", refusal)
    await append(
        conn,
        [
            AuditDraft(
                actor=user_actor(uid),
                action=WAIVER_ACTION,
                entity_type=entity_type,
                entity_id=entity_id,
                payload={
                    "waiver": "single_user_waiver",
                    "flow": flow,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "first_uid": first_uid,
                },
                occurred_at=now,
            )
        ],
        now=now,
    )
    return True
