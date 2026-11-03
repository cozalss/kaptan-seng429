"""Package C reads: /audit, /audit/verify, /disclosures/counters (parity with the mock at 13:40)."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from tests.conftest import bearer, login
from tests.contract.harness import assert_matches
from tests.harness.fixtures import FIXTURE_DIR, DemoFixtures

pytestmark = pytest.mark.integration


def expected(name: str) -> Any:
    return json.loads((FIXTURE_DIR / "expected" / name).read_text(encoding="utf-8"))


async def _get(client: httpx.AsyncClient, path: str) -> httpx.Response:
    session = await login(client)
    return await client.get(f"{API_PREFIX}{path}", headers=bearer(session["access_token"]))


async def test_counters_count_the_day(client: httpx.AsyncClient) -> None:
    res = await _get(client, "/disclosures/counters")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("DayCounters", body)
    fixtures = DemoFixtures()
    day = [*fixtures.json("disclosures.json"), *fixtures.json("demo_disclosures.json")]
    assert body["total"] == len(day)
    assert body["noise"] == sum(1 for d in day if d["is_noise"])
    assert body["processed"] == sum(1 for d in day if d["run_id"] is not None)
    want = expected("counters.json")
    rest = ("proposals", "approvals", "rejections", "llm_calls")
    assert {k: body[k] for k in rest} == {k: want[k] for k in rest}
    assert body["as_of"].startswith("2027-01-11T10:")


async def test_audit_all_newest_first(client: httpx.AsyncClient) -> None:
    res = await _get(client, "/audit?scope=all&limit=10")
    assert res.status_code == 200
    page = res.json()
    assert_matches("AuditPage", page)
    length = DemoFixtures().meta["audit_base_length"]
    assert page["length"] >= length
    assert page["total"] == page["length"]
    assert [e["chain_pos"] for e in page["items"]] == list(range(page["length"], page["length"] - 10, -1))
    assert "tamper_on" not in page
    fixture_head = DemoFixtures().audit[-1]
    if page["length"] == length:
        assert page["items"][0] == {**fixture_head, "payload": fixture_head["payload"]}


async def test_audit_today_and_search(client: httpx.AsyncClient) -> None:
    fx = DemoFixtures().audit
    today = [e for e in fx if e["occurred_at"] >= "2027-01-10T21:00:00.000Z"]
    res = await _get(client, "/audit?scope=today&limit=500")
    page = res.json()
    assert page["total"] >= len(today)
    assert all(e["occurred_at"] >= "2027-01-10T21:00:00.000Z" for e in page["items"])

    hit = (await _get(client, "/audit?scope=all&q=%233.907")).json()
    assert [e["chain_pos"] for e in hit["items"]] == [3907]
    assert hit["total"] == 1

    words = (await _get(client, "/audit?scope=all&q=önerisini%20onayladın&limit=2")).json()
    assert words["total"] >= 1
    assert len(words["items"]) <= 2
    assert all(e["action"] == "approval.decided" for e in words["items"])

    blank = (await _get(client, "/audit?scope=all&q=%20%20&limit=3")).json()
    assert blank["total"] == blank["length"]


async def test_audit_query_validation(client: httpx.AsyncClient) -> None:
    long_q = "x" * 101
    res = await _get(client, f"/audit?q={long_q}")
    assert res.status_code == 422
    assert res.json() == {"detail": "Arama en çok 100 karakter", "code": "validation"}
    assert (await _get(client, "/audit?limit=0")).status_code == 422


async def test_verify_fresh_chain(client: httpx.AsyncClient) -> None:
    session = await login(client)
    res = await client.post(f"{API_PREFIX}/audit/verify", headers=bearer(session["access_token"]))
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("ChainVerifyResult", body)
    assert body["ok"] is True
    assert body["first_bad_pos"] is None
    assert body["kind"] is None
    page = (await _get(client, "/audit?scope=all&limit=1")).json()
    assert body["checked"] == page["length"]
    assert body["head_hash"] == page["items"][0]["hash"]
    # Verifying writes nothing to the chain.
    assert (await _get(client, "/audit?scope=all&limit=1")).json()["length"] == page["length"]
