"""Event-study and price-context parameters (06 §12 and §13 `event_study`, 05 §3 MarketSnapshot).

One place for every number the evidence tools use, so a change is one diff and the tests read the
same constants. Windows are in BIST sessions relative to the *event session* (06 §12.2).
"""

from __future__ import annotations

from datetime import time
from typing import Final

#: Benchmark of the market model: the BIST-100 price index (06 §12.1, 07 §6).
BENCHMARK: Final = "XU100"
#: Estimation window [−250, −30] sessions before the event session (06 §12.3, §13 `estimation`).
ESTIMATION_WINDOW: Final = (-250, -30)
#: Fewer valid estimation returns → market-adjusted model (α = 0, β = 1) (06 §12.3, §13 `min_obs`).
MIN_ESTIMATION_OBS: Final = 120
#: Default CAR horizons in sessions from the entry session t0 (06 §12.2 CAR[1,1], CAR[1,5], CAR[1,20]).
DEFAULT_HORIZONS: Final = (1, 5, 20)
#: Below this many independent past events the evidence is "insufficient": 06 §13 `precedent_min_n`,
#: `RuleParams.min_evidence_n` and `strength_for_n` (05) all use 5.
MIN_EVENTS: Final = 5
#: Repeated events of one company within this many sessions are one event (06 §12.3).
CLUSTER_SESSIONS: Final = 10
#: At most this many past events per scope are studied (newest first), to bound one run's SQL.
MAX_EVENTS: Final = 200
#: Corporate-action kinds whose ex-date is removed from the estimation window (06 §12.3).
EXCLUDED_ACTION_KINDS: Final = frozenset({"bedelsiz", "bedelli", "split"})

#: Event-session rule (06 §12.2): published before 09:40 → enter at that session's open;
#: 09:40–18:10 → enter at the next session's open; after 18:10 / holiday → the next session.
EARLY_CUTOFF: Final = time(9, 40)
LATE_CUTOFF: Final = time(18, 10)

#: Price context (05 MarketSnapshot): return look-backs in sessions, volatility/turnover window.
RETURN_LOOKBACKS: Final = (1, 5, 20)
RET_3M_SESSIONS: Final = 63
VOL_WINDOW: Final = 20
MIN_VOL_OBS: Final = 15
#: Leakage / run-up windows (06 §4): [−5, −1] and the E4 extra [−10, −1].
LEAK_SESSIONS: Final = 5
RUNUP_SESSIONS: Final = 10
#: A raw row older than this many sessions before the last known one is stale (no market cap from it).
STALE_SESSIONS: Final = 5
#: Corporate actions with an ex-date in the last N sessions are flagged as recent.
RECENT_ACTION_SESSIONS: Final = 20
#: Past events shown on the card / offered to the Evidence agent (05 §3: at most 40 candidates).
MAX_CARD_EVENTS: Final = 40
#: 95 % normal quantile for the CI of the mean CAR (05 names a bootstrap; a deterministic normal CI here).
Z95: Final = 1.959964
