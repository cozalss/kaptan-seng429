"""An in-memory stand-in for `kaptan.telegram.store` (and a fake connection), so the Telegram rules (caps, grouping,
quiet hours, morning message, buttons) are tested without a database. The SQL itself is covered by
tests/integration/test_telegram_db.py."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import pytest

from kaptan.telegram import dispatch, handlers, morning, source, store
from tests.unit.telegram_support import Sig


class FakeConn:
    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


class FakePool:
    def __init__(self) -> None:
        self.conn = FakeConn()

    def connection(self) -> Any:
        pool = self

        class _Ctx:
            async def __aenter__(self) -> FakeConn:
                return pool.conn

            async def __aexit__(self, *exc: object) -> None: ...

        return _Ctx()


@dataclass
class Mem:
    state: dict[str, Any] = field(
        default_factory=lambda: {
            "token": None, "bot_username": None, "chat_id": None, "pair_code_hash": None, "pair_expires_at": None,
            "paired_at": None, "update_offset": 0, "level": "normal", "daily_cap": 8, "silent_until": None,
            "morning_sent_on": None, "desk_cursor": None,
        }
    )  # fmt: skip
    queue: dict[int, dict[str, Any]] = field(default_factory=dict)
    sent: list[dict[str, Any]] = field(default_factory=list)
    signals: dict[int, Sig] = field(default_factory=dict)
    triage: dict[int, str] = field(default_factory=dict)
    muted: list[str] = field(default_factory=list)
    last_alive: datetime | None = None
    gap: dict[str, Any] | None = None

    # the store
    async def get_state(self, conn: Any) -> dict[str, Any]:
        return dict(self.state)

    async def update(self, conn: Any, now: datetime, **fields: Any) -> None:
        self.state.update(fields)

    async def known_indexes(self, conn: Any, indexes: Iterable[int]) -> set[int]:
        return {i for i in indexes if i in self.queue}

    async def enqueue(
        self, conn: Any, index: int, ticker: str | None, company: str, state: str, reason: str | None, now: datetime
    ) -> None:
        self.queue.setdefault(index, {"disclosure_index": index, "ticker": ticker, "company": company,
                                      "state": state, "reason": reason, "created_at": now})  # fmt: skip

    async def rows_in(self, conn: Any, state: str) -> list[dict[str, Any]]:
        rows = [r for r in self.queue.values() if r["state"] == state]
        return sorted(rows, key=lambda r: (r["created_at"], r["disclosure_index"]))

    async def move(self, conn: Any, indexes: Iterable[int], state: str, reason: str | None, now: datetime) -> None:
        for i in indexes:
            self.queue[i] = {**self.queue[i], "state": state, "reason": reason}

    async def record_sent(self, conn: Any, now: datetime, kind: str, tickers: Iterable[str], n: int) -> None:
        self.sent.append({"sent_at": now, "kind": kind, "tickers": list(tickers), "n": n})

    async def instant_count(self, conn: Any, start: datetime, end: datetime) -> int:
        return sum(1 for s in self.sent if s["kind"] == "instant" and start <= s["sent_at"] < end)

    async def last_instant(self, conn: Any, ticker: str) -> datetime | None:
        times = [s["sent_at"] for s in self.sent if s["kind"] == "instant" and ticker in s["tickers"]]
        return max(times) if times else None

    async def last_sent(self, conn: Any, kind: str) -> datetime | None:
        times = [s["sent_at"] for s in self.sent if s["kind"] == kind]
        return max(times) if times else None

    async def counts_between(self, conn: Any, start: datetime, end: datetime) -> dict[str, int]:
        out: dict[str, int] = {}
        for s in self.sent:
            if start <= s["sent_at"] < end:
                out[s["kind"]] = out.get(s["kind"], 0) + 1
        return out

    async def mark_gap_told(self, conn: Any) -> None:
        if self.gap:
            self.gap["told"] = True

    # the signal source, the reading marks, the preferences
    async def signals_between(
        self, conn: Any, since: datetime, until: datetime, *, only_important: bool = True, only_mine: bool = False
    ) -> list[Sig]:
        out = [s for s in self.signals.values() if since <= s.published_at <= until]
        if only_important:
            out = [s for s in out if s.important]
        if only_mine:
            out = [s for s in out if s.mine]
        return sorted(out, key=lambda s: s.published_at)

    async def describe(self, conn: Any, index: int) -> Sig | None:
        return self.signals.get(index)

    async def set_state(self, conn: Any, index: int, state: str, *, now: datetime) -> None:
        self.triage[index] = state

    async def load_prefs(self, conn: Any) -> dict[str, Any]:
        return {"kinds": {}, "quiet": {"on": False, "start": "22:00", "end": "08:00"}, "muted": list(self.muted)}

    async def save_prefs(self, conn: Any, prefs: dict[str, Any], now: datetime) -> None:
        self.muted = list(prefs["muted"])

    async def append(self, conn: Any, drafts: Any) -> None: ...

    def prefs(self) -> dict[str, Any]:
        return {"kinds": {}, "quiet": {"on": False, "start": "22:00", "end": "08:00"}, "muted": list(self.muted)}


def install(monkeypatch: pytest.MonkeyPatch) -> Mem:
    mem = Mem()
    for name in (
        "get_state", "update", "known_indexes", "enqueue", "rows_in", "move", "record_sent", "instant_count",
        "last_instant", "last_sent", "counts_between", "mark_gap_told",
    ):  # fmt: skip
        monkeypatch.setattr(store, name, getattr(mem, name))
    monkeypatch.setattr(source, "signals_between", mem.signals_between)
    monkeypatch.setattr(source, "describe", mem.describe)
    monkeypatch.setattr(handlers, "set_state", mem.set_state)
    monkeypatch.setattr(handlers, "load_prefs", mem.load_prefs)
    monkeypatch.setattr(handlers, "save_prefs", mem.save_prefs)
    monkeypatch.setattr(handlers, "append", mem.append)
    assert dispatch.source is source and morning.source is source
    return mem
