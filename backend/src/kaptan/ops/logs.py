"""One logging setup for the API and every worker: plain text in dev, one JSON object per line in prod.

    setup_logging(settings, component="api")          # process entry points only (never in tests)
    with bind_log_context(run_id="run-live-1", disclosure_index=1):
        log.info("run started")                     # → {"run_id": "run-live-1", "disclosure_index": 1, ...}

Context fields (`request_id`, `run_id`, `disclosure_index`) live in contextvars, so concurrent requests
and tasks never see each other's values. `RedactionFilter` runs on every record before it is
formatted: it masks secrets (connection-string passwords, Bearer/JWT tokens, provider keys, argon2
hashes, the configured secret values) and replaces disclosure texts passed as `extra=` fields with
their length. Formatters scrub tracebacks too.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, Final
from urllib.parse import urlsplit

from pydantic import SecretStr

from kaptan.settings import Settings

request_id_var: ContextVar[str | None] = ContextVar("kaptan_request_id", default=None)
run_id_var: ContextVar[str | None] = ContextVar("kaptan_run_id", default=None)
disclosure_index_var: ContextVar[int | None] = ContextVar("kaptan_disclosure_index", default=None)

CONTEXT_FIELDS: Final = ("request_id", "run_id", "disclosure_index")
#: `extra=` keys that carry disclosure text (KVKK, size): logged as their length only.
TEXT_FIELDS: Final = frozenset({"body", "body_norm", "text", "content", "content_norm", "snippet", "prompt"})
MAX_MESSAGE_CHARS: Final = 4000
_HANDLER_MARK: Final = "_kaptan_handler"
#: Third-party loggers that print every request (with URLs) at INFO.
QUIET_LOGGERS: Final = ("httpx", "httpcore", "uvicorn.access", "alembic.runtime.plugins")
_STD_ATTRS: Final = frozenset(
    logging.LogRecord("", 0, "", 0, "", None, None).__dict__.keys()
    | {"message", "asctime", "taskName", "color_message", "ctx"}
)

_KEY_VALUE: Final = (
    r"(?i)(?P<k>[\"']?(?:x-goog-api-key|api[_-]?key|password|passwd|pw|secret|token|ticket)[\"']?\s*[=:]\s*)"
    r"[\"']?[^\s\"',&}]+"
)
_PATTERNS: Final[tuple[tuple[re.Pattern[str], str], ...]] = (
    # scheme://user:password@host → scheme://user:***@host (postgres, redis, amqp …)
    (re.compile(r"(?P<pre>[a-z][a-z0-9+.-]*://[^:/@\s]*:)[^@\s]+(?=@)", re.I), r"\g<pre>***"),
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/=-]+"), r"\1 ***"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), "<jwt>"),
    (re.compile(r"\$argon2(?:id|i|d)\$[^\s'\"]+"), "<argon2-hash>"),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{20,}"), "<google-key>"),
    (re.compile(r"\bgsk_[0-9A-Za-z]{20,}"), "<groq-key>"),
    (re.compile(r"\bsk-[0-9A-Za-z_-]{16,}"), "<api-key>"),
    (re.compile(r"\bAGE-SECRET-KEY-1[0-9A-Z]+"), "<age-key>"),
    (re.compile(_KEY_VALUE), r"\g<k>***"),
)


class Redactor:
    """Masks secret-looking substrings and the exact secret values it was given."""

    def __init__(self, secrets: Iterable[str] = ()) -> None:
        self.secrets = sorted({s for s in secrets if len(s) >= 6}, key=len, reverse=True)

    def __call__(self, text: str) -> str:
        for value in self.secrets:
            if value in text:
                text = text.replace(value, "***")
        for pattern, repl in _PATTERNS:
            text = pattern.sub(repl, text)
        return text


def secret_values(settings: Settings) -> list[str]:
    """Every configured secret (exact values are masked even where no pattern would catch them)."""
    out: list[str] = []
    for name in type(settings).model_fields:
        value = getattr(settings, name, None)
        if not isinstance(value, SecretStr):
            continue
        secret = value.get_secret_value()
        out.append(secret)
        try:
            password = urlsplit(secret).password  # the password of a connection URL on its own
        except ValueError:
            password = None
        if password:
            out.append(password)
    return out


class ContextFilter(logging.Filter):
    """Adds request_id / run_id / disclosure_index from the contextvars (None when unset)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.run_id = run_id_var.get()
        record.disclosure_index = disclosure_index_var.get()
        return True


