"""The second signature, waived (API.md §3.2, 09 §5).

One person runs KAPtan, so nobody else can sign a two-step flow. Every second signature calls
`second_signature()` inside the decision's transaction, which writes the waiver to the audit chain as
`auth.single_user_waiver` {waiver: "single_user_waiver", flow, entity_type, entity_id, first_uid}: the trail says
plainly that no second person looked at it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.audit.writer import AuditDraft, append, user_actor

WAIVER_ACTION: Final = "auth.single_user_waiver"


async def second_signature(
    conn: AsyncConnection[Any],
    *,
    first_uid: str,
    uid: str,
    flow: str,
    entity_type: str,
    entity_id: str,
    now: datetime,
) -> None:
    """Record that the second signature of `flow` was waived."""
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
