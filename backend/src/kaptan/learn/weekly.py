"""The weekly learning pass ("Ne öğrendim") and the report GET /me/learning shows.

    doc = await run_pass(conn, now, mode="report")   # look and write the report; never change a rule
    doc = await run_pass(conn, now, mode="apply")    # also adopt the steps that pass every check (or, with
                                                     # "Kendi kendine öğrenme" off, record them as proposals)
    report = await learning_report(conn)             # LearningReport (latest pass + live change list)

One step per rule per week at most, never a step the person took back with "Geri al", never outside a rule's range.
The pool is sealed (`kaptan.learn.dataset`). The caller commits.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any, Final, Literal

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from kaptan.audit.writer import AuditDraft, append
from kaptan.domain.schemas._base import iso_ms
from kaptan.learn import calibration, rules_store
from kaptan.learn.dataset import Sample, load_pool
from kaptan.learn.estimators import CHOSEN, Obs, walk_forward
from kaptan.learn.tunables import BY_KEY, KIND_LABELS, PRIMARY_HORIZON, TUNABLES, Tunable
from kaptan.learn.tuning import Verdict, best_step, points, value_text
from kaptan.prices.calendar import IST
from kaptan.rules.format import ablative, dative, fmt_int

Conn = Any
Mode = Literal["report", "apply"]
WEEK: Final = timedelta(days=7)
ESTIMATOR_TR: Final = (
    "Bir olay türünün beklenen getirisini ortalama yerine ortanca ile ölçüyorum: birkaç aşırı yükselen ya da düşen "
    "hisse sonucu tek başına değiştirmesin diye. Bunu 2022'den öğrenip 2023'te sınayarak seçtim, 2024'te bir kez "
    "daha kontrol ettim."
)
SETTINGS_SQL: Final = "SELECT auto_apply FROM learn.settings WHERE id = 1"
SET_SETTINGS_SQL: Final = "UPDATE learn.settings SET auto_apply = %s, updated_at = %s WHERE id = 1"
RECENT_SQL: Final = """
SELECT 1 FROM learn.rule_versions WHERE rule = %s AND created_at > %s AND status IN ('active', 'superseded', 'proposed')
 LIMIT 1
