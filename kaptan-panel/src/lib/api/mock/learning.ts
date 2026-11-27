import type { LearningChange, LearningReport } from "@/lib/domain/learning";
import { ApiError, type KaptanApi } from "../types";
import type { MockCtx } from "./guard";
import { userActor } from "./guard";
import type { MockState } from "./state";

/**
 * The test double of /me/learning (backend kaptan.api.routers.learning, kaptan.learn): one weekly pass that changed
 * the buyback threshold one step and left the others alone, each with its reason. Same refusals as the backend: a
 * change that is not applied, or not the latest of its rule, cannot be undone (409); an unknown version is 404.
 */
export interface MockLearning {
  auto_apply: boolean;
  /** Versions undone with "Geri al". */
  reverted: number[];
}

export function initialLearning(): MockLearning {
  return { auto_apply: true, reverted: [] };
}

export function learningOf(state: MockState): MockLearning {
  return { ...initialLearning(), ...(state.learning ?? {}) };
}

const PASS_AT = "2026-11-27T15:45:00.000Z";

const BASE_CHANGES: readonly LearningChange[] = [
  {
    version: 2,
    rule: "e1_capital_10d_min",
    label_tr: "Geri alım eşiği",
    unit: "pct",
    from_value: 0.0025,
    to_value: 0.002,
    at: PASS_AT,
    status: "applied",
    reason_tr:
      "KAPtan geri alım eşiğini %0,25'ten %0,20'ye indirdi; geçmiş testte karar başına net getiri +0,4 puan arttı.",
    gain_bps: 41,
    ci_low_bps: 6,
    ci_high_bps: 77,
    n: 212,
    can_revert: true,
  },
];

function report(l: MockLearning): LearningReport {
  const changes = BASE_CHANGES.map((c) =>
    l.reverted.includes(c.version) ? { ...c, status: "reverted" as const, can_revert: false } : c,
  );
  const live = changes.find((c) => c.status === "applied");
  return {
    generated_at: PASS_AT,
    auto_apply: l.auto_apply,
    takeaway_tr: live ? live.reason_tr : "Bu hafta kurallarda bir şey değişmedi; geri alım eşiği eski yerine döndü.",
    estimator_tr:
      "Beklenen getiriyi ortalama yerine ortanca ile hesaplıyorum: birkaç aşırı sonuç tahmini bozmasın diye. 2022'den öğrenip 2023'te denedim, 2024'te tekrar baktım.",
    kinds: [
      { kind: "E1", label_tr: "Geri alım", n: 96, hit_rate: 0.41, mean_net: -0.0041, median_net: -0.0083, horizon_days: 20, calibration: { n_matured: 4, needed: 30, slope: null, bias_bps: -38, factor: 1, active: false } },
      { kind: "E2", label_tr: "Yönetici alımı", n: 7, hit_rate: 0.43, mean_net: 0.0012, median_net: -0.0021, horizon_days: 20, calibration: { n_matured: 0, needed: 30, slope: null, bias_bps: null, factor: 1, active: false } },
      { kind: "E3", label_tr: "Yeni iş", n: 1209, hit_rate: 0.38, mean_net: -0.0128, median_net: -0.0201, horizon_days: 5, calibration: { n_matured: 2, needed: 30, slope: 0.6, bias_bps: -55, factor: 1, active: false } },
      { kind: "E4", label_tr: "Finansal sonuç", n: 5461, hit_rate: 0.37, mean_net: -0.0152, median_net: -0.0219, horizon_days: 5, calibration: { n_matured: 0, needed: 30, slope: null, bias_bps: null, factor: 1, active: false } },
    ],
    changes,
    rejected: [
      { rule: "e3_revenue_materiality_min", label_tr: "Yeni iş büyüklük eşiği", unit: "pct", current: 0.1, candidate: null, reason_tr: "Geçmiş duyurularda bu kuralın ölçtüğü bilgi yok; denenemedi." },
      { rule: "e2_min_value_try", label_tr: "Yönetici alımı eşiği", unit: "try", current: 1_000_000, candidate: 750_000, reason_tr: "Yeterli olay yok: 750.000 TL ile geçmişte yalnızca 1 olay var; en az 50 gerekir." },
      { rule: "leak_ret5d_max", label_tr: "Duyuru öncesi yükseliş sınırı", unit: "pct", current: 0.08, candidate: 0.07, reason_tr: "%7 ile net getiri +0,1 puan arttı ama bu şans eseri olabilir: geçmişi binlerce kez karıştırıp baktığımda −0,1 ile +0,3 puan arasında çıktı." },
    ],
    folds: [
      { kind: "E1", fold: "2022 → 2023", n_train: 0, n_val: 0, error_ratio: null },
      { kind: "E2", fold: "2022 → 2023", n_train: 0, n_val: 0, error_ratio: null },
      { kind: "E3", fold: "2022 → 2023", n_train: 312, n_val: 452, error_ratio: 0.98 },
      { kind: "E4", fold: "2022 → 2023", n_train: 1705, n_val: 1874, error_ratio: 0.9997 },
      { kind: "E1", fold: "2022–23 → 2024", n_train: 0, n_val: 96, error_ratio: null },
      { kind: "E2", fold: "2022–23 → 2024", n_train: 0, n_val: 7, error_ratio: null },
      { kind: "E3", fold: "2022–23 → 2024", n_train: 757, n_val: 491, error_ratio: 1 },
      { kind: "E4", fold: "2022–23 → 2024", n_train: 3579, n_val: 1882, error_ratio: 0.9959 },
    ],
  };
}

export function createLearning(ctx: MockCtx): Pick<KaptanApi, "getLearning" | "setLearningSettings" | "revertLearningChange"> {
  const { db, ok, me } = ctx;
  const write = (fn: (l: MockLearning) => MockLearning) => db.update((s) => ({ ...s, learning: fn(learningOf(s)) }));
  return {
    async getLearning() {
      me();
      return ok(report(learningOf(db.snapshot)), 120);
    },
    async setLearningSettings(input) {
      const a = me();
      if (typeof input.auto_apply !== "boolean") throw new ApiError(422, "validation", "Açık ya da kapalı seçilmeli.");
      write((l) => ({ ...l, auto_apply: input.auto_apply }));
      db.audit(userActor(a), "learn.settings_changed", "learning", "settings", { auto_apply: input.auto_apply });
      return ok(report(learningOf(db.snapshot)), 140);
    },
    async revertLearningChange(version) {
      const a = me();
      const change = report(learningOf(db.snapshot)).changes.find((c) => c.version === version);
      if (!change) throw new ApiError(404, "not_found", "Bu değişiklik bulunamadı.");
      if (!change.can_revert) throw new ApiError(409, "conflict", "Bu değişiklik artık geri alınamaz.");
      write((l) => ({ ...l, reverted: [...l.reverted, version] }));
      db.audit(userActor(a), "learn.rule_reverted", "rules", String(version), { rule: change.rule, from: change.to_value, to: change.from_value });
      return ok(report(learningOf(db.snapshot)), 180);
    },
  };
}
