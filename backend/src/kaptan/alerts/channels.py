"""The two senders. Each either delivers the text or raises `AlertSendError` with a short reason.

ntfy: the documented JSON form (docs.ntfy.sh/publish, "Publish as JSON"): `POST <server root>` with
`{"topic", "message"}`. The topic is the secret of this channel, and in this form it never is part of a URL,
which is what HTTP clients put in their log lines and error texts. Redirects are not followed, proxies and
.netrc of the environment are not used, and the call has a short timeout.

SMTP: stdlib, off the event loop. TLS before anything else: port 465 speaks it from the first byte, every other
port must accept STARTTLS, or nothing is sent (the login and the mail never travel in the clear).

`AlertSendError` deliberately drops the original exception: its text can repeat the request, the server's answer
or the login.
"""

from __future__ import annotations

import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Any, Final

import httpx

from kaptan.alerts.config import NtfyTarget, SmtpTarget

NTFY_TIMEOUT_S: Final = 10.0
SMTP_TIMEOUT_S: Final = 15.0


class AlertSendError(Exception):
    """A channel did not deliver. `reason` is a class name or `http_<status>`: safe to log."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def ntfy_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=NTFY_TIMEOUT_S, follow_redirects=False, trust_env=False)


async def send_ntfy(target: NtfyTarget, text: str) -> None:
    body = {"topic": target.topic.get_secret_value(), "message": text}
    reason: str | None = None
    try:
        async with ntfy_client() as http:
            res = await http.post(target.url, json=body)
        if not res.is_success:
            reason = f"http_{res.status_code}"
    except httpx.HTTPError as exc:
        reason = type(exc).__name__
    if reason is not None:
        raise AlertSendError(reason)


def _mail(target: SmtpTarget, text: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = target.sender
    msg["To"] = target.to
    msg["Subject"] = text.rstrip(".")
    msg["Date"] = formatdate(localtime=False)
    msg["Message-ID"] = make_msgid(domain=target.sender.rpartition("@")[2])
    msg.set_content(text)
    return msg


def _deliver(target: SmtpTarget, text: str, smtp: Any, smtp_ssl: Any) -> None:
    context = ssl.create_default_context()
    if target.implicit_tls:
        server = smtp_ssl(target.host, target.port, timeout=SMTP_TIMEOUT_S, context=context)
    else:
        server = smtp(target.host, target.port, timeout=SMTP_TIMEOUT_S)
    with server:
        if not target.implicit_tls:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
        if target.user is not None and target.password is not None:
            server.login(target.user, target.password.get_secret_value())
        server.send_message(_mail(target, text))


async def send_email(target: SmtpTarget, text: str, *, smtp: Any = None, smtp_ssl: Any = None) -> None:
    """`smtp` / `smtp_ssl` stand in for smtplib.SMTP / SMTP_SSL in the tests."""
    reason: str | None = None
    try:
        await asyncio.to_thread(_deliver, target, text, smtp or smtplib.SMTP, smtp_ssl or smtplib.SMTP_SSL)
    except (smtplib.SMTPException, OSError, ValueError) as exc:
        reason = type(exc).__name__
    if reason is not None:
        raise AlertSendError(reason)
