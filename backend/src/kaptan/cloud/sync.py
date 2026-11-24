"""PC -> Worker: the tickers, the preferences and the pairing code (outbound HTTPS only, bearer secret).

The payload holds TICKERS and settings, never an amount, a share count or any money. The secret and the URL never reach
a log line or an error: failures are reduced to a class name or `http_<status>`.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any, Final

import httpx

from kaptan.alerts.prefs import load_prefs
from kaptan.digest.store import HELD_SQL, WATCH_SQL
from kaptan.domain.schemas._base import iso_ms
from kaptan.reference._sql import fetch_all
from kaptan.settings import Settings, cloud_watcher_on
from kaptan.telegram import store

log = logging.getLogger("kaptan.cloud")

STATUS_KEY: Final = "kaptan:cloud:status"
TIMEOUT_S: Final = 20.0
MAX_TICKERS: Final = 400
TICKER_RE: Final = re.compile(r"^[A-Z0-9]{3,6}$")
LEVELS: Final = frozenset({"less", "normal", "more"})
KAP_STATES: Final = frozenset({"ok", "blocked", "error", "unknown"})


def base_url(settings: Settings) -> str:
    return (settings.cloud_watcher_url or "").strip().rstrip("/")


def headers(settings: Settings) -> dict[str, str]:
    secret = settings.cloud_sync_secret.get_secret_value() if settings.cloud_sync_secret else ""
    return {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=False, trust_env=False)


def _tickers(rows: list[dict[str, Any]]) -> list[str]:
    return sorted({str(r["ticker"]) for r in rows if TICKER_RE.fullmatch(str(r["ticker"]))})[:MAX_TICKERS]


async def build_payload(conn: Any, now: datetime, *, unlink: bool = False) -> dict[str, Any]:
    """What the Worker needs to know. Pure reads."""
    state = await store.get_state(conn)
    prefs = await load_prefs(conn)
    held = _tickers(await fetch_all(conn, HELD_SQL))
    watched = _tickers(await fetch_all(conn, WATCH_SQL))
    expires = state.get("pair_expires_at")
    code_hash = state.get("pair_code_hash")
    pairing = bool(code_hash) and expires is not None and now < expires and state.get("chat_id") is None
    payload: dict[str, Any] = {
        "held": held,
        "watched": watched,
        "muted": sorted({t for t in prefs["muted"] if TICKER_RE.fullmatch(t)}),
        "quiet": {k: prefs["quiet"][k] for k in ("on", "start", "end")},
        "level": state["level"],
        "daily_cap": int(state["daily_cap"]),
        "pair": {"hash": code_hash, "expires_at": int(expires.timestamp() * 1000)} if pairing and expires else None,
        "unlink": unlink,
    }
    if state.get("chat_id") is not None and not pairing and not unlink:
        payload["chat_id"] = int(state["chat_id"])  # lets a chat paired before the cloud existed carry over
    return payload


def _ms(value: Any) -> datetime | None:
    if isinstance(value, int | float) and not isinstance(value, bool) and value > 0:
        return datetime.fromtimestamp(value / 1000, tz=UTC)
    return None


async def apply_reply(conn: Any, reply: dict[str, Any], now: datetime) -> None:
    """What the Worker says about itself becomes the PC's view: the paired chat, the level, the cap, /sessiz."""
    state = await store.get_state(conn)
    changes: dict[str, Any] = {}
    chat = reply.get("chat_id")
    if isinstance(chat, int) and not isinstance(chat, bool) and chat != state.get("chat_id"):
        changes |= {"chat_id": chat, "paired_at": now, "pair_code_hash": None, "pair_expires_at": None}
    if reply.get("level") in LEVELS and reply["level"] != state["level"]:
        changes["level"] = reply["level"]
    cap = reply.get("daily_cap")
    if isinstance(cap, int) and 1 <= cap <= 50 and cap != int(state["daily_cap"]):
        changes["daily_cap"] = cap
    silent = _ms(reply.get("silent_until"))
    silent = silent if silent is not None and silent > now else None
    if silent != state.get("silent_until"):
        changes["silent_until"] = silent
    if changes:
        await store.update(conn, now, **changes)
    await conn.commit()


async def _record(redis: Any, fields: dict[str, str]) -> None:
    try:
        await redis.hset(STATUS_KEY, mapping=fields)
    except Exception as exc:  # the status is a convenience: a Redis hiccup must not stop the sync
        log.warning("cloud status not recorded (%s)", type(exc).__name__)


def _reason(exc: Exception) -> str:
    return type(exc).__name__


async def sync_once(
    settings: Settings,
    pool: Any,
    redis: Any,
    now: datetime,
    *,
    unlink: bool = False,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """One POST /sync. Returns {"ok": True, ...reply} or {"ok": False, "reason": ...}; never raises."""
    if not cloud_watcher_on(settings):
        return {"ok": False, "reason": "off"}
    owned = client is None
    http = client or make_client()
    try:
        async with pool.connection() as conn:
            payload = await build_payload(conn, now, unlink=unlink)
            await conn.rollback()
        res = await http.post(f"{base_url(settings)}/sync", content=json.dumps(payload), headers=headers(settings))
        if res.status_code != 200:
            raise RuntimeError(f"http_{res.status_code}")
        reply = res.json()
        if not isinstance(reply, dict) or reply.get("ok") is not True:
            raise RuntimeError("bad_reply")
        async with pool.connection() as conn:
            await apply_reply(conn, reply, now)
        fields = {"synced_at": iso_ms(now), "error": ""}
        kap = reply.get("kap_status")
        fields["kap_status"] = kap if kap in KAP_STATES else "unknown"
        last = _ms(reply.get("last_message_at"))
        if last is not None:
            fields["message_at"] = iso_ms(last)
        await _record(redis, fields)
        return {"ok": True, **reply}
    except Exception as exc:
        reason = _reason(exc)
        log.warning("cloud sync failed (%s)", reason)
        await _record(redis, {"error": reason})
        return {"ok": False, "reason": reason}
    finally:
        if owned:
            await http.aclose()


async def read_status(redis: Any, settings: Settings) -> dict[str, Any]:
    """What Ayarlar shows: is the cloud on, when the last sync was, the last cloud message, can the Worker reach KAP."""
    out: dict[str, Any] = {"cloud_on": cloud_watcher_on(settings), "cloud_synced_at": None, "cloud_message_at": None,
                           "cloud_kap": None, "cloud_error": False}  # fmt: skip
    if not out["cloud_on"]:
        return out
    try:
        raw = await redis.hgetall(STATUS_KEY)
    except Exception:
        return out
    out["cloud_synced_at"] = raw.get("synced_at") or None
    out["cloud_message_at"] = raw.get("message_at") or None
    out["cloud_kap"] = raw.get("kap_status") or "unknown"
    out["cloud_error"] = bool(raw.get("error"))
    return out
