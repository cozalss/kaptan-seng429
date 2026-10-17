"""Demo controls (DEMO_MODE only; 404 otherwise) — owner: wave-2 package C (inject delegates to E).

    POST /demo/inject  {"scenario": e3_contract|redteam_injection|restricted_r04|loss_simulation}
                       -> {"disclosure_index": int|null, "run_id": str|null}    (demo.run: admin)
    POST /demo/tamper  {"on": bool} -> {"tamper_on": bool}                       (demo.run)
    POST /demo/reset   -> 204                                                     (demo.run)

inject: audit `demo.injected` {scenario, ticker, fixture: true}, then the replay pipeline (package E)
runs the scenario; loss_simulation drives risk_state through the mock's LOSS_DAILY steps (package B
helper). tamper: owner connection; the payload of chain_pos 3907 gets/loses {"kurcalandi": true}
behind the chain's back (no audit entry); ops.demo_state.tamper_on. reset: kaptan.demo.seed.reseed()
with the owner connection, then app.state.clock.restart(started_at).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response

from kaptan.api.deps import Actor, require, require_demo_mode
from kaptan.api.errors import not_implemented
from kaptan.db import Conn
from kaptan.domain.schemas import DemoInjectInput, DemoInjectOut, DemoTamperInput, DemoTamperOut

router = APIRouter(tags=["demo"], dependencies=[Depends(require_demo_mode)])


@router.post("/demo/inject", response_model=DemoInjectOut)
async def inject(body: DemoInjectInput, actor: Annotated[Actor, Depends(require("demo.run"))], conn: Conn) -> Any:
    raise not_implemented("POST /demo/inject")


@router.post("/demo/tamper", response_model=DemoTamperOut)
async def tamper(body: DemoTamperInput, actor: Annotated[Actor, Depends(require("demo.run"))]) -> Any:
    raise not_implemented("POST /demo/tamper")


@router.post("/demo/reset", status_code=204)
async def reset(actor: Annotated[Actor, Depends(require("demo.run"))]) -> Response:
    raise not_implemented("POST /demo/reset")
