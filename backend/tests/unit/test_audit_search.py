"""kaptan.audit.search vs the panel's audit-words.ts (auditSentence / auditMatches)."""

from __future__ import annotations

import json
import subprocess
from functools import cache
from typing import Any

import pytest

from kaptan.audit.search import actor_parts, audit_matches, audit_sentence, title_tr, tr_lower, tr_upper
from tests.contract.harness import CONTRACT_DIR
from tests.harness.fixtures import DemoFixtures


@cache
def issuers() -> dict[str, str]:
    return {i["ticker"]: i["name"] for i in DemoFixtures().json("issuers.json")}


def _entry(action: str, actor: str, payload: dict[str, Any], pos: int = 1, entity_id: str = "x") -> dict[str, Any]:
    return {
        "seq": pos,
        "chain_pos": pos,
        "occurred_at": "2027-01-11T10:40:00.000Z",
        "actor": actor,
        "action": action,
        "entity_type": "trade_proposal",
        "entity_id": entity_id,
        "run_id": None,
        "strategy_version": None,
        "payload": payload,
        "prev_hash": "00",
        "hash": "0" * 64,
    }


SYNTHETIC: list[dict[str, Any]] = [
    _entry(
        "approval.decided", "user:sahip", {"ticker": "ORNEK", "company": "ÖRNEK ENERJİ A.Ş.", "decision": "approve"}, 1
    ),
    _entry("approval.decided", "user:sahip", {"ticker": "ORNEK", "decision": "reject", "role": "risk_officer"}, 2),
    _entry("order.filled", "system:simbist", {"ticker": "ORNEK", "company": "ÖRNEK ENERJİ A.Ş.", "qty": 620}, 3),
    _entry("order.filled", "system:simbist", {}, 4),
    _entry("kill_switch.on", "system:risk_monitor", {"reason": "Zirveden −%5 düşüş (R01)"}, 5),
    _entry("kill_switch.on", "user:sahip", {"reason": "Test", "role": "risk_officer"}, 6),
    _entry("demo.injected", "user:sahip", {"scenario": "e3_contract", "ticker": "ORNEK", "fixture": True}, 7),
    _entry("demo.injected", "user:sahip", {"fixture": True}, 8, entity_id="loss_simulation"),
    _entry("audit.verified", "user:sahip", {}, 9),
    _entry("ticket.unfilled", "user:sahip", {}, 10),
    _entry("something.unknown", "agent:request_approval", {"ticker": "ZZZZZ", "ratio": 0.5}, 11),
    _entry("note.added", "user:stranger", {"ticker": "ZZZZZ"}, 12),
    _entry("risk.halted", "system:custom_job", {"daily_pnl_pct": -0.0112}, 13),
    _entry("limits.proposed", "sahip", {"key": "risk_per_trade_pct", "from": 0.005, "to": 0.004}, 14),
]

QUERIES = [
    "örnek",
    "ÖRNEK",
    "Onayladın",
    "#3907",
    "#3.907",
    "#7",
    "  bankana ",
    "şüpheci",
    "KAPtan",
    "gece kontrolü",
    "zarar simülasyonu",
    "fixture",
    '"qty":620',
    "ızmir",
    "e3_contract",
    "1651350",
    "nope-nothing",
    "",
]


def test_turkish_case_helpers() -> None:
    assert tr_lower("İZMİR IŞIK") == "izmir ışık"
    assert tr_upper("izmir ışık") == "İZMİR IŞIK"
    assert title_tr("DOĞU ENERJİ ÜRETİM A.Ş.") == "Doğu Enerji Üretim A.Ş."
    assert title_tr("İZMİR  (BORSA)") == "İzmir  (Borsa)"


def test_actor_parts() -> None:
    assert actor_parts("user:sahip") == ("Sen", "")
    assert actor_parts("user:uye-3") == ("Sen", "")  # an old record: there was only ever one reader of it
    assert actor_parts("agent:skeptic") == ("KAPtan", "Şüpheci")
    assert actor_parts("agent:mystery") == ("KAPtan", "")
    assert actor_parts("system:risk_monitor") == ("KAPtan", "para kuralları")
    assert actor_parts("system:custom_job") == ("KAPtan", "")
    assert actor_parts("auth") == ("KAPtan", "giriş")
    assert actor_parts(None) == ("—", "")


