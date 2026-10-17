"""Demo controls (DEMO_MODE only; 404 otherwise) — owner: wave-2 package C (inject delegates to E / B).

    POST /demo/inject  {"scenario": e3_contract|redteam_injection|restricted_r04|loss_simulation}
                       -> {"disclosure_index": int|null, "run_id": str|null}    (demo.run: admin)
    POST /demo/tamper  {"on": bool} -> {"tamper_on": bool}                       (demo.run)
    POST /demo/reset   -> 204                                                     (demo.run)

The logic lives in kaptan.demo.control (inject/reset), kaptan.demo.tamper and kaptan.demo.timers.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response

from kaptan.api.deps import Actor, SettingsDep, require, require_demo_mode
from kaptan.db import Conn
from kaptan.demo import control
from kaptan.domain.schemas import DemoInjectInput, DemoInjectOut, DemoTamperInput, DemoTamperOut

router = APIRouter(tags=["demo"], dependencies=[Depends(require_demo_mode)])


@router.post("/demo/inject", response_model=DemoInjectOut)
async def inject(
    body: DemoInjectInput, request: Request, actor: Annotated[Actor, Depends(require("demo.run"))], conn: Conn
) -> Any:
    return await control.inject(request.app, conn, actor, body.scenario)


@router.post("/demo/tamper", response_model=DemoTamperOut)
async def tamper(
    body: DemoTamperInput, settings: SettingsDep, actor: Annotated[Actor, Depends(require("demo.run"))]
) -> Any:
    return {"tamper_on": await control.set_tamper(settings, body.on)}


@router.post("/demo/reset", status_code=204)
async def reset(
    request: Request, settings: SettingsDep, actor: Annotated[Actor, Depends(require("demo.run"))]
) -> Response:
    await control.reset(request.app, settings)
    return Response(status_code=204)
