"""Structured logging: JSON in prod, text in dev, context fields, redaction of secrets and disclosure texts."""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Iterator

import pytest
from pydantic import SecretStr

from kaptan.ops.logs import (
    ContextFilter,
    JsonFormatter,
    RedactionFilter,
    Redactor,
    bind_log_context,
    build_handler,
    request_id_var,
    secret_values,
    setup_logging,
    wants_json,
)
from kaptan.settings import Settings

DB_PW = "S3cr3tDbPassw0rd"


def settings(**over: object) -> Settings:
    base: dict[str, object] = {
        "kaptan_env": "dev",
        "database_url": SecretStr(f"postgresql://kaptan_app:{DB_PW}@db:5432/kaptan"),
        "redis_url": SecretStr("redis://:redis-pass-123@redis:6379/0"),
        "jwt_secret": SecretStr("jwt-value-which-is-long-enough-0123456789"),
        "log_format": "auto",
        "log_level": "INFO",
    }
    base.update(over)
    return Settings.model_construct(**base)  # type: ignore[arg-type]


@pytest.fixture
def logger() -> Iterator[tuple[logging.Logger, io.StringIO]]:
    stream = io.StringIO()
    handler = build_handler(settings(log_format="json"), "test", stream)
    lg = logging.getLogger("kaptan.test.ops_logs")
    lg.addHandler(handler)
    lg.setLevel(logging.DEBUG)
    lg.propagate = False
    yield lg, stream
    lg.removeHandler(handler)


def lines(stream: io.StringIO) -> list[dict[str, object]]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]


@pytest.mark.parametrize(
    ("text", "hidden"),
    [
        ("connect postgresql://kaptan_app:hunter2hunter2@db:5432/kaptan failed", "hunter2hunter2"),
        ("redis://:redispw123456@redis:6379/0", "redispw123456"),
        ("Authorization: Bearer abc.def.ghi-123", "abc.def.ghi-123"),
        ("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1eWUtMSJ9.c2lnbmF0dXJlc2ln here", "eyJzdWIiOiJ1eWUtMSJ9"),
        ("hash $argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA", "c2FsdA$aGFzaA"),
        ("key AIzaSyA1234567890abcdefghijklmnopqr", "AIzaSyA1234567890abcdefghijklmnopqr"),
        ("gsk_abcdefghijklmnopqrstuvwxyz0123", "gsk_abcdefghijklmnopqrstuvwxyz0123"),
        ("sk-abcdefghijklmnop12345", "sk-abcdefghijklmnop12345"),
        ("GET /api/v1/stream/feed?ticket=Zm9vYmFyYmF6cXV4", "Zm9vYmFyYmF6cXV4"),
        ('{"api_key": "plainkeyvalue99"}', "plainkeyvalue99"),
        ("x-goog-api-key: AIzaShort", "AIzaShort"),
        ("AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQ", "AGE-SECRET-KEY-1QQQQ"),
    ],
)
def test_redactor_masks_secret_shapes(text: str, hidden: str) -> None:
    assert hidden not in Redactor()(text)


def test_redactor_masks_exact_configured_values() -> None:
    values = secret_values(settings())
    assert any(DB_PW in v for v in values)
    red = Redactor([*values, "abc"])  # values shorter than 6 chars are ignored (too noisy)
    out = red(f"the password is {DB_PW} and abc stays")
    assert DB_PW not in out
    assert "abc stays" in out


def test_json_lines_carry_context_and_mask_secrets(logger: tuple[logging.Logger, io.StringIO]) -> None:
    lg, stream = logger
    with bind_log_context(request_id="req-12345678", run_id="run-live-7", disclosure_index=7):
        lg.info("db %s down", f"postgresql://u:{DB_PW}@h/db", extra={"duration_ms": 3})
    lg.warning("outside")
    first, second = lines(stream)
    assert first["msg"] == "db postgresql://u:***@h/db down"
    assert (first["request_id"], first["run_id"], first["disclosure_index"]) == ("req-12345678", "run-live-7", 7)
    assert first["duration_ms"] == 3
    assert first["component"] == "test"
    assert first["level"] == "INFO"
    assert "request_id" not in second
    assert request_id_var.get() is None


def test_disclosure_texts_are_replaced_by_their_length(logger: tuple[logging.Logger, io.StringIO]) -> None:
    lg, stream = logger
    body = "Şirketimiz ile Karayolları arasında gizli kalması gereken bir metin. " * 3
    lg.info("stored text", extra={"body": body, "note": f"pw={DB_PW}"})
    (doc,) = lines(stream)
    assert doc["body"] == f"<text {len(body)} chars>"
    assert DB_PW not in json.dumps(doc)


def test_long_messages_are_truncated_and_tracebacks_scrubbed(logger: tuple[logging.Logger, io.StringIO]) -> None:
    lg, stream = logger
    lg.info("x" * 5000)
    try:
        raise RuntimeError(f"cannot connect postgresql://u:{DB_PW}@h/db")
    except RuntimeError:
        lg.exception("failed")
    long_line, exc_line = lines(stream)
    assert str(long_line["msg"]).endswith("[5000 chars]")
    assert DB_PW not in str(exc_line["exc"])
    assert "RuntimeError" in str(exc_line["exc"])


def test_bad_format_args_do_not_lose_the_record(logger: tuple[logging.Logger, io.StringIO]) -> None:
    lg, stream = logger
    lg.info("two %s %s", "only-one")
    assert lines(stream)[0]["msg"] == "two %s %s"


def test_text_format_in_dev_with_context() -> None:
    stream = io.StringIO()
    handler = build_handler(settings(), "api", stream)
    record = logging.LogRecord("kaptan.x", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    with bind_log_context(run_id="run-1"):
        for f in handler.filters:
            assert isinstance(f, ContextFilter | RedactionFilter)
            f.filter(record)
    out = handler.format(record)
    assert "INFO kaptan.x [run_id=run-1]: hello world" in out


def test_wants_json() -> None:
    assert wants_json(settings(kaptan_env="prod"))
    assert not wants_json(settings())
    assert wants_json(settings(log_format="json"))
    assert not wants_json(settings(kaptan_env="prod", log_format="text"))


def test_setup_logging_installs_one_root_handler() -> None:
    root = logging.getLogger()
    saved, level = list(root.handlers), root.level
    try:
        stream = io.StringIO()
        logging.getLogger("uvicorn.error").disabled = True  # as alembic's fileConfig leaves it
        # as a uvicorn Config(log_level="warning") leaves it
        logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
        setup_logging(settings(log_format="json"), "api", stream)
        setup_logging(settings(log_format="json"), "api", stream)
        assert len(root.handlers) == 1
        logging.getLogger("uvicorn.error").info("from uvicorn")
        assert json.loads(stream.getvalue().splitlines()[-1])["logger"] == "uvicorn.error"
        assert logging.getLogger("httpx").level == logging.WARNING
    finally:
        root.handlers[:] = saved
        root.setLevel(level)


def test_json_formatter_without_context() -> None:
    fmt = JsonFormatter("w", Redactor())
    record = logging.LogRecord("n", logging.ERROR, __file__, 1, "plain", None, None)
    doc = json.loads(fmt.format(record))
    assert doc["msg"] == "plain"
    assert "run_id" not in doc
