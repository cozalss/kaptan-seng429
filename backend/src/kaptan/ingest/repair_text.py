"""Repair Turkish text that was decoded twice (UTF-8 bytes read as cp1254/latin-1): "TUKAÅ\udc9e" → "TUKAŞ".

    uv run python -m kaptan.ingest.repair_text            # fix the rows in place (owner or app role)
    uv run python -m kaptan.ingest.repair_text --dry-run  # only count them

Idempotent: clean text is never changed (a candidate is rewritten only when its bytes decode as strict UTF-8).
The audit ledger is never touched: its rows are hash-chained and immutable (09 §7).
"""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Sequence
from typing import Any, Final

from psycopg import sql

#: Lead bytes of 2-byte UTF-8 sequences as cp1254/latin-1 show them (Ã Ä Å = C3 C4 C5: ç ğ ı İ ö ş ü …).
MARKER: Final = re.compile(r"[ÃÄÅ]")
#: (table, key column, text columns) checked by `repair_rows`.
TARGETS: Final[tuple[tuple[str, str, tuple[str, ...]], ...]] = (
    ("core.disclosures", "disclosure_index", ("company_name", "subject", "summary")),
    ("core.disclosure_texts", "disclosure_index", ("body",)),
    ("core.companies", "company_id", ("title",)),
    ("core.issuers", "ticker", ("name",)),
    ("core.issuer_profiles", "ticker", ("name", "sector")),
)


def fix_mojibake(text: str) -> str:
    """The text as it was meant, or unchanged when it is not double-decoded."""
    if not MARKER.search(text):
        return text
    for codec in ("cp1254", "latin-1"):
        try:
            fixed = text.encode(codec, errors="surrogateescape").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if fixed != text:
            return fixed
    return text


async def repair_rows(conn: Any, *, dry_run: bool = False) -> dict[str, int]:
    """Fix every double-decoded value of TARGETS; returns {"table.column": rows fixed}. Caller commits."""
    out: dict[str, int] = {}
    for table, key, columns in TARGETS:
        schema, name = table.split(".")
        for col in columns:
            query = sql.SQL("SELECT {k} AS k, {c} AS v FROM {t} WHERE {c} ~ '[ÃÄÅ]'").format(
                k=sql.Identifier(key), c=sql.Identifier(col), t=sql.Identifier(schema, name)
            )
            async with conn.cursor() as cur:
                await cur.execute(query)
                rows = await cur.fetchall()
            fixes = [(fix_mojibake(r["v"]), r["k"]) for r in rows if fix_mojibake(r["v"]) != r["v"]]
            if fixes and not dry_run:
                update = sql.SQL("UPDATE {t} SET {c} = %s WHERE {k} = %s").format(
                    t=sql.Identifier(schema, name), c=sql.Identifier(col), k=sql.Identifier(key)
                )
                async with conn.cursor() as cur:
                    await cur.executemany(update, fixes)
            out[f"{table}.{col}"] = len(fixes)
    return out


async def _main(dry_run: bool) -> int:  # pragma: no cover - CLI wiring
    from kaptan.db import connect
    from kaptan.settings import get_settings

    settings = get_settings()
    url = settings.database_owner_url or settings.database_url
    conn = await connect(url.get_secret_value())
    try:
        report = await repair_rows(conn, dry_run=dry_run)
        await (conn.rollback() if dry_run else conn.commit())
    finally:
        await conn.close()
    for target, n in report.items():
        print(f"{target:36s} {n}")
    print(f"{'would fix' if dry_run else 'fixed'}: {sum(report.values())}")
    return 0


def main(argv: Sequence[str] | None = None) -> int:  # pragma: no cover - CLI wiring
    from kaptan.api.loop import run

    p = argparse.ArgumentParser(prog="python -m kaptan.ingest.repair_text", description=__doc__.split("\n")[0])
    p.add_argument("--dry-run", action="store_true")
    return run(_main(p.parse_args(argv).dry_run))


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
