import type { LimitVersion, LiveArmState, OrderTicket, RestrictedSecurity, UniverseEntry } from "@/lib/domain";
import { LIMITS_V1 } from "@/lib/domain";
import { istanbulIso } from "@/lib/time";
import { DEMO_DAY } from "./clock";
import { DEMO_TICKET, DEMO_TICKET_ORDER, DEMO_E3_RUN } from "./ids";
import { ISSUERS } from "./issuers";

/** Limits: v1 active since the forward test (canonical seed); v2 was proposed and rejected. */
export const SEED_LIMIT_VERSIONS: readonly LimitVersion[] = [
  {
    version: 1,
    status: "active",
    reason: "Kanonik başlangıç limitleri (rules-v1.0 ön kaydı ile birlikte).",
    created_by: "u-admin",
    created_by_name: "Burak (Admin)",
    created_at: "2026-11-08T09:00:00.000Z",
    approved_by: "u-risk",
    approved_by_name: "Zeynep (Risk Officer)",
    approved_at: "2026-11-08T10:30:00.000Z",
    decision_comment: "Kanonik değerlerle birebir; onay.",
    effective_from: "2026-11-09T06:00:00.000Z",
    values: [...LIMITS_V1],
  },
  {
    version: 2,
    status: "rejected",
    reason: "Hedef pozisyon sayısını 8'den 9'a çıkarma önerisi.",
    created_by: "u-admin",
    created_by_name: "Burak (Admin)",
    created_at: "2026-12-15T08:10:00.000Z",
    approved_by: "u-risk",
    approved_by_name: "Zeynep (Risk Officer)",
    approved_at: "2026-12-15T09:02:00.000Z",
    decision_comment: "İleri dönük test sırasında kural değişikliği yok (sürüm disiplini). Ret.",
    effective_from: null,
    values: LIMITS_V1.map((v) => (v.key === "target_concurrent_positions" ? { ...v, value: 9 } : v)),
  },
];

export const SEED_RESTRICTED: readonly RestrictedSecurity[] = [
  { id: "rs-1", ticker: "TMSLJ", kind: "vbts_brut_takas", source_ref: "VBTS tedbir listesi (temsili)", added_at: istanbulIso("2027-01-07", "18:20"), added_by: "system:restrictions_sync", removal_requested_by: null },
  { id: "rs-2", ticker: "KRGTK", kind: "team_insider", source_ref: "Ekip beyanı (temsili)", added_at: "2026-10-20T09:00:00.000Z", added_by: "u-admin", removal_requested_by: null },
  { id: "rs-3", ticker: "FRZMB", kind: "spk_tedbir", source_ref: "SPK tedbir kararı (temsili)", added_at: istanbulIso("2027-01-04", "19:05"), added_by: "system:restrictions_sync", removal_requested_by: null },
];

export const SEED_UNIVERSE: readonly UniverseEntry[] = ISSUERS.map((i) => ({
  ticker: i.ticker,
  company_name: i.name,
  sector: i.sector,
  group: i.group,
  free_float_pct: i.freeFloat,
  adv20_try: i.adv20Try,
  in_universe: i.inUniverse,
}));

export const SEED_LIVE_ARM: LiveArmState = {
  config_live: false,
  env_enabled: false,
  ui_armed_by: null,
  ui_confirmed_by: null,
  armed: false,
  expires_at: null,
};

/**
 * Demo step 6 (11 Adım 6): "ÖRNEK ENERJİ A.Ş. · LİMİT 48,40 · 620 lot · 30 dk geçerli · Manuel giriş".
 * The personal account value is a sample (350.000 TL) so the ticket respects R07's 10% cap
 * (FRONTEND-SPEC §9 Ç-18).
 */
export const DEMO_ORDER_TICKET: OrderTicket = {
  ticket_no: DEMO_TICKET,
  order_id: DEMO_TICKET_ORDER,
  run_id: DEMO_E3_RUN,
  rules_version: "rules-v1.0 / fwd",
  approved_at: istanbulIso(DEMO_DAY, "13:46"),
  approval_deadline: istanbulIso("2027-01-12", "09:50"),
  created_at: istanbulIso(DEMO_DAY, "13:46", 20),
  valid_until: istanbulIso(DEMO_DAY, "14:16", 20),
  mode_keys: { config: true, env: true, ui: true },
  side: "buy",
  ticker: "ORNEK",
  company_name: "ÖRNEK ENERJİ A.Ş.",
  market: "Ana Pazar (temsili)",
  order_type: "limit",
  session_tr: "SÜREKLİ İŞLEM (10:00–18:00) · GÜNLÜK",
  qty: 620,
  limit_price: 48.4,
  ref_price: 47.45,
  upper_limit: 52.14,
  est_notional_try: 30_008,
  account_equity_try: 350_000,
  event_line_tr: "E3 — Yeni iş ilişkisi (bağlayıcı hizmet sözleşmesi)",
  kap_line_tr: "idx 1651901, 11.01.2027 13:41 “Özel Durum Açıklaması (Genel)” · Temsili",
  materiality_line_tr: "Yıllıklandırılmış tutar yıllık gelirin %18'i (eşik %10) ✓",
  leakage_line_tr: "Son 5 seans +%4,1 (eşik %8) ✓",
  evidence_line_tr: "Benzer 23 olay · ort. 5 günlük anormal getiri +%1,4 · isabet %61 (örnek değer)",
  cost_line_tr: "Gidiş-dönüş maliyet %0,33 (komisyon + yarı-spread + etki + manuel kayma)",
  edge_cost_line_tr: "Avantaj / maliyet = %0,70 / %0,33 = 2,1× (eşik 2,0) ✓",
  skeptic_line_tr: "“2 seansta +%3,6 hareket; ×0,5 küçültüldü”",
  amount_check_line_tr: "Okuyucu tutarı metindeki regex tutarıyla eşleşti (R14) ✓",
  stop_line_tr: "Kapanış bazlı stop 43,30 TL (−%8,7)",
  planned_exit_tr: "5. seans kapanışı → 18.01.2027",
  gate_results: ["R01", "R02", "R03", "R04", "R13", "R11", "R14", "R05", "R06", "R09", "R12", "R07", "R08", "R10", "R15", "R16"].map((code) => ({
    code,
    passed: true,
  })),
  approval_level: "normal",
  audit_hash: "9f3c41d07be2a95c0e6f8d3b1a7c2e4f5d6b8a9c0e1f2a3b4c5d6e7f8a9be71a",
  prev_hash: "44b07a1c3e5f7d9b2c4e6a8f0d1b3c5e7f9a2b4c6d8e0f1a3b5c7d9e1f3a19c2",
  is_fixture: true,
};
