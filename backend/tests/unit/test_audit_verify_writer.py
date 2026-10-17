"""verify_chain() failure kinds and the pure part of the writer."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

from kaptan.audit.canonical import ChainFields
from kaptan.audit.verify import Anchor, StoredEntry, verify_chain
from kaptan.audit.writer import AuditDraft, chain_entries, insert_params, user_actor

NOW = datetime(2027, 1, 11, 10, 40, 0, 123456, tzinfo=UTC)


def _chain(n: int = 5) -> list[StoredEntry]:
    drafts = [
        AuditDraft(
            actor="user:uye-3",
            action="note.added",
            entity_type="trade_proposal",
            entity_id=f"p-{i}",
            payload={"i": i, "ticker": "ORNEK"},
            run_id=f"run-{i}",
            strategy_version="v1.1-fwd",
        )
        for i in range(n)
    ]
    return chain_entries(drafts, last_pos=0, last_hash=None, now=NOW)


def test_chain_entries_link_and_truncate_to_milliseconds() -> None:
    chain = _chain(3)
    assert [e.chain_pos for e in chain] == [1, 2, 3]
    assert [e.seq for e in chain] == [1, 2, 3]
    assert chain[0].prev_hash == "00"
    assert chain[1].prev_hash == chain[0].hash
    assert chain[0].fields.occurred_at == "2027-01-11T10:40:00.123Z"
    assert verify_chain(chain, "now")["ok"] is True


def test_chain_entries_continue_an_existing_chain() -> None:
    first = _chain(2)
    more = chain_entries([AuditDraft("system:x", "a.b", "e", "1")], last_pos=2, last_hash=first[-1].hash, now=NOW)
    assert more[0].chain_pos == 3
    assert verify_chain([*first, *more], "now")["ok"] is True


def test_tampered_payload_is_a_hash_mismatch_at_its_position() -> None:
    chain = _chain(5)
    bad = chain[2]
    chain[2] = replace(bad, fields=replace(bad.fields, payload={**bad.fields.payload, "kurcalandi": True}))
    result = verify_chain(chain, "2027-01-11T10:41:00.000Z")
    assert result == {
        "ok": False,
        "first_bad_pos": 3,
        "kind": "hash_mismatch",
        "checked": 2,
        "head_hash": chain[-1].hash,
        "verified_at": "2027-01-11T10:41:00.000Z",
        "anchor": None,
    }


def test_gap_and_prev_hash_failures() -> None:
    chain = _chain(4)
    gap = [chain[0], chain[2], chain[3]]
    assert verify_chain(gap, "t")["kind"] == "gap_or_duplicate"
    assert verify_chain(gap, "t")["first_bad_pos"] == 2
    relinked = list(chain)
    relinked[1] = replace(chain[1], prev_hash="f" * 64)
    result = verify_chain(relinked, "t")
    assert (result["kind"], result["first_bad_pos"]) == ("prev_hash_mismatch", 2)


def test_anchor_mismatch_and_match() -> None:
    chain = _chain(3)
    good = Anchor(at="2027-01-10T21:00:00.000Z", chain_pos=2, hash=chain[1].hash)
    assert verify_chain(chain, "t", good)["ok"] is True
    assert verify_chain(chain, "t", good)["anchor"] == {"at": good.at, "chain_pos": 2, "hash": chain[1].hash}
    bad = Anchor(at=good.at, chain_pos=2, hash="0" * 64)
    result = verify_chain(chain, "t", bad)
    assert (result["ok"], result["kind"], result["first_bad_pos"]) == (False, "anchor_mismatch", 2)


def test_empty_chain_is_ok_with_genesis_head() -> None:
    assert verify_chain([], "t") == {
        "ok": True,
        "first_bad_pos": None,
        "kind": None,
        "checked": 0,
        "head_hash": "00",
        "verified_at": "t",
        "anchor": None,
    }


def test_stored_entry_to_api_and_insert_params() -> None:
    e = _chain(1)[0]
    api = e.to_api()
    assert api["seq"] == api["chain_pos"] == 1
    assert api["payload"] == {"i": 0, "ticker": "ORNEK"}
    params = insert_params(e)
    assert params[2] == datetime(2027, 1, 11, 10, 40, 0, 123000, tzinfo=UTC)
    assert params[-1] == e.hash
    assert user_actor("uye-3") == "user:uye-3"


def test_chain_fields_are_immutable() -> None:
    f = ChainFields(1, "t", "a:b", "x.y", "e", "1", None, None, {})
    try:
        f.chain_pos = 2  # type: ignore[misc]
    except AttributeError:
        return
    raise AssertionError("ChainFields should be frozen")
