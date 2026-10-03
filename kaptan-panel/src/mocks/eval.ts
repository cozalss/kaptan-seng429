import type { EvalSummary } from "@/lib/domain";
import { SAMPLE_LABEL } from "@/lib/domain";
import { CLOCK_ANCHOR_ISO } from "./clock";
import { paperPnl, PAPER_START, V11_START } from "./pnl";

/**
 * Evaluation dashboard fixture. EVERY number here is a sample value
 * ("örnek değer · gerçek sonuç değil"): the real holdout runs once after the rules
 * are frozen (8 Nov 2026) and is never invented. Targets come from 08 and _KANONIK.
 */
export function evalSummary(): EvalSummary {
  return {
    is_sample: true,
    label: SAMPLE_LABEL,
    as_of: CLOCK_ANCHOR_ISO,
    l1: {
      split: "gold_test_200",
      macro_f1: 0.86,
      target_macro_f1: 0.85,
      per_class: [
        { cls: "E1", f1: 0.93, precision: 0.94, recall: 0.92, support: 26 },
        { cls: "E2", f1: 0.88, precision: 0.86, recall: 0.9, support: 30 },
        { cls: "E3", f1: 0.81, precision: 0.79, recall: 0.83, support: 35 },
        { cls: "E4", f1: 0.9, precision: 0.92, recall: 0.88, support: 25 },
        { cls: "X", f1: 0.84, precision: 0.74, recall: 0.96, support: 38 },
        { cls: "O", f1: 0.8, precision: 0.85, recall: 0.76, support: 46 },
      ],
      confusion: [
        [24, 0, 0, 0, 1, 1],
        [0, 27, 0, 0, 2, 1],
        [0, 1, 29, 0, 2, 3],
        [0, 0, 0, 22, 1, 2],
        [0, 1, 0, 0, 36, 1],
        [1, 2, 4, 1, 3, 35],
      ],
      kappa: 0.78,
      ece: 0.07,
      models: [
        { model_id: "gemini-flash-lite (temsili)", macro_f1: 0.86, e3_f1: 0.81, x_recall: 0.96 },
        { model_id: "gpt-oss-120b (temsili)", macro_f1: 0.84, e3_f1: 0.78, x_recall: 0.95 },
        { model_id: "qwen yerel (temsili)", macro_f1: 0.79, e3_f1: 0.71, x_recall: 0.93 },
      ],
    },
    l2: {
      questions: 50,
      faithfulness: 0.87,
      context_precision: 0.74,
      context_recall: 0.79,
      recall_at_10: 0.88,
      mrr: 0.66,
      time_violations: 0,
      stores: [
        { store: "pgvector", faithfulness: 0.87, recall_at_10: 0.88 },
        { store: "chroma", faithfulness: 0.86, recall_at_10: 0.85 },
      ],
      trend: [
        { d: "2026-11-30", faithfulness: 0.81, context_precision: 0.66, context_recall: 0.72 },
        { d: "2026-12-07", faithfulness: 0.84, context_precision: 0.7, context_recall: 0.75 },
        { d: "2026-12-14", faithfulness: 0.86, context_precision: 0.72, context_recall: 0.78 },
        { d: "2027-01-04", faithfulness: 0.87, context_precision: 0.74, context_recall: 0.79 },
      ],
    },
    l3: {
      window: "2025-01-01 → 2026-10-31",
      run_once: true,
      rows: [
        { event_type: "E1", n: 118, car_1: 0.004, car_5: 0.009, car_20: 0.016, car_60: 0.021, t_stat: 2.3, sharpe: 0.9, sortino: 1.3, max_dd: -0.071, cost_scenario: "base_005" },
        { event_type: "E2", n: 64, car_1: 0.003, car_5: 0.008, car_20: 0.019, car_60: 0.024, t_stat: 1.7, sharpe: 0.7, sortino: 1.0, max_dd: -0.088, cost_scenario: "base_005" },
        { event_type: "E3", n: 41, car_1: 0.005, car_5: 0.006, car_20: 0.002, car_60: null, t_stat: 0.6, sharpe: 0.2, sortino: 0.3, max_dd: -0.104, cost_scenario: "base_005" },
        { event_type: "E4", n: 77, car_1: 0.002, car_5: 0.004, car_20: 0.003, car_60: null, t_stat: 0.9, sharpe: 0.3, sortino: 0.4, max_dd: -0.093, cost_scenario: "base_005" },
        { event_type: "ALL", n: 300, car_1: 0.004, car_5: 0.007, car_20: 0.012, car_60: 0.016, t_stat: 2.1, sharpe: 0.8, sortino: 1.1, max_dd: -0.082, cost_scenario: "base_005" },
        { event_type: "ALL", n: 300, car_1: 0.0, car_5: 0.003, car_20: 0.008, car_60: 0.012, t_stat: 1.2, sharpe: 0.4, sortino: 0.6, max_dd: -0.097, cost_scenario: "stress_020" },
      ],
    },
    l4: { series: [...paperPnl()], since: { v1_0: PAPER_START, v1_1: V11_START }, closed_trades: 11 },
    ablations: [
      { arm: "B0", label_tr: "BIST-100 al-tut", sharpe: 0.6, max_dd: -0.12, total_return: 0.022, n_trades: 1 },
      { arm: "B1", label_tr: "Eşit ağırlıklı evren", sharpe: 0.5, max_dd: -0.1, total_return: 0.012, n_trades: 1 },
      { arm: "B2", label_tr: "Yalnızca subject kuralı (LLM yok)", sharpe: 0.4, max_dd: -0.09, total_return: 0.006, n_trades: 31 },
      { arm: "B3", label_tr: "Serbest LLM (aynı risk kapısı)", sharpe: 0.1, max_dd: -0.14, total_return: -0.011, n_trades: 47 },
      { arm: "A0", label_tr: "v1.0-fwd (şüphecisiz / ajansız)", sharpe: 0.5, max_dd: -0.07, total_return: 0.01, n_trades: 19 },
      { arm: "A1", label_tr: "Şüpheci yok", sharpe: 0.6, max_dd: -0.08, total_return: 0.013, n_trades: 22 },
      { arm: "A7", label_tr: "Onaysız (yalnızca backtest)", sharpe: 0.7, max_dd: -0.09, total_return: 0.018, n_trades: 18 },
    ],
    redteam: { malicious: 36, benign: 30, orders_from_malicious: 0, block_rate: 0.972, false_alarm_rate: 0.067, by_code: { Q: 29, N: 6, H: 1, F: 0 } },
    latency: { p50_s: 21.4, p95_s: 47.8, target_p95_s: 60 },
    cost: { calls_today: 31, tokens_today: 412_000, tokens_per_decision: 17_000 },
    shadow: [
      { proposal_id: "prop-day-e2-krgmd", ticker: "KRGMD", rejected_by: "insan (Risk Officer)", shadow_return_20d: -0.021 },
      { proposal_id: "prop-hist-091", ticker: "DMOIN", rejected_by: "risk kapısı (R06)", shadow_return_20d: 0.008 },
      { proposal_id: "prop-hist-077", ticker: "MSLTR", rejected_by: "şüpheci (veto)", shadow_return_20d: -0.034 },
      { proposal_id: "prop-hist-064", ticker: "FRZEN", rejected_by: "süre doldu (09:50)", shadow_return_20d: 0.012 },
    ],
  };
}
