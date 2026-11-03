"""Archive backfill 2018 → today (see kaptan.live.archive): `uv run python scripts/backfill_archive.py`."""

from __future__ import annotations

import sys

from kaptan.live.archive import main

if __name__ == "__main__":
    sys.exit(main())
