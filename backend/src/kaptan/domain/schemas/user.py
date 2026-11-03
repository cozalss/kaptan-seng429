"""Me, Signature and the login bodies (what kaptan-panel reads)."""

from __future__ import annotations

from kaptan.domain.schemas._base import IsoDateTime, KModel


class Me(KModel):
    id: str
    display_name: str


class Signature(KModel):
    """A signature on a decision: who and when."""

    uid: str
    name: str
    at: IsoDateTime
    reason: str | None


class TokenOut(KModel):
    access_token: str


class SessionOut(KModel):
    access_token: str
    user: Me
