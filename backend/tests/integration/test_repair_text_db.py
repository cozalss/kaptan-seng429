"""repair_rows fixes double-decoded names in place and leaves clean rows alone (rolled-back connection)."""

from __future__ import annotations

import pytest

from kaptan.db import DictConn
from kaptan.ingest.repair_text import repair_rows

pytestmark = pytest.mark.integration

#: Postgres cannot store the lone surrogate a cp1254 reader makes of 0x9E; a latin-1 reader stores U+009E.
BROKEN = "TUKAŞ GIDA A.Ş.".encode().decode("latin-1")


async def test_repair_rows_fixes_and_is_idempotent(pg: DictConn) -> None:
    await pg.execute(
        "INSERT INTO core.disclosures (disclosure_index, company_name, disclosure_class, disclosure_type, subject, "
        "summary, reason, subject_route, subject_map_version, published_at, available_at, ingest_source, origin) "
        "VALUES (993000001, %s, 'ODA', 'ODA', 'Özel Durum Açıklaması', '', 'NEW', 'noise', 'subject_map.v1', "
        "'2030-01-07 09:00+00', '2030-01-07 09:01+00', 'live', 'kap')",
        (BROKEN,),
    )
    dry = await repair_rows(pg, dry_run=True)
    assert dry["core.disclosures.company_name"] == 1
    assert (await repair_rows(pg))["core.disclosures.company_name"] == 1
    async with pg.cursor() as cur:
        await cur.execute("SELECT company_name FROM core.disclosures WHERE disclosure_index = 993000001")
        row = await cur.fetchone()
    assert row is not None and row["company_name"] == "TUKAŞ GIDA A.Ş."
    assert sum((await repair_rows(pg)).values()) == 0
