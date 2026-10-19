"""Reference data and point-in-time data jobs (M3 package A4). Each job is a plain coroutine on the
caller's connection (the caller commits; a pool connection commits on exit), so a scheduler only calls:

| Job | Function | Istanbul time (04 §4.1) |
|---|---|---|
| issuer profiles (sector, name) | `reference.profiles.run_issuer_profiles(conn, now, client=)` | Mon 07:30 |
| market changes (U1) | `reference.profiles.sync_market_changes(conn, now)` | daily 08:20 (before the universe) |
| universe + core.issuers | `reference.universe.run_universe(conn, day)` | weekdays 08:30 |
| tedbir / VBTS → R04 | `reference.tedbir.run_tedbir_sync(conn, now, bulletin=)` | every 30 min |
| intraday quotes (R09) | `prices.intraday.refresh_quotes(conn, tickers, now, client=)` | in session, every ≤ 4 min |
| intraday archive | `prices.intraday.run_intraday_archive(conn, day, client=)` | weekdays 19:00 |
| event returns | `reference.event_returns.run_event_returns(conn, day)` | weekdays 20:00 |
| fundamentals | `fundamentals.run_fundamentals(conn, now, client=)` | weekdays 20:30 |
| data quality | `dq.run_dq(conn, day)` | daily 21:00 |
| retention | `dq.run_retention(conn, now)` | daily 03:30 |

By hand: `uv run python -m kaptan.reference <job> [--day YYYY-MM-DD] [--tickers A,B] [--test]`.
"""

from kaptan.reference.event_returns import EventReturnsStats, run_event_returns
from kaptan.reference.profiles import run_issuer_profiles, sync_market_changes
from kaptan.reference.tedbir import TedbirStats, run_tedbir_sync, spk_bulletin_source
from kaptan.reference.ticker_history import add_rename, code_on, current_code, ticker_codes
from kaptan.reference.universe import UniverseStats, run_universe, universe_on

__all__ = [
    "EventReturnsStats",
    "TedbirStats",
    "UniverseStats",
    "add_rename",
    "code_on",
    "current_code",
    "run_event_returns",
    "run_issuer_profiles",
    "run_tedbir_sync",
    "run_universe",
    "spk_bulletin_source",
    "sync_market_changes",
    "ticker_codes",
    "universe_on",
]
