"""Phone and e-mail alerts (kaptan.alerts): fixed sentences only, off unless configured, never a raise.

Everything here is offline: ntfy is mocked with respx, SMTP with a fake class, Redis with a small in-memory fake.
"""

from __future__ import annotations

import json
import logging
import re
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Any, get_args

import httpx
import pytest
import respx
from pydantic import SecretStr
from redis.exceptions import ConnectionError as RedisConnectionError

from kaptan.alerts import channels, service
from kaptan.alerts.channels import AlertSendError, send_email, send_ntfy
from kaptan.alerts.config import DEFAULT_NTFY_SERVER, AlertConfig, NtfyTarget, SmtpTarget, alert_config
from kaptan.alerts.messages import MESSAGES, AlertKind, kind_for_event, message_for
from kaptan.alerts.service import alert_settings, notify
from kaptan.settings import Settings

EXPECTED = Path(__file__).resolve().parents[1] / "fixtures" / "demo" / "expected"
TOPIC = "kaptan-test-only-topic-0123456789"
SMTP_PASSWORD = "test-only-smtp-password"
TO = "deniz@example.org"
NOW = datetime(2026, 11, 19, 9, 0, tzinfo=UTC)
NTFY = NtfyTarget(url="https://ntfy.sh/", topic=SecretStr(TOPIC))
SMTP = SmtpTarget(
    host="smtp.example.org",
    port=587,
    user="deniz@example.org",
    password=SecretStr(SMTP_PASSWORD),
    to=TO,
    sender="deniz@example.org",
    implicit_tls=False,
)
BOTH = AlertConfig(ntfy=NTFY, smtp=SMTP, invalid=())
OFF = AlertConfig(ntfy=None, smtp=None, invalid=())


def _load(name: str) -> Any:
    return json.loads((EXPECTED / name).read_text(encoding="utf-8"))


def settings(**over: Any) -> Settings:
    return Settings.model_construct(kaptan_env="prod", **over)


class FakeRedis:
    """SET NX EX, GET, DEL and one hash: what the alert state needs."""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttl: dict[str, int] = {}
        self.hashes: dict[str, dict[str, str]] = {}

    async def set(self, key: str, value: str, *, nx: bool = False, ex: int | None = None) -> bool | None:
        if nx and key in self.values:
            return None
        self.values[key] = value
        if ex is not None:
            self.ttl[key] = ex
        return True

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def delete(self, *keys: str) -> int:
        return sum(1 for k in keys if self.values.pop(k, None) is not None or self.hashes.pop(k, None) is not None)

    async def hset(self, key: str, mapping: dict[str, str]) -> int:
        self.hashes.setdefault(key, {}).update(mapping)
        return len(mapping)

    async def hdel(self, key: str, *fields: str) -> int:
        return sum(1 for f in fields if self.hashes.get(key, {}).pop(f, None) is not None)

    async def hgetall(self, key: str) -> dict[str, str]:
        return dict(self.hashes.get(key, {}))


class DownRedis(FakeRedis):
    async def set(self, key: str, value: str, *, nx: bool = False, ex: int | None = None) -> bool | None:
        raise RedisConnectionError("redis is away")

    async def hgetall(self, key: str) -> dict[str, str]:
        raise RedisConnectionError("redis is away")


class FakeSmtp:
    """Records what smtplib would have been asked to do."""

    sent: list[EmailMessage]
    log: list[str]

    def __init__(self, host: str, port: int, **kwargs: Any) -> None:
        type(self).log.append(f"connect {host}:{port} timeout={kwargs.get('timeout')}")

    def __enter__(self) -> FakeSmtp:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def ehlo(self) -> None:
        type(self).log.append("ehlo")

    def starttls(self, *, context: Any) -> None:
        type(self).log.append("starttls")

    def login(self, user: str, password: str) -> None:
        assert password == SMTP_PASSWORD
        type(self).log.append("login")

    def send_message(self, msg: EmailMessage) -> None:
        type(self).sent.append(msg)


@pytest.fixture
def smtp() -> type[FakeSmtp]:
    FakeSmtp.sent, FakeSmtp.log = [], []
    return FakeSmtp


# ── the texts ─────────────────────────────────────────────────────────────────


