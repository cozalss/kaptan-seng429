"""The alert channels from the settings: which are on, and which are set wrongly.

A wrong value never stops KAPtan from starting: its channel stays off and `invalid` names it, so the settings
screen can say so. The checks are the guard on an outbound request to a configurable address: https only, no
credentials, path, query or fragment in the URL, and no address inside this network (the cloud metadata address,
the router, another container). They check the literal that was written, not what a host name resolves to: the
value comes from the person's own .env, never from a request.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import Any, Final, Literal
from urllib.parse import urlsplit

from pydantic import SecretStr

from kaptan.settings import Settings

Channel = Literal["ntfy", "email", "telegram"]

DEFAULT_NTFY_SERVER: Final = "https://ntfy.sh"
DEFAULT_SMTP_PORT: Final = 587
IMPLICIT_TLS_PORT: Final = 465
#: ntfy's own rule for a topic name. Anyone who knows the topic can read it, so a short one is refused.
TOPIC_RE: Final = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
ADDRESS_RE: Final = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$")
HOST_RE: Final = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$")
LOOPBACK_NAMES: Final = frozenset({"localhost"})
INTERNAL_SUFFIXES: Final = (".localhost", ".local", ".internal", ".lan", ".home", ".intranet")


@dataclass(frozen=True, slots=True)
class NtfyTarget:
    url: str  # the server root; the topic goes in the body, never in a URL
    topic: SecretStr


@dataclass(frozen=True, slots=True)
class SmtpTarget:
    host: str
    port: int
    user: str | None
    password: SecretStr | None
    to: str
    sender: str
    implicit_tls: bool


@dataclass(frozen=True, slots=True)
class AlertConfig:
    ntfy: NtfyTarget | None
    smtp: SmtpTarget | None
    #: Channels somebody tried to set up and got wrong (they stay off).
    invalid: tuple[Channel, ...]
    #: The paired Telegram chat (kaptan.alerts.telegram.resolve_target); not in `alert_config`, which reads no database.
    telegram: Any = None

    @property
    def channels(self) -> tuple[Channel, ...]:
        on: tuple[Channel, ...] = ()
        if self.ntfy is not None:
            on = (*on, "ntfy")
        if self.smtp is not None:
            on = (*on, "email")
        if self.telegram is not None:
            on = (*on, "telegram")
        return on


def _text(value: str | SecretStr | None) -> str:
    raw = value.get_secret_value() if isinstance(value, SecretStr) else value
    return (raw or "").strip()


def _safe_host(host: str, *, allow_loopback: bool) -> bool:
    """A public host name or a public IP literal; loopback only where `allow_loopback` says so (never in prod)."""
    name = host.lower().rstrip(".")
    try:
        ip = ipaddress.ip_address(name)
    except ValueError:
        if name in LOOPBACK_NAMES:
            return allow_loopback
        return bool(HOST_RE.fullmatch(name)) and not name.endswith(INTERNAL_SUFFIXES)
    if ip.is_loopback:
        return allow_loopback
    return ip.is_global


def ntfy_root(server: str, *, allow_loopback: bool) -> str | None:
    """The server's root URL ("https://ntfy.sh/"), or None when the value must not be used."""
    try:
        parts = urlsplit(server)
        port = parts.port  # raises on a port that is not a number in range
    except ValueError:
        return None
    host = parts.hostname or ""
    if not host or parts.username is not None or parts.password is not None:
        return None
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        return None
    loopback = allow_loopback and _is_loopback(host)
    if parts.scheme != "https" and not (parts.scheme == "http" and loopback):
        return None
    if not _safe_host(host, allow_loopback=allow_loopback):
        return None
    shown = f"[{host}]" if ":" in host else host
    return f"{parts.scheme}://{shown}{'' if port is None else f':{port}'}/"


def _is_loopback(host: str) -> bool:
    if host.lower() in LOOPBACK_NAMES:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _ntfy(settings: Settings, *, allow_loopback: bool) -> tuple[NtfyTarget | None, bool]:
    """(the target, was it set wrongly)."""
    topic = _text(settings.alert_ntfy_topic)
    if not topic:
        return None, False
    root = ntfy_root(_text(settings.alert_ntfy_server) or DEFAULT_NTFY_SERVER, allow_loopback=allow_loopback)
    if root is None or not TOPIC_RE.fullmatch(topic):
        return None, True
    return NtfyTarget(url=root, topic=SecretStr(topic)), False


def _port(raw: str) -> int | None:
    if not raw:
        return DEFAULT_SMTP_PORT
    if not raw.isascii() or not raw.isdigit():
        return None
    port = int(raw)
    return port if 0 < port < 65536 else None


def _smtp(settings: Settings, *, allow_loopback: bool) -> tuple[SmtpTarget | None, bool]:
    host, to = _text(settings.alert_smtp_host), _text(settings.alert_smtp_to)
    user, password = _text(settings.alert_smtp_user), _text(settings.alert_smtp_password)
    if not (host or to):
        return None, False
    port = _port(_text(settings.alert_smtp_port))
    well_formed = (
        port is not None
        and _safe_host(host, allow_loopback=allow_loopback)
        and bool(ADDRESS_RE.fullmatch(to))
        and bool(user) == bool(password)  # a login needs both; without both the server must accept unsigned mail
        and "\n" not in user
        and "\r" not in user
    )
    if not well_formed or port is None:
        return None, True
    return (
        SmtpTarget(
            host=host,
            port=port,
            user=user or None,
            password=SecretStr(password) if password else None,
            to=to,
            sender=user if ADDRESS_RE.fullmatch(user) else to,
            implicit_tls=port == IMPLICIT_TLS_PORT,
        ),
        False,
    )


def alert_config(settings: Settings) -> AlertConfig:
    allow_loopback = settings.kaptan_env != "prod"
    ntfy, ntfy_wrong = _ntfy(settings, allow_loopback=allow_loopback)
    smtp, smtp_wrong = _smtp(settings, allow_loopback=allow_loopback)
    invalid: tuple[Channel, ...] = ()
    if ntfy_wrong:
        invalid = (*invalid, "ntfy")
    if smtp_wrong:
        invalid = (*invalid, "email")
    return AlertConfig(ntfy=ntfy, smtp=smtp, invalid=invalid)
