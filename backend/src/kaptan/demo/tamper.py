"""The tamper test (Ayarlar → Kurcalama testi): change one ledger record behind the chain's back.

Port of the mock's tamperedChain(): with the test on, the payload of chain_pos 3907 carries
`{"kurcalandi": true}` while its stored hash stays, so `/audit/verify` answers
`{"ok": false, "first_bad_pos": 3907, "kind": "hash_mismatch"}`. Off removes the key again and the
chain verifies. No audit entry — that is the point of the test.

Needs the OWNER connection: the app role has no UPDATE on audit.audit_log, and the immutability
trigger is disabled only inside this one transaction.
"""

from __future__ import annotations

from typing import Any, Final

from psycopg import AsyncConnection

TAMPER_KEY: Final = "kurcalandi"

TAMPER_ON_SQL: Final = (
    "UPDATE audit.audit_log SET payload = payload || jsonb_build_object(%(key)s::text, true) WHERE chain_pos = %(pos)s"
)
TAMPER_OFF_SQL: Final = "UPDATE audit.audit_log SET payload = payload - %(key)s::text WHERE chain_pos = %(pos)s"


async def set_tamper(owner: AsyncConnection[Any], on: bool, pos: int) -> bool:
    """Flip the tamper test; returns the new `tamper_on`. `owner` must not be in autocommit mode."""
    async with owner.transaction():
        await owner.execute("SET LOCAL lock_timeout = '10s'")
        await owner.execute("ALTER TABLE audit.audit_log DISABLE TRIGGER trg_audit_immutable")
        await owner.execute(TAMPER_ON_SQL if on else TAMPER_OFF_SQL, {"key": TAMPER_KEY, "pos": pos})
        await owner.execute("ALTER TABLE audit.audit_log ENABLE TRIGGER trg_audit_immutable")
        await owner.execute("UPDATE ops.demo_state SET tamper_on = %s, updated_at = now() WHERE id = 1", (on,))
    return on
