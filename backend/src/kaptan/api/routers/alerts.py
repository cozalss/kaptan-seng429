"""Phone and e-mail alerts, as the settings screen sees them (kaptan.alerts).

    GET  /me/alerts       -> AlertSettings  {ntfy, email, last_sent_at, last_error_tr}
    POST /me/alerts/test  -> AlertSettings  sends "KAPtan: deneme bildirimi." through every configured channel

The response says what is switched on and how the last message went; the topic and the address never leave the
server. The test is limited to one per minute (429 `rate_limited`). With no channel configured the test sends
nothing and answers with the same settings (both false).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from kaptan.alerts.config import alert_config
from kaptan.alerts.service import TEST_RATE_S, alert_settings, notify
from kaptan.api.deps import CurrentUser, SettingsDep
from kaptan.api.errors import ApiError
from kaptan.domain.schemas.alerts import AlertSettings

router = APIRouter(tags=["alerts"])

RATE_LIMITED_TEXT = "Deneme bildirimi en fazla dakikada bir gönderilir. Biraz sonra yeniden dene."


@router.get("/me/alerts", response_model=AlertSettings)
async def get_alerts(user: CurrentUser, request: Request, settings: SettingsDep) -> Any:
    return await alert_settings(request.app.state.redis, alert_config(settings))


@router.post("/me/alerts/test", response_model=AlertSettings)
async def test_alert(user: CurrentUser, request: Request, settings: SettingsDep) -> Any:
    redis = request.app.state.redis
    cfg = alert_config(settings)
    if await notify(redis, cfg, "test", rate_s=TEST_RATE_S) == "rate_limited":
        raise ApiError(429, "rate_limited", RATE_LIMITED_TEXT)
    return await alert_settings(redis, cfg)
