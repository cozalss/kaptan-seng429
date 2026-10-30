"""09 §7.2: walk the audit chain and every external anchor line (exit 0 intact, 1 broken, 2 config error).

uv run python scripts/verify_audit_chain.py --url "$AUDITOR_DATABASE_URL" --anchor-file anchors.jsonl
"""

from __future__ import annotations

import sys

from kaptan.audit.verify_cli import main

if __name__ == "__main__":
    sys.exit(main())
