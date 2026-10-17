"""Admin — owner: wave-2 package C.

    GET /admin/users -> TeamMember[]   (users.view: admin, auditor)

The team from auth.users in TEAM order (uye-1, uye-2, uye-3, uye-4, denetci): {uid, name, role, duty_tr}.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from kaptan.api.deps import Actor, require
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import TeamMemberOut

router = APIRouter(tags=["admin"])


@router.get("/admin/users", response_model=list[TeamMemberOut])
async def users(actor: Annotated[Actor, Depends(require("users.view"))], conn: Conn) -> Any:
    raise not_implemented("GET /admin/users")