def realistic_events() -> list[tuple[str, dict[str, Any]]]:
    cards = _load("approvals_all.json")
    risk = _load("risk_status.json")
    halted = {**risk, "halted_today": True, "daily_pnl_pct": -0.0104}
    stopped = {**risk, "kill_switch": "on", "kill_reason": "Zirveden %5 düşüş (R01)", "drawdown_pct": -0.0512}
    return [
        *[("approval.requested", card) for card in cards],
        *[("approval.decided", card) for card in cards],
        ("halt", halted),
        ("halt", risk),
        ("kill_switch", stopped),
        ("kill_switch", risk),
        ("regime", risk),
    ]


def forbidden_words() -> set[str]:
    cards = _load("approvals_all.json")
    words = {str(c["ticker"]) for c in cards}
    for card in cards:
        words |= {w for w in re.split(r"[^\wçğıöşüÇĞİÖŞÜ]+", str(card["company_name"])) if len(w) > 3}
    return words - {"A.Ş."}


def assert_carries_no_signal(text: str) -> None:
    assert not re.search(r"\d", text), text
    for word in forbidden_words():
        assert word.casefold() not in text.casefold(), (word, text)
    assert "AL" not in text and "SAT" not in text and "TUT" not in text, text
    tokens = {t.casefold() for t in re.split(r"[^A-Za-zçğıöşüÇĞİÖŞÜ]+", text) if t}
    assert not tokens & {"al", "sat", "tut", "alım", "satım", "buy", "sell", "hold", "₺", "tl"}, text


def test_every_message_is_one_of_the_fixed_sentences() -> None:
    assert set(MESSAGES) == set(get_args(AlertKind))
    assert message_for("suggestion") == "KAPtan: yeni bir önerin var."
    assert message_for("day_halt") == "KAPtan: günlük zarar sınırına gelindi, yeni öneri durdu."
    assert message_for("stopped") == "KAPtan durduruldu."
    assert message_for("part_down") == "KAPtan: bir parça çalışmıyor."
    assert message_for("test") == "KAPtan: deneme bildirimi."


def test_events_map_to_kinds_by_their_state() -> None:
    cards = _load("approvals_all.json")
    pending = next(c for c in cards if c["status"] == "pending")
    decided = next(c for c in cards if c["status"] != "pending")
    risk = _load("risk_status.json")
    assert kind_for_event("approval.requested", pending) == "suggestion"
    assert kind_for_event("approval.requested", decided) is None
    assert kind_for_event("approval.decided", pending) is None
    assert kind_for_event("halt", {**risk, "halted_today": True}) == "day_halt"
    assert kind_for_event("halt", risk) is None  # the halt was lifted
    assert kind_for_event("kill_switch", {**risk, "kill_switch": "on"}) == "stopped"
    assert kind_for_event("kill_switch", risk) is None  # the restart
    assert kind_for_event("regime", risk) is None and kind_for_event("fill", {}) is None


def test_no_text_built_from_a_real_event_carries_a_signal() -> None:
    kinds = {kind_for_event(event, data) for event, data in realistic_events()} - {None}
    assert kinds == {"suggestion", "day_halt", "stopped"}
    assert len(forbidden_words()) >= 8  # the tickers and the company words of the fixture cards
    for kind in get_args(AlertKind):
        assert_carries_no_signal(message_for(kind))


@respx.mock
async def test_what_goes_over_the_wire_carries_no_signal(smtp: type[FakeSmtp]) -> None:
    """Every kind, both channels: the bytes that leave are the fixed sentence (plus the topic and the address)."""
    route = respx.post("https://ntfy.sh/").mock(return_value=httpx.Response(200, json={"id": "x"}))
    for event, data in realistic_events():
        kind = kind_for_event(event, data)
        if kind is None:
            continue
        await send_ntfy(NTFY, message_for(kind))
        await send_email(SMTP, message_for(kind), smtp=smtp)
    for kind in ("part_down", "test"):
        await send_ntfy(NTFY, message_for(kind))  # type: ignore[arg-type]
        await send_email(SMTP, message_for(kind), smtp=smtp)  # type: ignore[arg-type]
    assert route.call_count == len(smtp.sent) >= 5
    for call in route.calls:
        body = json.loads(call.request.content)
        assert set(body) == {"topic", "message"} and body["topic"] == TOPIC
        assert body["message"] in MESSAGES.values()
        assert_carries_no_signal(body["message"])
        assert TOPIC not in str(call.request.url)  # the topic never rides in a URL (URLs get logged)
    for msg in smtp.sent:
        assert msg["To"] == TO and msg["From"] == "deniz@example.org"
        text = f"{msg['Subject']} {msg.get_content()}"
        assert msg.get_content().strip() in MESSAGES.values()
        assert_carries_no_signal(text)