"""
SAVE_SQL: Final = """
INSERT INTO learn.reports (week, mode, created_at, takeaway_tr, telegram_tr, doc) VALUES (%s, %s, %s, %s, %s, %s)
"""
LATEST_SQL: Final = "SELECT * FROM learn.reports ORDER BY created_at DESC, id DESC LIMIT 1"
REVERTED_BY_SQL: Final = "SELECT reverts FROM learn.rule_versions WHERE origin = 'revert'"


async def _rows(conn: Conn, sql: str, params: Any = ()) -> list[dict[str, Any]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        return list(await cur.fetchall())


async def auto_apply(conn: Conn) -> bool:
    rows = await _rows(conn, SETTINGS_SQL)
    return True if not rows else bool(rows[0]["auto_apply"])


async def set_auto_apply(conn: Conn, on: bool, now: datetime, actor: str) -> None:
    async with conn.transaction():
        await conn.execute(SET_SETTINGS_SQL, (on, now))
        await append(
            conn, [AuditDraft(actor, "learn.settings_changed", "learn", "settings", {"auto_apply": on})], now=now
        )


def kind_rows(pool: Sequence[Sample]) -> list[dict[str, Any]]:
    out = []
    for kind, horizon in PRIMARY_HORIZON.items():
        nets = [s.net for s in pool if s.kind == kind]
        out.append(
            {
                "kind": kind, "label_tr": KIND_LABELS[kind], "n": len(nets), "horizon_days": horizon,
                "hit_rate": sum(1 for x in nets if x > 0) / len(nets) if nets else None,
                "mean_net": math.fsum(nets) / len(nets) if nets else None,
                "median_net": statistics.median(nets) if nets else None,
            }
        )  # fmt: skip
    return out


def change_sentence(t: Tunable, v: Verdict, applied: bool) -> str:
    """ "KAPtan bu hafta geri alım eşiğini %0,25'ten %0,2'ye indirdi; geçmiş testte ... +0,4 puan arttı." No money:
    a TL threshold is named without its amount (the line may go to the phone)."""
    assert v.candidate is not None and v.gain is not None
    down = v.candidate < v.current
    gain = points(v.gain)
    step = "" if t.unit == "try" else f" {ablative(value_text(t, v.current))} {dative(value_text(t, v.candidate))}"
    if applied:
        verb = ("düşürdü" if t.unit == "try" else "indirdi") if down else "yükseltti"
        return f"KAPtan bu hafta {t.noun_tr}{step} {verb}; geçmiş testte karar başına net getiri {gain} puan arttı."
    verb = ("düşürmeyi" if t.unit == "try" else "indirmeyi") if down else "yükseltmeyi"
    return (
        f"KAPtan bu hafta {t.noun_tr}{step} {verb} önerdi; geçmiş testte karar başına net getiri {gain} puan "
        "artıyordu. Kendi kendine öğrenme kapalı olduğu için uygulamadım."
    )


async def _verdicts(conn: Conn, pool: Sequence[Sample], now: datetime) -> list[tuple[Tunable, Verdict, str | None]]:
    """(tunable, verdict, why it is held back although it passed: None = may be applied)."""
    current = rules_store.params_from(await rules_store.active_overrides(conn))
    taken_back = await rules_store.reverted_steps(conn)
    out: list[tuple[Tunable, Verdict, str | None]] = []
    for t in TUNABLES:
        value = float(getattr(current, t.key))
        if await _rows(conn, RECENT_SQL, (t.key, now - WEEK)):
            out.append((t, Verdict(t, value, None, False, "Bu kural son bir haftada zaten değişti."), None))
            continue
        v = best_step(t, value, pool)
        held = None
        if v.adopt and v.candidate is not None and (t.key, v.candidate) in taken_back:
            held = "Bu değişikliği daha önce geri almıştın; kendiliğinden yeniden uygulamam."
        out.append((t, v, held))
    return out


async def run_pass(conn: Conn, now: datetime, *, mode: Mode) -> dict[str, Any]:
    pool = await load_pool(conn, now)
    apply_on = await auto_apply(conn)
    changes: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    lines: list[str] = []
    for t, v, held in await _verdicts(conn, pool, now):
        if not v.adopt or v.candidate is None or held is not None:
            rejected.append(_rejected(t, v, held))
            continue
        applied = mode == "apply" and apply_on
        sentence = change_sentence(t, v, applied)
        lines.append(sentence)
        if mode == "apply":
            change = rules_store.Change(t.key, v.current, v.candidate, sentence, v.evidence)
            version = await rules_store.record_change(conn, change, now, apply=applied)
            changes.append({"version": version, "rule": t.key, "applied": applied, **v.evidence})
        else:
            rejected.append(_rejected(t, v, "Yalnızca rapor: bu geçişte kural değiştirilmedi."))
    takeaway = lines[0] if lines else _quiet_takeaway(pool)
    doc = {
        "kinds": kind_rows(pool),
        "rejected": rejected,
        "applied": changes,
        "folds": [_fold(f) for f in walk_forward(_obs(pool))],
        "pool_n": len(pool),
        "estimator": CHOSEN,
    }
    telegram = lines[0] if lines and mode == "apply" else None
    week = now.astimezone(IST).date()
    await conn.execute(SAVE_SQL, (week, mode, now, takeaway, telegram, Jsonb(doc)))
    return {**doc, "takeaway_tr": takeaway, "telegram_tr": telegram}


def _obs(pool: Sequence[Sample]) -> list[Obs]:
    return [Obs(s.kind, s.ticker, s.published_at, s.car) for s in pool if s.source == "archive"]


def _fold(f: Any) -> dict[str, Any]:
    return {"kind": f.kind, "fold": f.fold, "n_train": f.n_train, "n_val": f.n_val, "error_ratio": f.error_ratio}


def _rejected(t: Tunable, v: Verdict, why: str | None) -> dict[str, Any]:
    return {
        "rule": t.key, "label_tr": t.label_tr, "unit": t.unit, "current": v.current, "candidate": v.candidate,
        "reason_tr": why or v.reason_tr,
    }  # fmt: skip


def _quiet_takeaway(pool: Sequence[Sample]) -> str:
    if not pool:
        return "Henüz öğrenecek kadar olgunlaşmış olay yok."
    return (
        f"Bu hafta {fmt_int(len(pool))} geçmiş olaya yeniden baktım; hiçbir eşik bütün sınamaları geçmedi, "
        "kuralları olduğu gibi bıraktım."
    )


# ── GET /me/learning ──────────────────────────────────────────────────────────


def _status(row: dict[str, Any], reverted: set[int]) -> str:
    if row["status"] == "proposed":
        return "proposed"
    return "reverted" if int(row["version"]) in reverted else "applied"


async def change_list(conn: Conn) -> list[dict[str, Any]]:
    rows = [r for r in await rules_store.history(conn, 200) if r["origin"] == "learn"]
    reverted = {int(r["reverts"]) for r in await _rows(conn, REVERTED_BY_SQL) if r["reverts"] is not None}
    latest: dict[str, int] = {}
    for r in await rules_store.history(conn, 500):
        if r["status"] in ("active", "superseded"):
            latest.setdefault(str(r["rule"]), int(r["version"]))
    out = []
    for r in rows:
        t = BY_KEY.get(str(r["rule"]))
        if t is None:
            continue
        ev, status = dict(r["evidence"] or {}), _status(r, reverted)
        out.append(
            {
                "version": int(r["version"]), "rule": t.key, "label_tr": t.label_tr, "unit": t.unit,
                "from_value": float(r["from_value"]), "to_value": float(r["to_value"]), "at": iso_ms(r["created_at"]),
                "status": status, "reason_tr": r["reason_tr"], "gain_bps": float(ev.get("gain_bps") or 0),
                "ci_low_bps": float(ev.get("ci_low_bps") or 0), "ci_high_bps": float(ev.get("ci_high_bps") or 0),
                "n": int(ev.get("n") or 0),
                "can_revert": status == "applied" and latest.get(t.key) == int(r["version"]),
            }
        )  # fmt: skip
    return out


def _calibration_doc(f: calibration.Fit) -> dict[str, Any]:
    return {
        "n_matured": f.n, "needed": calibration.MIN_MATURED, "slope": f.slope, "bias_bps": f.bias_bps,
        "factor": f.factor, "active": f.active,
    }  # fmt: skip


async def learning_report(conn: Conn) -> dict[str, Any]:
    latest = await _rows(conn, LATEST_SQL)
    doc = dict(latest[0]["doc"]) if latest else {}
    fits = await calibration.fits(conn)
    by_kind = {k["kind"]: k for k in doc.get("kinds", [])}
    kinds = []
    for kind, horizon in PRIMARY_HORIZON.items():
        base = by_kind.get(kind) or {
            "kind": kind, "label_tr": KIND_LABELS[kind], "n": 0, "horizon_days": horizon, "hit_rate": None,
            "mean_net": None, "median_net": None,
        }  # fmt: skip
        kinds.append({**base, "calibration": _calibration_doc(fits[kind])})
    return {
        "generated_at": iso_ms(latest[0]["created_at"]) if latest else None,
        "auto_apply": await auto_apply(conn),
        "takeaway_tr": latest[0]["takeaway_tr"] if latest else None,
        "estimator_tr": ESTIMATOR_TR,
        "kinds": kinds,
        "changes": await change_list(conn),
        "rejected": doc.get("rejected", []),
        "folds": doc.get("folds", []),
    }


UNTOLD_SQL: Final = """
SELECT id, telegram_tr FROM learn.reports
 WHERE telegram_tr IS NOT NULL AND told_at IS NULL AND created_at > %s AND created_at <= %s
 ORDER BY created_at DESC, id DESC LIMIT 1
"""
TOLD_SQL: Final = "UPDATE learn.reports SET told_at = %s WHERE id = %s"


async def telegram_line(conn: Conn, now: datetime) -> tuple[int, str] | None:
    """This week's one learning line for the Friday message, not yet sent (None: nothing changed or proposed)."""
    rows = await _rows(conn, UNTOLD_SQL, (now - WEEK, now))
    return None if not rows else (int(rows[0]["id"]), str(rows[0]["telegram_tr"]))


async def mark_told(conn: Conn, report_id: int, now: datetime) -> None:
    await conn.execute(TOLD_SQL, (now, report_id))