class RedactionFilter(logging.Filter):
    """Formats the message once, masks secrets in it, and shrinks disclosure-text `extra` fields."""

    def __init__(self, redactor: Redactor) -> None:
        super().__init__()
        self.redactor = redactor

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # a bad %-format must not lose the record
            message = str(record.msg)
        if len(message) > MAX_MESSAGE_CHARS:
            message = f"{message[:MAX_MESSAGE_CHARS]}… [{len(message)} chars]"
        record.msg, record.args = self.redactor(message), None
        for key, value in list(record.__dict__.items()):
            if key in _STD_ATTRS or key in CONTEXT_FIELDS:
                continue
            if key in TEXT_FIELDS and isinstance(value, str):
                setattr(record, key, f"<text {len(value)} chars>")
            elif isinstance(value, str):
                setattr(record, key, self.redactor(value))
        return True


def _extras(record: logging.LogRecord) -> dict[str, Any]:
    return {k: v for k, v in record.__dict__.items() if k not in _STD_ATTRS and k not in CONTEXT_FIELDS}


class JsonFormatter(logging.Formatter):
    """One JSON object per line: ts, level, logger, msg, component, context fields, extras, exc."""

    def __init__(self, component: str, redactor: Redactor) -> None:
        super().__init__()
        self.component = component
        self.redactor = redactor

    def format(self, record: logging.LogRecord) -> str:
        doc: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "component": self.component,
        }
        for key in CONTEXT_FIELDS:
            value = getattr(record, key, None)
            if value is not None:
                doc[key] = value
        doc.update(_extras(record))
        if record.exc_info:
            doc["exc"] = self.redactor(self.formatException(record.exc_info))
        return json.dumps(doc, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    """Dev: `time level logger [rid=… run=… idx=…] message`, tracebacks scrubbed."""

    def __init__(self, redactor: Redactor) -> None:
        super().__init__("%(asctime)s %(levelname)s %(name)s%(ctx)s: %(message)s")
        self.redactor = redactor

    def format(self, record: logging.LogRecord) -> str:
        parts = [f"{k}={getattr(record, k)}" for k in CONTEXT_FIELDS if getattr(record, k, None) is not None]
        record.ctx = f" [{' '.join(parts)}]" if parts else ""
        return self.redactor(super().format(record))


def wants_json(settings: Settings) -> bool:
    if settings.log_format == "auto":
        return settings.kaptan_env == "prod"
    return settings.log_format == "json"


def build_handler(settings: Settings, component: str, stream: Any = None) -> logging.Handler:
    redactor = Redactor(secret_values(settings))
    handler = logging.StreamHandler(stream or sys.stderr)
    handler.addFilter(ContextFilter())
    handler.addFilter(RedactionFilter(redactor))
    handler.setFormatter(JsonFormatter(component, redactor) if wants_json(settings) else TextFormatter(redactor))
    setattr(handler, _HANDLER_MARK, True)
    return handler


def setup_logging(settings: Settings, component: str, stream: Any = None) -> logging.Handler:
    """Root logger → one redacting handler (idempotent). uvicorn's loggers propagate to it."""
    root = logging.getLogger()
    for old in list(root.handlers):
        root.removeHandler(old)
    handler = build_handler(settings, component, stream)
    root.addHandler(handler)
    root.setLevel(settings.log_level)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True
        lg.disabled = False  # alembic's fileConfig (disable_existing_loggers) may have switched it off
        lg.setLevel(logging.NOTSET)  # an earlier uvicorn Config(log_level=…) may have raised it; follow root
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
    return handler


@contextmanager
def bind_log_context(
    *, request_id: str | None = None, run_id: str | None = None, disclosure_index: int | None = None
) -> Iterator[None]:
    """Set context fields for the block (only the ones given); restored afterwards."""
    tokens: list[tuple[ContextVar[Any], Any]] = []
    pairs: tuple[tuple[ContextVar[Any], Any], ...] = (
        (request_id_var, request_id),
        (run_id_var, run_id),
        (disclosure_index_var, disclosure_index),
    )
    for var, value in pairs:
        if value is not None:
            tokens.append((var, var.set(value)))
    try:
        yield
    finally:
        for var, token in reversed(tokens):
            var.reset(token)
