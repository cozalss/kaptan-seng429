"""Mirror of kaptan-panel/src/lib/domain/alerts (phone and e-mail alerts, GET /me/alerts)."""

from __future__ import annotations

from kaptan.domain.schemas._base import IsoDateTime, KModel


class AlertSettings(KModel):
    """What is switched on. The topic and the address never appear here."""

    ntfy: bool
    email: bool
    last_sent_at: IsoDateTime | None
    last_error_tr: str | None
