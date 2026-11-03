"""The one holdout run (see kaptan.evalreports.holdout): `uv run python scripts/holdout_once.py status`."""

from __future__ import annotations

import sys

from kaptan.evalreports.holdout import main

if __name__ == "__main__":
    sys.exit(main())
