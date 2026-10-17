"""The audit ledger — owner: wave-2 package C.

    GET  /audit?scope=today|all&q=&limit=  -> AuditPage          (all roles; newest first)
    POST /audit/verify                     -> ChainVerifyResult  (audit.verify: risk_officer, admin, auditor)

List (mock enterprise.ts auditList): scope today = Istanbul day of the demo clock
(clock.istanbul_date); q = free text over actor, action, entity, payload (port audit-words.ts
auditMatches()); limit 1..500 (default 200); total = rows after filters; length = whole chain;
tamper_on from ops.demo_state. Verify: kaptan.audit.verify.verify_db(conn, iso_ms(clock.now())) —
read-only, no audit entry; the tampered demo ledger answers
{"ok": false, "first_bad_pos": 3907, "kind": "hash_mismatch", ...}.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query

from kaptan.api.deps import Actor, CurrentUser, require
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import AuditPage, ChainVerifyResult

router = APIRouter(tags=["audit"])


@router.get("/audit", response_model=AuditPage)
async def audit_list(
    user: CurrentUser,
    conn: Conn,
    scope: Literal["today", "all"] = "today",
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(gt=0, le=500)] = 200,
) -> Any:
    raise not_implemented("GET /audit")


@router.post("/audit/verify", response_model=ChainVerifyResult)
async def verify(actor: Annotated[Actor, Depends(require("audit.verify"))], conn: Conn) -> Any:
    raise not_implemented("POST /audit/verify")
