"""KAP `subject` → `subject_route` at ingest time (07 §2.2, subject_map.v1).

The E-routes come from the agent graph's own table (`kaptan.agents.subject_map`) so ingest and the
graph never disagree; ingest adds what the graph does not need: noise, avoid:* and archive_only.
Matching is on `norm_key(subject)` (KAP sometimes doubles spaces, e.g. "Pay  Satış Bilgi Formu").
Noise is decided by **subject**, not class: circuit breakers and insider trades share a class.
"""

from __future__ import annotations

from typing import Final

from kaptan.agents.subject_map import SUBJECT_MAP, TABLE_VERSION
from kaptan.text.turkish import norm_key

SUBJECT_MAP_VERSION: Final = TABLE_VERSION

_EXTRA: Final[dict[str, str]] = {
    "Pay Bazında Devre Kesici Bildirimi": "noise",
    "Devre Kesici Uygulanması": "noise",
    "Sermaye Piyasası Kurulu Tedbir Kararı": "avoid:spk_tedbir",
    # The Reader separates bonus-issue hype from dilutive rights issues (07 §2.2).
    "Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim": "llm",
}

_ROUTES: Final[dict[str, str]] = {
    **{norm_key(subject): route for subject, (route, _hint) in SUBJECT_MAP.items()},
    **{norm_key(subject): route for subject, route in _EXTRA.items()},
}

#: Subjects whose full text is fetched (E candidates + the free-text ÖDA the Classifier reads).
DETAIL_ROUTES: Final = frozenset({"E1", "E2", "E3", "E4", "llm"})


def route_for(subject: str) -> str:
    """noise | E1..E4 | llm | avoid:<name> | archive_only. Unknown subjects are archived, not dropped."""
    return _ROUTES.get(norm_key(subject), "archive_only")


def wants_detail(route: str) -> bool:
    return route in DETAIL_ROUTES