# ── configuration ─────────────────────────────────────────────────────────────


def test_nothing_configured_is_off() -> None:
    cfg = alert_config(settings())
    assert cfg == OFF and cfg.channels == () and cfg.invalid == ()
    blank = alert_config(settings(alert_ntfy_topic=SecretStr("  "), alert_smtp_host="", alert_smtp_to=" "))
    assert blank == OFF


def test_a_topic_alone_turns_the_phone_on_with_the_default_server() -> None:
    cfg = alert_config(settings(alert_ntfy_topic=SecretStr(TOPIC)))
    assert cfg.ntfy is not None and cfg.ntfy.url == "https://ntfy.sh/" and DEFAULT_NTFY_SERVER == "https://ntfy.sh"
    assert cfg.ntfy.topic.get_secret_value() == TOPIC and cfg.channels == ("ntfy",)
    assert TOPIC not in repr(cfg)
    empty_server = alert_config(settings(alert_ntfy_topic=SecretStr(TOPIC), alert_ntfy_server=""))
    assert empty_server.ntfy is not None and empty_server.ntfy.url == "https://ntfy.sh/"


@pytest.mark.parametrize(
    "server",
    [
        "http://ntfy.sh",  # not https
        "https://user:pw@ntfy.sh",  # credentials in the URL
        "https://ntfy.sh/some/path",
        "https://ntfy.sh/?x=1",
        "https://ntfy.sh/#frag",
        "https://10.0.0.5",
        "https://192.168.1.10:8443",
        "https://172.16.0.1",
        "https://127.0.0.1",
        "https://169.254.169.254",
        "https://[::1]",
        "https://[fd00::1]",
        "https://localhost",
        "https://ntfy.internal",
        "https://printer.local",
        "https://",
        "ftp://ntfy.sh",
        "ntfy.sh",
        "https://ntfy.sh:99999",
    ],
)
def test_an_unsafe_server_turns_the_phone_off_and_is_reported(server: str) -> None:
    cfg = alert_config(settings(alert_ntfy_topic=SecretStr(TOPIC), alert_ntfy_server=server))
    assert cfg.ntfy is None and cfg.invalid == ("ntfy",)


def test_localhost_is_allowed_outside_prod_only() -> None:
    test_env = Settings.model_construct(
        kaptan_env="test", alert_ntfy_topic=SecretStr(TOPIC), alert_ntfy_server="http://127.0.0.1:8080"
    )
    cfg = alert_config(test_env)
    assert cfg.ntfy is not None and cfg.ntfy.url == "http://127.0.0.1:8080/"
    lan = Settings.model_construct(
        kaptan_env="test", alert_ntfy_topic=SecretStr(TOPIC), alert_ntfy_server="http://192.168.1.10"
    )
    assert alert_config(lan).invalid == ("ntfy",)


@pytest.mark.parametrize("topic", ["kisa", "kaptan", "bosluk var burada 123456", "türkçe-harfli-konu-adı-1", "a" * 65])
def test_a_guessable_or_malformed_topic_is_refused(topic: str) -> None:
    cfg = alert_config(settings(alert_ntfy_topic=SecretStr(topic)))
    assert cfg.ntfy is None and cfg.invalid == ("ntfy",)


def test_smtp_needs_a_host_and_an_address() -> None:
    assert alert_config(settings(alert_smtp_host="smtp.example.org")).invalid == ("email",)
    assert alert_config(settings(alert_smtp_to=TO)).invalid == ("email",)
    cfg = alert_config(
        settings(
            alert_smtp_host="smtp.example.org",
            alert_smtp_user="deniz@example.org",
            alert_smtp_password=SecretStr(SMTP_PASSWORD),
            alert_smtp_to=TO,
        )
    )
    assert cfg.smtp == SMTP and cfg.channels == ("email",)
    assert SMTP_PASSWORD not in repr(cfg)


