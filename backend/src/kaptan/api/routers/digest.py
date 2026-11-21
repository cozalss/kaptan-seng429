"""The day's important disclosures (agent INFO).

    GET /me/digest?day=YYYY-MM-DD -> Digest   the notable KAP disclosures of ALL companies of that Istanbul day, not
                                              only the 75 KAPtan follows. Information, not a suggestion.
        Default day: today; when the market is closed today (weekend, holiday) the last trading day, and `note`
        says "Borsa kapalı; son işlem gününün duyuruları.". An explicit day is honoured as given (a closed day
        carries `note` "Bu gün borsa kapalıydı."). `prev_day` / `next_day` are the neighbouring trading days
        (`next_day` is null when it is still in the future). A malformed `day` answers 422.
        Items: held companies first, then watched, then the rest; inside each by kind, then newest. Each has one
        plain line (numbers only when parsed reliably), the company's KAP title, the time, the KAP link and, for a
        company outside the universe, `outside_note` (KAPtan gives no suggestion for it, or analyses it because
        you watch it). Noise, corrections and updates, and anything that cannot be classified with confidence
        are not in the list. At most 400 items (`truncated`).

Nothing here calls KAP or a model: it reads what is stored (see `kaptan.digest.kinds` for the kinds).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Query

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.digest.store import digest
from kaptan.domain.schemas.digest import Digest

router = APIRouter(tags=["digest"])


@router.get("/me/digest", response_model=Digest)
async def my_digest(
    user: CurrentUser,
    conn: Conn,
    clock: ClockDep,
    day: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
) -> Any:
    try:
        on = None if day is None else date.fromisoformat(day)
    except ValueError as exc:
        raise ApiError(422, "validation", "Tarih bekleniyor (YYYY-MM-DD)") from exc
    return await digest(conn, clock.now(), on)
