"""Record the offline price fixtures once (≈ 11 polite requests to İş Yatırım + Yahoo, no keys).

    uv run python -m tests.fixtures.prices.record

Windows (chosen for what they exercise):
- THYAO 2026-07..09 (liquid; 15 July holiday),
- FROTO 2025-04..06 (10:1 bedelsiz on 2025-05-07, Kurban Bayramı 6–9 June 2025 → Yahoo zero-volume rows),
- XU100 for both windows (İş Yatırım's stock endpoint answers empty → Yahoo adjusted series),
- TRKCM 2020-01..03 (merged into ŞİŞE in 2020: İş Yatırım still serves it, Yahoo answers 404),
plus XU100 2018-01-01 … 2026-10-16 reduced to its session dates (calendar check).
"""

from __future__ import annotations

import json
from datetime import date, datetime

from tests.fixtures.prices.cassette import CASSETTE, SESSIONS, WINDOWS, RecordingTransport

from kaptan.api.loop import run
from kaptan.prices import yahoo
from kaptan.prices.calendar import IST
from kaptan.prices.http import PoliteClient, make_http_client
from kaptan.prices.ingest import fetch_ticker

SESSIONS_FROM = date(2018, 1, 1)
SESSIONS_TO = date(2026, 10, 16)


async def _sessions(client: PoliteClient) -> dict[str, list[str]]:
    params = {
        "period1": str(yahoo._epoch(SESSIONS_FROM)),
        "period2": str(yahoo._epoch(SESSIONS_TO)),
        "interval": "1d",
    }
    payload = await client.get_json(yahoo.URL.format(symbol="XU100.IS"), params=params)
    result = payload["chart"]["result"][0]
    volumes = result["indicators"]["quote"][0]["volume"]

    days = [
        (datetime.fromtimestamp(ts, IST).date().isoformat(), v)
        for ts, v in zip(result["timestamp"], volumes, strict=True)
    ]
    return {
        "source": f"Yahoo XU100.IS daily, {SESSIONS_FROM} .. {SESSIONS_TO}, recorded {date.today()}",
        "sessions": [d for d, v in days if v],
        "zero_volume": [d for d, v in days if not v],
    }


async def main() -> None:
    recorder = RecordingTransport()
    async with make_http_client(transport=recorder) as http:
        client = PoliteClient(http, min_interval_s=2.0)
        for ticker, start, end in WINDOWS:
            fetched = await fetch_ticker(client, ticker, start, end)
            n_raw, n_adj, n_ca = len(fetched.raw), len(fetched.adjusted), len(fetched.actions)
            print(f"{ticker} {start}..{end}: raw={n_raw} adjusted={n_adj} actions={n_ca}")
        sessions = await _sessions(client)
    entries = [e for e in recorder.entries if "XU100.IS" not in e["key"] or "events=" in e["key"]]
    CASSETTE.write_text(json.dumps({"entries": entries}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    SESSIONS.write_text(json.dumps(sessions, indent=1) + "\n", encoding="utf-8")
    print(
        f"{len(recorder.entries)} requests; cassette {CASSETTE.stat().st_size} B, sessions {len(sessions['sessions'])}"
    )


if __name__ == "__main__":
    run(main())
