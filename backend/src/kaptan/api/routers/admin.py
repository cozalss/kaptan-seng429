"""Admin — owner: wave-2 package C.

    GET /admin/users -> TeamMember[]   (users.view: admin, auditor)

The team from auth.users in TEAM order (uye-1, uye-2, uye-3, uye-4, denetci): {uid, name, role, duty_tr}.
"""

from __future__ import annotations

from typing import Annotated, Any, Final

from fastapi import APIRouter, Depends

from kaptan.api.deps import Actor, require
from kaptan.db import Conn
from kaptan.domain.schemas import TeamMemberOut

router = APIRouter(tags=["admin"])

USERS_SQL: Final = "SELECT uid, display_name AS name, role, duty_tr FROM auth.users WHERE is_active ORDER BY ord, uid"


@router.get("/admin/users", response_model=list[TeamMemberOut])
async def users(actor: Annotated[Actor, Depends(require("users.view"))], conn: Conn) -> Any:
    async with conn.cursor() as cur:
        await cur.execute(USERS_SQL)
        return [dict(r) for r in await cur.fetchall()]
