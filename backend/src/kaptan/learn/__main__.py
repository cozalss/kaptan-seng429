"""One learning pass by hand (the scheduler's `learn_weekly` calls the same coroutine).

    uv run python -m kaptan.learn report            # look and write the report; never change a rule
    uv run python -m kaptan.learn apply             # adopt the steps that pass every guard (if the switch is on)
    uv run python -m kaptan.learn nightly           # matured returns + calibration (`learn_nightly`)
    uv run python -m kaptan.learn estimators        # the walk-forward comparison of every edge estimator

Writes with DATABASE_URL (app role; `--test` = TEST_DATABASE_URL) and commits at the end. Prints a JSON summary.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from kaptan.api.loop import run
from kaptan.db import connect
from kaptan.settings import get_settings


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.learn", description=__doc__.split("\n\n")[0])
    p.add_argument("what", choices=("report", "apply", "nightly", "estimators"))
    p.add_argument("--test", action="store_true", help="use TEST_DATABASE_URL")
    return p.parse_args(argv)


async def estimators_table(conn: Any, now: datetime) -> dict[str, Any]:
    from kaptan.learn.dataset import load_pool
    from kaptan.learn.estimators import ESTIMATORS, Obs, choose, pooled_ratio

    pool = await load_pool(conn, now)
    obs = [Obs(s.kind, s.ticker, s.published_at, s.car) for s in pool if s.source == "archive"]
    table = {name: [pooled_ratio(obs, f, ("E3", "E4"), name) for f in (0, 1)] for name in ESTIMATORS}
    return {"chosen_on_2022_2023": choose(obs), "pooled_error_ratio_F1_F2": table, "n": len(obs)}


async def _main(args: argparse.Namespace) -> dict[str, Any]:
    from kaptan.learn import calibration, weekly

    settings = get_settings()
    url = settings.test_database_url if args.test else settings.database_url
    if url is None:
        raise SystemExit("TEST_DATABASE_URL is not set")
    now = datetime.now(UTC)
    conn = await connect(url.get_secret_value())
    try:
        if args.what == "nightly":
            out = await calibration.mature(conn, now)
        elif args.what == "estimators":
            out = await estimators_table(conn, now)
        else:
            doc = await weekly.run_pass(conn, now, mode=args.what)
            out = {k: doc[k] for k in ("takeaway_tr", "telegram_tr", "applied", "rejected", "pool_n", "folds")}
        await conn.commit()
        return out
    finally:
        await conn.close()


def main(argv: Sequence[str] | None = None) -> int:
    out = run(_main(parse_args(argv)))
    sys.stdout.write(json.dumps(out, ensure_ascii=False, indent=1, default=str) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