def test_sentences_and_matches() -> None:
    iss = issuers()
    assert audit_sentence(SYNTHETIC[0], iss) == "Örnek Enerji önerisini onayladın."
    assert audit_sentence(SYNTHETIC[1], iss) == "Örnek Enerji önerisini reddettin."
    assert audit_sentence(SYNTHETIC[2], iss) == "Örnek Enerji için 620 adet alış gerçekleşti (deneme hesabı)."
    assert audit_sentence(SYNTHETIC[3], iss) == "Alış gerçekleşti (deneme hesabı)."
    assert audit_sentence(SYNTHETIC[7], iss) == "Deneme olayı eklendi: zarar simülasyonu."
    assert audit_sentence(SYNTHETIC[10], iss) == "KAPtan bir işlem yaptı."
    assert audit_sentence(_entry("something.unknown", "user:sahip", {}), iss) == "Bir işlem yaptın."
    assert audit_matches(SYNTHETIC[6], "#7", iss)
    assert not audit_matches(SYNTHETIC[6], "#8", iss)
    assert audit_matches(SYNTHETIC[0], "   ", iss)
    assert audit_matches(SYNTHETIC[0], "ONAYLADIN", iss)
    assert audit_matches(SYNTHETIC[2], '"qty":620', iss)
    assert not audit_matches(SYNTHETIC[2], "#.", iss)


def test_waiver_and_ticket_sentences() -> None:
    iss = issuers()
    waiver = _entry("auth.single_user_waiver", "user:sahip", {"flow": "kill_reset"})
    assert audit_sentence(waiver, iss) == "Yeniden başlatmayı tek başına onayladın; bu da kayda geçti."
    other = _entry("auth.single_user_waiver", "user:sahip", {"flow": "new_flow"})
    assert audit_sentence(other, iss) == "Bu adımı tek başına onayladın; bu da kayda geçti."
    named = _entry("ticket.issued", "system:order_ticket", {"ticker": "ORNEK", "company": "ÖRNEK ENERJİ A.Ş."})
    assert audit_sentence(named, iss) == "Örnek Enerji için bankana gireceğin işlem hazırlandı."
    bare = _entry("ticket.issued", "system:order_ticket", {})
    assert audit_sentence(bare, iss) == "Bankana gireceğin işlem hazırlandı."
    qty = _entry("ticket.issued", "system:order_ticket", {"qty": 620, "side": "buy"})
    assert audit_sentence(qty, iss) == "620 adetlik alış işlem hazırlandı."
    no_side = _entry("ticket.issued", "system:order_ticket", {"qty": 620})
    assert audit_sentence(no_side, iss) == "620 adetlik işlem hazırlandı."
    wait = _entry("kill_switch.wait_waived", "user:sahip", {"flow": "kill_reset"})
    assert audit_sentence(wait, iss) == "Yeniden başlatma için beklemedin (deneme); bu da kayda geçti."


def _oracle(entries: list[dict[str, Any]], queries: list[str]) -> dict[str, Any]:
    proc = subprocess.run(
        ["node", str(CONTRACT_DIR / "audit_words_oracle.mjs")],
        input=json.dumps({"entries": entries, "queries": queries}, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:])
    data: dict[str, Any] = json.loads(proc.stdout)
    return data


@pytest.mark.node
@pytest.mark.usefixtures("require_node")
def test_sentences_and_search_match_the_panel() -> None:
    """Every fixture ledger record plus synthetic edge cases: same sentence, same search hits."""
    entries = [*DemoFixtures().audit, *SYNTHETIC]
    # Synthetic positions must not collide with the fixture's for the hit lists.
    entries = [*entries[: -len(SYNTHETIC)], *({**e, "chain_pos": 10_000 + e["chain_pos"]} for e in SYNTHETIC)]
    node = _oracle(entries, QUERIES)
    iss: dict[str, str] = {}  # the panel has no issuer list of its own: a bare ticker stays a code on both sides
    mine = [audit_sentence(e, iss) for e in entries]
    diffs = [(i, a, b) for i, (a, b) in enumerate(zip(mine, node["sentences"], strict=True)) if a != b]
    assert not diffs, diffs[:5]
    for q in QUERIES:
        hits = [e["chain_pos"] for e in entries if audit_matches(e, q, iss)]
        assert hits == node["matches"][q], q