def test_smtp_details() -> None:
    def cfg(**over: Any) -> AlertConfig:
        return alert_config(settings(alert_smtp_host="smtp.example.org", alert_smtp_to=TO, **over))

    plain = cfg()
    assert plain.smtp is not None and plain.smtp.port == 587 and plain.smtp.user is None and plain.smtp.sender == TO
    tls = cfg(alert_smtp_port="465")
    assert tls.smtp is not None and tls.smtp.implicit_tls is True
    named = cfg(alert_smtp_user="deniz", alert_smtp_password=SecretStr(SMTP_PASSWORD))
    assert named.smtp is not None and named.smtp.user == "deniz" and named.smtp.sender == TO
    assert cfg(alert_smtp_port="abc").invalid == ("email",)
    assert cfg(alert_smtp_port="0").invalid == ("email",)
    assert cfg(alert_smtp_user="deniz").invalid == ("email",)  # a user without a password
    assert cfg(alert_smtp_password=SecretStr(SMTP_PASSWORD)).invalid == ("email",)
    for bad in ("deniz", "a@b", "a@b.org, c@d.org", "a@b.org\nBcc: x@y.org", "Deniz <a@b.org>"):
        assert alert_config(settings(alert_smtp_host="smtp.example.org", alert_smtp_to=bad)).invalid == ("email",)
    for host in ("smtp.example.org:587", "smtp://smtp.example.org", "10.0.0.7", "localhost", "smtp example"):
        assert alert_config(settings(alert_smtp_host=host, alert_smtp_to=TO)).invalid == ("email",)


def test_both_channels_and_one_broken() -> None:
    cfg = alert_config(
        settings(
            alert_ntfy_topic=SecretStr(TOPIC),
            alert_ntfy_server="http://ntfy.sh",
            alert_smtp_host="smtp.example.org",
            alert_smtp_to=TO,
        )
    )
    assert cfg.channels == ("email",) and cfg.invalid == ("ntfy",)


# ── the senders ───────────────────────────────────────────────────────────────


@respx.mock
async def test_ntfy_posts_json_to_the_root_and_does_not_follow_redirects() -> None:
    route = respx.post("https://ntfy.sh/").mock(return_value=httpx.Response(200, json={"id": "abc"}))
    await send_ntfy(NTFY, "KAPtan: deneme bildirimi.")
    request = route.calls.last.request
    assert json.loads(request.content) == {"topic": TOPIC, "message": "KAPtan: deneme bildirimi."}
    assert request.headers["content-type"] == "application/json"
    respx.post("https://ntfy.sh/").mock(return_value=httpx.Response(302, headers={"location": "https://evil.test/"}))
    with pytest.raises(AlertSendError) as moved:
        await send_ntfy(NTFY, "KAPtan: deneme bildirimi.")
    assert moved.value.reason == "http_302"


