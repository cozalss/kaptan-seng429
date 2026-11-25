"""Why a day has no suggestion, in one honest sentence from the day's real counts.

Read = every KAP disclosure of the day; relevant = those KAPtan analysed (it ran on them); proposals = suggestions
created that day. The reasons are what the analysed ones ended in (a rule not met, a risk rule, the second look...),
counted from the stored runs. Nothing is said that the numbers do not show.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, time, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.disclosures.counters import day_counters
from kaptan.portfolio.shadow import run_reason
from kaptan.prices.calendar import IST
from kaptan.rules.format import fmt_int

RUNS_SQL: Final = """
SELECT r.kind, r.event_type, r.explain->'risk_checks' AS checks, r.explain->'compliance' AS compliance,
       r.explain->'rule_decision' AS rule_decision
  FROM trading.agent_runs r
 WHERE r.visible AND r.run_id NOT LIKE 'run-hist%%' AND r.kind NOT IN ('archived', 'pregate_veto')
   AND r.started_at >= %s AND r.started_at < %s
"""
RULE_TR: Final = {
    "E_RULE_NOT_MET": "olay KAPtan'ın aradığı ölçülere uymadı",
    "EDGE_BELOW_COST": "beklenen kazanç işlem masrafını karşılamıyordu",
    "EDGE_UNKNOWN": "kazanç ve masraf hesaplanamadığı için KAPtan bekledi",
    "SKEPTIC_VETO": "ikinci kontrol uygun bulmadı",
    "NO_EVIDENCE": "benzer geçmiş olaylardan yeterli kanıt yoktu",
    "AVOID_LIST": "hisse engel listendeydi",
    "LEAKAGE_SKIP": "haber fiyata zaten yansımıştı",
    "INJECTION_REVIEW": "metinde şüpheli bir yönlendirme vardı",
    "HOLD_AGENT_FAILED": "okuma güvenilir olmadığı için KAPtan bekledi",
    "HOLD_AGENT_ABSTAIN": "okuma güvenilir olmadığı için KAPtan bekledi",
    "HOLD_LOW_CONFIDENCE": "okuma güvenilir olmadığı için KAPtan bekledi",
    "HOLD_UNSUPPORTED_VETO": "okuma güvenilir olmadığı için KAPtan bekledi",
}
GATE_TR: Final = {
    "COMPLIANCE_VETO": "uyum kontrolü engelledi",
    "SKEPTIC_VETO": RULE_TR["SKEPTIC_VETO"],
    "R01": "zirveden düşüş sınırı yüzünden yeni alım yoktu",
    "R02": "günlük zarar sınırı yüzünden yeni alım yoktu",
    "R03": "hisse KAPtan'ın baktığı hisseler arasında değildi",
    "R04": "hisse işlem kısıtı altındaydı",
    "R13": "hisse engel listendeydi",
}
IGNORED: Final = "duyuru KAPtan'ın öneri verdiği olay türlerinden değildi"
OTHER: Final = "olay KAPtan'ın öneri ölçülerine uymadı"


def reason_of(row: dict[str, Any]) -> str:
    """The plain reason one analysed disclosure did not become a suggestion."""
    gate = run_reason(row["checks"], row["compliance"], row["rule_decision"])
    if gate is not None:
        return GATE_TR.get(gate[0], "risk kuralları geçmedi")
    for code in (row["rule_decision"] or {}).get("reason_codes") or []:
        if code in RULE_TR:
            return RULE_TR[code]
        if str(code).endswith("_RULE_NOT_MET"):
            return RULE_TR["E_RULE_NOT_MET"]
    if row.get("event_type") == "IGNORE":
        return IGNORED
    return OTHER


def sentence(read: int, relevant: int, proposals: int, reasons: list[tuple[str, int]], waiting: str | None) -> str:
    """The one sentence; `waiting` is the reason something waits (daily cap, no money yet), when known."""
    if read == 0:
        return "Bugün KAP'tan henüz yeni bildirim gelmedi."
    head = f"Bugün {fmt_int(read)} bildirim okundu"
    if proposals:
        return f"{head}; {fmt_int(proposals)} öneri çıktı."
    if relevant == 0:
        said = waiting.rstrip(".") if waiting else None
        tail = said[:1].lower() + said[1:] if said else "hiçbiri senin için ilgili değildi"
        return f"{head}; {tail}."
    tail = f"{fmt_int(relevant)} tanesine yakından bakıldı, hiçbiri öneriye dönüşmedi"
    top = f" En sık neden: {reasons[0][0]}." if reasons else ""
    return f"{head}; {tail}.{top}"


async def quiet_day(conn: AsyncConnection[Any], now: datetime, day: date) -> dict[str, Any]:
    counters = await day_counters(conn, now, day=day)
    start = datetime.combine(day, time(0, 0), IST)
    async with conn.cursor() as cur:
        await cur.execute(RUNS_SQL, (start, start + timedelta(days=1)))
        rows = [dict(r) for r in await cur.fetchall()]
    counted = Counter(reason_of(r) for r in rows if r["kind"] != "propose")
    reasons = counted.most_common()
    relevant = len(rows)
    waiting = counters.get("deferred_reason_tr") if counters["deferred"] else None
    return {
        "day": day,
        "read": counters["total"],
        "relevant": relevant,
        "proposals": counters["proposals"],
        "sentence_tr": sentence(counters["total"], relevant, counters["proposals"], reasons, waiting),
        "reasons": [{"reason_tr": r, "n": n} for r, n in reasons],
    }
