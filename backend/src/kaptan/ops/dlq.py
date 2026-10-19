"""Dead letters of the agent feed: list them, re-drive them.

    uv run python -m kaptan.ops.dlq list
    uv run python -m kaptan.ops.dlq redrive --all            # or --index 1234567 [--index ...]
    uv run python -m kaptan.ops.dlq redrive --all --dry-run

An entry lands on `kaptan:kap.dlq` when its run failed MAX_ATTEMPTS (3) times (`agents/feed.py`); its
`ops.agent_feed` row is `failed`. Re-driving resets that row (`awaiting_text`, attempts 0, reason
`redrive`), appends the index to the agent stream again (stage `redrive`) and deletes the dead letter;
the worker then treats it like a new entry (scope, text and caps are checked again). Exit codes: 0 done,
1 nothing matched, 2 configuration error.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Final

import redis.asyncio as aioredis

from kaptan.agents.feed import DLQ_STREAM
from kaptan.api.loop import run
from kaptan.db import connect
from kaptan.ingest.publish import AGENT_STREAM, AGENT_STREAM_MAXLEN
from kaptan.settings import ConfigError, Settings, get_settings

RESET_SQL: Final = """
UPDATE ops.agent_feed SET status = 'awaiting_text', attempts = 0, reason = 'redrive', updated_at = %s
 WHERE disclosure_index = %s AND status = 'failed'
"""


@dataclass(frozen=True, slots=True)
class DeadLetter:
    entry_id: str
    index: int
    reason: str
    attempts: int
    failed_at: str


def _text(v: Any) -> str:
    return v.decode() if isinstance(v, bytes) else str(v)


async def list_dead(redis: Any) -> list[DeadLetter]:
    out: list[DeadLetter] = []
    for raw_id, raw in await redis.xrange(DLQ_STREAM):
        fields = {_text(k): _text(v) for k, v in (raw or {}).items()}
        try:
            index = int(fields.get("disclosure_index", ""))
        except ValueError:
            continue
        out.append(
            DeadLetter(
                entry_id=_text(raw_id),
                index=index,
                reason=fields.get("reason", ""),
                attempts=int(fields.get("attempts", "0") or 0),
                failed_at=fields.get("failed_at", ""),
            )
        )
    return out


async def redrive(conn: Any, redis: Any, indices: set[int] | None, *, dry_run: bool = False) -> list[DeadLetter]:
    """Re-drive the dead letters whose index is in `indices` (None = all); returns those re-driven."""
    chosen = [d for d in await list_dead(redis) if indices is None or d.index in indices]
    if dry_run:
        return chosen
    now = datetime.now(UTC)
    for dead in chosen:
        async with conn.transaction():
            await conn.execute(RESET_SQL, (now, dead.index))
        fields = {"disclosure_index": str(dead.index), "stage": "redrive"}
        await redis.xadd(AGENT_STREAM, fields, maxlen=AGENT_STREAM_MAXLEN, approximate=True)
        await redis.xdel(DLQ_STREAM, dead.entry_id)
    return chosen


async def main_async(settings: Settings, args: argparse.Namespace) -> int:
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    try:
        if args.cmd == "list":
            dead = await list_dead(redis)
            for d in dead:
                print(f"{d.entry_id}  index={d.index}  attempts={d.attempts}  reason={d.reason}  at={d.failed_at}")
            print(f"{len(dead)} dead letter(s)")
            return 0
        conn = await connect(settings.database_url.get_secret_value())
        try:
            wanted = None if args.all else set(args.index or [])
            done = await redrive(conn, redis, wanted, dry_run=args.dry_run)
        finally:
            await conn.close()
        verb = "would re-drive" if args.dry_run else "re-driven"
        print(f"{len(done)} {verb}: {', '.join(str(d.index) for d in done) or '-'}")
        return 0 if done else 1
    finally:
        await redis.aclose()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m kaptan.ops.dlq", description="Agent feed dead letters")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="show the dead letters")
    rd = sub.add_parser("redrive", help="put dead letters back on the agent stream")
    group = rd.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true")
    group.add_argument("--index", type=int, action="append")
    rd.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        settings = get_settings()
    except ConfigError as exc:
        print(exc, file=sys.stderr)
        return 2
    return run(main_async(settings, args))


if __name__ == "__main__":
    sys.exit(main())