@respx.mock
async def test_ntfy_failures_never_name_the_topic(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    respx.post("https://ntfy.sh/").mock(return_value=httpx.Response(429, text=f"too many requests for {TOPIC}"))
    with pytest.raises(AlertSendError) as limited:
        await send_ntfy(NTFY, "KAPtan: deneme bildirimi.")
    respx.post("https://ntfy.sh/").mock(side_effect=httpx.ConnectTimeout(f"timed out reaching {TOPIC}"))
    with pytest.raises(AlertSendError) as timeout:
        await send_ntfy(NTFY, "KAPtan: deneme bildirimi.")
    assert limited.value.reason == "http_429" and timeout.value.reason == "ConnectTimeout"
    for exc in (limited.value, timeout.value):
        assert TOPIC not in str(exc) and TOPIC not in repr(exc)
        assert exc.__cause__ is None and exc.__context__ is None  # the original (URL, body) is not chained
    assert TOPIC not in caplog.text


def test_the_ntfy_client_has_a_timeout_and_ignores_the_environment() -> None:
    assert 0 < channels.NTFY_TIMEOUT_S <= 15 and 0 < channels.SMTP_TIMEOUT_S <= 30


async def test_email_uses_starttls_then_logs_in(smtp: type[FakeSmtp]) -> None:
    await send_email(SMTP, "KAPtan durduruldu.", smtp=smtp)
    assert smtp.log == ["connect smtp.example.org:587 timeout=15.0", "ehlo", "starttls", "ehlo", "login"]
    (msg,) = smtp.sent
    assert msg["Subject"] == "KAPtan durduruldu" and msg.get_content().strip() == "KAPtan durduruldu."


async def test_email_on_465_is_tls_from_the_first_byte_and_no_login_without_a_user(smtp: type[FakeSmtp]) -> None:
    target = SmtpTarget("smtp.example.org", 465, None, None, TO, TO, implicit_tls=True)
    await send_email(target, "KAPtan: deneme bildirimi.", smtp_ssl=smtp)
    assert smtp.log == ["connect smtp.example.org:465 timeout=15.0"] and len(smtp.sent) == 1


async def test_email_failures_are_one_plain_reason(smtp: type[FakeSmtp]) -> None:
    class NoTls(FakeSmtp):
        def starttls(self, *, context: Any) -> None:
            raise smtplib.SMTPNotSupportedError("STARTTLS extension not supported by server.")

    class BadLogin(FakeSmtp):
        def login(self, user: str, password: str) -> None:
            raise smtplib.SMTPAuthenticationError(535, f"bad credentials for {user} / {password}".encode())

    class Unreachable(FakeSmtp):
        def __init__(self, host: str, port: int, **kwargs: Any) -> None:
            raise OSError(f"cannot reach {host}")

    for fake, reason in (
        (NoTls, "SMTPNotSupportedError"),
        (BadLogin, "SMTPAuthenticationError"),
        (Unreachable, "OSError"),
    ):
        with pytest.raises(AlertSendError) as failed:
            await send_email(SMTP, "KAPtan durduruldu.", smtp=fake)
        assert failed.value.reason == reason
        assert SMTP_PASSWORD not in str(failed.value) and failed.value.__cause__ is None
    assert smtp.sent == []  # no TLS, no login: nothing was sent in the clear


# ── notify(): the limit, the record, the failures ─────────────────────────────


class Recorder:
    def __init__(self, fail: tuple[str, ...] = ()) -> None:
        self.sent: list[tuple[str, str]] = []
        self.fail = fail

    def senders(self) -> dict[str, Any]:
        def make(channel: str) -> Any:
            async def send(text: str) -> None:
                if channel in self.fail:
                    raise AlertSendError("http_500")
                self.sent.append((channel, text))

            return send

        return {"ntfy": make("ntfy"), "email": make("email")}


async def test_notify_sends_through_every_channel_and_records_when() -> None:
    redis, rec = FakeRedis(), Recorder()
    assert await notify(redis, BOTH, "suggestion", now=NOW, senders=rec.senders()) == "sent"
    assert rec.sent == [("ntfy", "KAPtan: yeni bir önerin var."), ("email", "KAPtan: yeni bir önerin var.")]
    assert await alert_settings(redis, BOTH) == {
        "ntfy": True,
        "email": True,
        "last_sent_at": "2026-11-19T09:00:00.000Z",
        "last_error_tr": None,
    }


async def test_at_most_one_message_per_kind_per_ten_minutes() -> None:
    redis, rec = FakeRedis(), Recorder()
    assert await notify(redis, BOTH, "suggestion", now=NOW, senders=rec.senders()) == "sent"
    assert await notify(redis, BOTH, "suggestion", now=NOW, senders=rec.senders()) == "rate_limited"
    assert await notify(redis, BOTH, "stopped", now=NOW, senders=rec.senders()) == "sent"  # another kind
    assert [text for _c, text in rec.sent].count("KAPtan: yeni bir önerin var.") == 2  # once per channel
    assert redis.ttl[service.rate_key("suggestion")] == 600 == service.RATE_S
    assert redis.ttl[service.rate_key("stopped")] == 600


async def test_nothing_configured_sends_nothing_and_takes_no_slot() -> None:
    redis, rec = FakeRedis(), Recorder()
    assert await notify(redis, OFF, "suggestion", now=NOW, senders=rec.senders()) == "off"
    assert rec.sent == [] and redis.values == {}
    assert await alert_settings(redis, OFF) == {
        "ntfy": False,
        "email": False,
        "last_sent_at": None,
        "last_error_tr": None,
    }


async def test_a_failed_channel_is_said_in_plain_turkish_and_the_other_still_sends(
    caplog: pytest.LogCaptureFixture,
) -> None:
    redis, rec = FakeRedis(), Recorder(fail=("ntfy",))
    with caplog.at_level(logging.WARNING, logger="kaptan.alerts"):
        assert await notify(redis, BOTH, "day_halt", now=NOW, senders=rec.senders()) == "sent"
    assert rec.sent == [("email", "KAPtan: günlük zarar sınırına gelindi, yeni öneri durdu.")]
    doc = await alert_settings(redis, BOTH)
    assert doc["last_error_tr"] == "Telefon bildirimi gönderilemedi." and doc["last_sent_at"] is not None
    assert "http_500" in caplog.text and TOPIC not in caplog.text and TO not in caplog.text
    both = Recorder(fail=("ntfy", "email"))
    assert await notify(redis, BOTH, "stopped", now=NOW, senders=both.senders()) == "failed"
    assert (await alert_settings(redis, BOTH))["last_error_tr"] == "Telefon bildirimi ve e-posta gönderilemedi."


async def test_the_next_success_clears_the_error() -> None:
    redis = FakeRedis()
    await notify(redis, BOTH, "suggestion", now=NOW, senders=Recorder(fail=("email",)).senders())
    assert (await alert_settings(redis, BOTH))["last_error_tr"] == "E-posta gönderilemedi."
    later = NOW + timedelta(minutes=11)
    assert await notify(redis, BOTH, "stopped", now=later, senders=Recorder().senders()) == "sent"
    assert await alert_settings(redis, BOTH) == {
        "ntfy": True,
        "email": True,
        "last_sent_at": "2026-11-19T09:11:00.000Z",
        "last_error_tr": None,
    }


async def test_a_wrong_setting_is_reported_without_a_send() -> None:
    redis = FakeRedis()
    broken = AlertConfig(ntfy=None, smtp=SMTP, invalid=("ntfy",))
    doc = await alert_settings(redis, broken)
    assert doc["ntfy"] is False and doc["email"] is True
    assert doc["last_error_tr"] == "Telefon bildirimi ayarı hatalı; kurulumu yeniden çalıştır."
    both_broken = AlertConfig(ntfy=None, smtp=None, invalid=("ntfy", "email"))
    assert (await alert_settings(redis, both_broken))["last_error_tr"] == (
        "Telefon bildirimi ayarı hatalı; kurulumu yeniden çalıştır. "
        "E-posta bildirimi ayarı hatalı; kurulumu yeniden çalıştır."
    )


async def test_an_error_of_a_channel_that_is_no_longer_configured_is_not_shown() -> None:
    redis = FakeRedis()
    await notify(redis, BOTH, "suggestion", now=NOW, senders=Recorder(fail=("email",)).senders())
    only_phone = AlertConfig(ntfy=NTFY, smtp=None, invalid=())
    assert (await alert_settings(redis, only_phone))["last_error_tr"] is None


async def test_notify_never_raises(caplog: pytest.LogCaptureFixture) -> None:
    async def explode(text: str) -> None:
        raise RuntimeError(f"a bug that mentions {TOPIC}")

    redis = FakeRedis()
    with caplog.at_level(logging.WARNING, logger="kaptan.alerts"):
        assert await notify(redis, BOTH, "suggestion", now=NOW, senders={"ntfy": explode, "email": explode}) == "failed"
        assert await notify(DownRedis(), BOTH, "suggestion", now=NOW, senders=Recorder().senders()) == "failed"
    assert TOPIC not in caplog.text
    assert await alert_settings(DownRedis(), BOTH) == {
        "ntfy": True,
        "email": True,
        "last_sent_at": None,
        "last_error_tr": None,
    }


@respx.mock
async def test_notify_with_the_real_senders_retries_ntfy_once(smtp: type[FakeSmtp], monkeypatch: Any) -> None:
    monkeypatch.setattr(service, "RETRY_WAIT_S", 0.0)
    monkeypatch.setattr(channels.smtplib, "SMTP", smtp)
    route = respx.post("https://ntfy.sh/").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json={"id": "ok"})]
    )
    redis = FakeRedis()
    assert await notify(redis, BOTH, "test", now=NOW) == "sent"
    assert route.call_count == 2 and len(smtp.sent) == 1
    assert (await alert_settings(redis, BOTH))["last_error_tr"] is None
