"""Portfolio — owner: wave-2 package B.

    GET /portfolio/positions          -> Position[]  (all roles; newest opened first)
    GET /portfolio/pnl?from=&to=      -> PnlPoint[]  (all roles; inclusive YYYY-MM-DD bounds)

Positions: trading.positions (paper book from SimBIST fills, personal book from tickets marked
"entered"); holding_days and unrealized_pnl computed at read time (demo clock, last_price);
managed_by_exit_rule from trading.risk_state. P&L: trading.pnl_daily in fixture order (`ord`).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.domain.schemas import PnlPoint, Position
from kaptan.portfolio.pnl import list_pnl
from kaptan.portfolio.positions import list_positions

router = APIRouter(tags=["portfolio"])

DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


@router.get("/portfolio/positions", response_model=list[Position])
async def positions(user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await list_positions(conn, clock.now())


def _day(value: str | None) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)") from exc


@router.get("/portfolio/pnl", response_model=list[PnlPoint])
async def pnl(
    user: CurrentUser,
    conn: Conn,
    from_: Annotated[str | None, Query(alias="from", pattern=DATE_PATTERN)] = None,
    to: Annotated[str | None, Query(pattern=DATE_PATTERN)] = None,
) -> Any:
    return await list_pnl(conn, _day(from_), _day(to))
