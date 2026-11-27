""" "Ne öğrendim": what KAPtan learned (kaptan.learn), the self-learning switch and "Geri al".

    GET  /me/learning                              -> LearningReport {generated_at, auto_apply, takeaway_tr,
                                                      estimator_tr, kinds[4], changes[], rejected[], folds[]}
    PUT  /me/learning/settings  {auto_apply}       -> LearningReport   audit `learn.settings_changed`
    POST /me/learning/changes/{version}/revert     -> LearningReport   a new rules version with the old value,
                                                      audit `learn.rule_reverted`

`kinds` are E1–E4 over the learning pool (2022–2024 and live events from 2026-11-01; the sealed holdout is never
read): n, hit rate, mean and median return net of the estimated cost (fractions), and the calibration of KAPtan's
predicted edge (a factor is used only from 30 matured decisions on). `changes` are the thresholds the weekly pass
changed (`applied`), only proposed because the switch was off (`proposed`), or took back (`reverted`); `can_revert`
is true for an applied change that is still its rule's latest. `rejected` are the thresholds the latest pass looked at
and left alone, each with its plain reason. Before the first weekly pass: `generated_at` null, empty lists.

Revert: 404 `not_found` "Bu değişiklik bulunamadı."; 409 `conflict` when it was never applied or its rule changed
again since ("Bu değişiklik artık geri alınamaz: ..."). A reverted step is never re-applied by the loop by itself.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from kaptan.api.deps import ClockDep, CurrentUser
from kaptan.api.errors import ApiError
from kaptan.db import Conn
from kaptan.domain.schemas.learning import LearningReport, LearningSettingsInput
from kaptan.learn import rules_store, weekly

router = APIRouter(tags=["learning"])


async def _report(conn: Conn) -> Any:
    out = await weekly.learning_report(conn)
    await conn.rollback()
    return out


@router.get("/me/learning", response_model=LearningReport)
async def get_learning(user: CurrentUser, conn: Conn) -> Any:
    return await _report(conn)


@router.put("/me/learning/settings", response_model=LearningReport)
async def put_learning_settings(body: LearningSettingsInput, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    await weekly.set_auto_apply(conn, body.auto_apply, clock.now(), f"user:{actor.uid}")
    await conn.commit()
    return await _report(conn)


@router.post("/me/learning/changes/{version}/revert", response_model=LearningReport)
async def revert_learning_change(version: int, actor: CurrentUser, conn: Conn, clock: ClockDep) -> Any:
    try:
        await rules_store.revert_change(conn, version, clock.now(), actor=f"user:{actor.uid}")
    except rules_store.RevertError as exc:
        await conn.rollback()
        raise ApiError(404 if exc.code == "not_found" else 409, exc.code if exc.code == "not_found" else "conflict",
                       exc.detail_tr) from exc  # fmt: skip
    await conn.commit()
    return await _report(conn)
