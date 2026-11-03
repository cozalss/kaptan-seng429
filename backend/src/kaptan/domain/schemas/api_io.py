"""Small request/response bodies of API.md that have no zod schema of their own (inline in http-api.ts)."""

from __future__ import annotations

from kaptan.domain.schemas._base import KModel


class SseTicketOut(KModel):
    ticket: str


class ErrorOut(KModel):
    """Every error body (API.md §3.2): Turkish, displayable `detail` + machine `code`."""

    detail: str
    code: str
