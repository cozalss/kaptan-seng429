"""Portfolio — owner: wave-2 package B.

    GET /portfolio/positions          -> Position[]  (all roles; newest opened first)
    GET /portfolio/pnl?from=&to=      -> PnlPoint[]  (all roles; inclusive YYYY-MM-DD bounds)

Positions: trading.positions (paper book from SimBIST fills, personal book from tickets marked
"entered"); holding_days and unrealized_pnl computed at read time (demo clock, last_price);
managed_by_exit_rule from trading.risk_state. P&L: trading.pnl_daily in fixture order (`ord`).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.api.deps import CurrentUser
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import PnlPoint, Position

router = APIRouter(tags=["portfolio"])

DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


@router.get("/portfolio/positions", response_model=list[Position])
async def positions(user: CurrentUser, conn: Conn) -> Any:
    raise not_implemented("GET /portfolio/positions")


@router.get("/portfolio/pnl", response_model=list[PnlPoint])
async def pnl(
    user: CurrentUser,
    conn: Conn,
    from_: Annotated[str | None, Query(alias="from", pattern=DATE_PATTERN)] = None,
    to: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
) -> Any:
    raise not_implemented("GET /portfolio/pnl")
