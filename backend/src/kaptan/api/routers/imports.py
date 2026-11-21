"""Importing a broker or MKK statement into the person's book (wave 5 IMPORT).

POST /me/import/read?source=&filename=   raw file bytes     -> ImportTable   (parsed in memory, nothing stored)
POST /me/import/preview                  ImportRequest      -> ImportPreview (new / recorded / conflict, writes nothing)
POST /me/import/apply                    ImportApplyRequest -> ImportResult  (writes only the ticked new rows)
GET  /me/import/sources                  -> ImportSources                    (source names with a remembered mapping)

The upload is the raw request body, not a form: nothing to parse before the size check. At most 5 MB (413
`too_large`, also from the Content-Length header before reading); the type is decided from the bytes (415
`unsupported_type` / `old_excel` / `macros`; 422 `encrypted` / `scanned` / `unreadable` / `empty`). The file is
never written to disk or the database; only a hash per imported row and the column mapping under the source name
are kept (`trading.import_rows`, `trading.import_mappings`). Errors are `{detail, code}` in Turkish.
Every written row is audited like the person's own entry (`money.deposited` / `money.withdrawn` /
`dividend.recorded` / `holding.sold` / `holding.bought`, payload `imported: true`) and one `import.applied` summary
follows. Importing the same file twice adds nothing. The MKK e-YATIRIMCI Hesap Hareketlerim layout has no public
sample, so there is no preset: the generic mapping (and its remembered result) covers it.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.domain.schemas.imports import (
    ImportApplyRequest,
    ImportMapping,
    ImportPreview,
    ImportRequest,
    ImportResult,
    ImportSources,
    ImportTable,
    SourceName,
)
from kaptan.imports import files, service
from kaptan.imports.normalize import header_key, type_key

router = APIRouter(tags=["import"])
JSON_MAX_BYTES = 12 * 1024 * 1024
GUESS_WORDS = ("tarih", "date", "islem", "hisse", "adet", "fiyat", "tutar")


def _declared(request: Request) -> int | None:
    raw = request.headers.get("content-length", "")
    return int(raw) if raw.isdigit() else None


async def _json_limit(request: Request) -> None:
    """The table sent back for preview/apply is at most 3000 rows x 30 cells x 100 characters; refuse more
    before FastAPI reads it (a body with no declared length is still bounded by the field limits)."""
    declared = _declared(request)
    if declared is not None and declared > JSON_MAX_BYTES:
        raise ApiError(413, "too_large", files.TOO_LARGE)


@router.post("/me/import/read", response_model=ImportTable)
async def read_file(
    request: Request,
    user: CurrentUser,
    conn: Conn,
    source: Annotated[SourceName, Query()],
    filename: Annotated[str, Query(max_length=200)] = "",
) -> Any:
    data = await files.read_limited(request.stream(), _declared(request))
    kind, rows, truncated = files.parse(data, filename)
    first = " ".join(type_key(c) for c in rows[0])
    guess = kind != "pdf" and any(w in first for w in GUESS_WORDS)
    saved = await service.saved_mapping(conn, source)
    return ImportTable(
        file_kind=kind,
        number_style="dot" if kind == "xlsx" else "auto",
        columns=len(rows[0]),
        rows=rows,
        truncated=truncated,
        has_header_guess=guess,
        saved_mapping=None if saved is None else saved[0],
        saved_matches=saved is not None and saved[1] == header_key(rows),
    )


@router.post("/me/import/preview", response_model=ImportPreview, dependencies=[Depends(_json_limit)])
async def post_preview(body: ImportRequest, user: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await service.preview(conn, body, now=clock.now())


@router.post("/me/import/apply", response_model=ImportResult, dependencies=[Depends(_json_limit)])
async def post_apply(body: ImportApplyRequest, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    return await service.apply(conn, body, actor, now=clock.now())


@router.get("/me/import/sources", response_model=ImportSources)
async def get_sources(user: CurrentUser, conn: Conn) -> Any:
    return {"sources": await service.sources(conn)}


__all__ = ["ImportMapping", "router"]
