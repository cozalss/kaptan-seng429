"""The auditor's offline check (09 §7.2): walk the ledger and every external anchor line.

    uv run python -m kaptan.audit.verify_cli --url "$AUDITOR_DATABASE_URL" [--anchor-file anchors.jsonl]
    uv run python scripts/verify_audit_chain.py ...          (the same thing)

`/audit/verify` and the nightly anchor check only the latest anchor; this walks the chain once and then
checks *every* line of the anchor file (`{"anchored_at", "chain_pos", "hash"}`, kaptan.audit.anchor): each
anchored position must still exist with that hash. Exit codes: 0 intact, 1 broken (chain or an anchor),
2 configuration error (no URL, unreadable anchor file). Read-only; prints no secrets.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from kaptan.api.loop import run
from kaptan.audit.verify import StoredEntry, latest_anchor, load_chain, verify_chain
from kaptan.db import connect
from kaptan.domain.schemas._base import iso_ms


class AnchorFileError(ValueError):
    """The anchor file cannot be read or has a malformed line."""


def read_anchor_lines(path: Path) -> list[dict[str, Any]]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise AnchorFileError(f"cannot read {path}: {exc.strerror}") from None
    lines: list[dict[str, Any]] = []
    for n, raw in enumerate(text.splitlines(), 1):
        if not raw.strip():
            continue
        try:
            line = json.loads(raw)
            lines.append({"line": n, "chain_pos": int(line["chain_pos"]), "hash": str(line["hash"])})
        except (ValueError, KeyError, TypeError):
            raise AnchorFileError(f"{path.name}:{n}: not an anchor line") from None
    return lines


def anchor_mismatches(chain: Sequence[StoredEntry], lines: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every anchor line whose position is missing or now carries another hash."""
    by_pos = {e.chain_pos: e.hash for e in chain}
    bad = []
    for line in lines:
        now = by_pos.get(line["chain_pos"])
        if now != line["hash"]:
            bad.append({**line, "found": now})
    return bad


async def verify_all(url: str, anchor_file: Path | None) -> dict[str, Any]:
    lines = read_anchor_lines(anchor_file) if anchor_file is not None else []
    conn = await connect(url)
    try:
        chain = await load_chain(conn)
        verdict = verify_chain(chain, iso_ms(datetime.now(UTC)), await latest_anchor(conn))
        await conn.rollback()
    finally:
        await conn.close()
    mismatches = anchor_mismatches(chain, lines)
    return {**verdict, "anchor_lines": len(lines), "anchor_mismatches": mismatches}


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m kaptan.audit.verify_cli", description=__doc__.split("\n")[0])
    ap.add_argument("--url", default=os.environ.get("AUDITOR_DATABASE_URL") or os.environ.get("DATABASE_URL"))
    ap.add_argument("--anchor-file", type=Path, default=None)
    ns = ap.parse_args(argv)
    if not ns.url:
        print("verify_audit_chain: give --url or AUDITOR_DATABASE_URL / DATABASE_URL", file=sys.stderr)
        return 2
    try:
        result = run(verify_all(ns.url, ns.anchor_file))
    except AnchorFileError as exc:
        print(f"verify_audit_chain: {exc}", file=sys.stderr)
        return 2
    ok = bool(result["ok"]) and not result["anchor_mismatches"]
    print(
        f"audit chain: ok={result['ok']} checked={result['checked']} first_bad_pos={result['first_bad_pos']} "
        f"kind={result['kind']} anchors_checked={result['anchor_lines']} "
        f"anchor_mismatches={len(result['anchor_mismatches'])}"
    )
    for m in result["anchor_mismatches"]:
        print(f"  anchor line {m['line']}: chain_pos {m['chain_pos']} no longer has the anchored hash")
    return 0 if ok else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
