"""Worker -> PC: what the person pressed on the phone while this computer was off.

`GET /actions` lists the queue, each one is applied to KAPtan's own stores (the same ones the buttons used when the PC
owned the bot), then `POST /actions/ack` lets the Worker forget it. An action that cannot be applied because its
disclosure is gone is acknowledged too (there is nothing left to do); one that fails for another reason stays queued
and is tried again at the next sync. Nothing here touches money.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Final

import httpx

from kaptan.api.errors import ApiError
from kaptan.cloud.sync import TICKER_RE, base_url, headers, make_client
from kaptan.settings import Settings, cloud_watcher_on
from kaptan.telegram.handlers import apply_mute, apply_triage

log = logging.getLogger("kaptan.cloud")

MAX_ACTIONS: Final = 200
READ_STATE: Final = {"read": "tamam", "later": "sonra"}


async def apply_one(conn: Any, action: dict[str, Any], now: datetime) -> bool:
    """True when the action is dealt with (done, or nothing left to do); an unknown kind counts as dealt with."""
    kind = action.get("action")
    try:
        if kind in READ_STATE and isinstance(action.get("idx"), int):
            await apply_triage(conn, int(action["idx"]), READ_STATE[str(kind)], now)
        elif kind == "mute" and isinstance(action.get("ticker"), str) and TICKER_RE.fullmatch(action["ticker"]):
            await apply_mute(conn, action["ticker"], now)
        await conn.commit()
    except ApiError:
        await conn.rollback()  # the disclosure is gone: nothing to mark
    return True


async def pull_actions(
    settings: Settings, pool: Any, now: datetime, *, client: httpx.AsyncClient | None = None
) -> dict[str, int]:
    """Apply and acknowledge the Worker's queue; returns {"applied": n, "left": n}. Never raises."""
    if not cloud_watcher_on(settings):
        return {"applied": 0, "left": 0}
    owned = client is None
    http = client or make_client()
    done: list[int] = []
    left = 0
    try:
        res = await http.get(f"{base_url(settings)}/actions", headers=headers(settings))
        if res.status_code != 200:
            raise RuntimeError(f"http_{res.status_code}")
        queue = res.json().get("actions") if isinstance(res.json(), dict) else None
        for action in (queue or [])[:MAX_ACTIONS]:
            if not isinstance(action, dict) or not isinstance(action.get("id"), int):
                continue
            try:
                async with pool.connection() as conn:
                    ok = await apply_one(conn, action, now)
            except Exception as exc:  # stays queued: the next sync tries again
                log.warning("cloud action not applied (%s)", type(exc).__name__)
                left += 1
                continue
            if ok:
                done.append(int(action["id"]))
        if done:
            ack = await http.post(f"{base_url(settings)}/actions/ack", json={"ids": done}, headers=headers(settings))
            if ack.status_code != 200:
                raise RuntimeError(f"http_{ack.status_code}")
    except Exception as exc:
        log.warning("cloud actions not pulled (%s)", type(exc).__name__)
    finally:
        if owned:
            await http.aclose()
    return {"applied": len(done), "left": left}
