"""Small request/response bodies of API.md that have no zod schema of their own (inline in http-api.ts)."""

from __future__ import annotations

from typing import Literal

from kaptan.domain.schemas._base import KModel

DemoScenario = Literal["e3_contract", "redteam_injection", "restricted_r04", "loss_simulation"]


class DemoInjectInput(KModel):
    scenario: DemoScenario


class DemoInjectOut(KModel):
    disclosure_index: int | None
    run_id: str | None


class DemoTamperInput(KModel):
    on: bool


class DemoTamperOut(KModel):
    tamper_on: bool


class SseTicketOut(KModel):
    ticket: str


class ErrorOut(KModel):
    """Every error body (API.md §3.2): Turkish, displayable `detail` + machine `code`."""

    detail: str
    code: str
