/**
 * Stable fixture IDs. Screen engineers link to these in tests and the guided demo
 * (PANEL-CONTRACT.md §5). Never renumber: tests and the demo script depend on them.
 */

/** First disclosure index of the demo day; the day's rows are BASE + 0…317. */
export const DAY_INDEX_BASE = 1_651_200;
export const DAY_TOTAL = 318;
/** Published by 13:40 (the clock anchor): 61 noise + 138 archived + 13 processed (11 Adım 1). */
export const DAY_BY_ANCHOR = { total: 212, noise: 61, archived: 138, processed: 13 } as const;

/* Demo scenarios (11 §2), injected by Admin via "Senaryo". */
export const DEMO_E3_INDEX = 1_651_901;
export const DEMO_E3_RUN = "run-demo-e3-ornek";
export const DEMO_E3_PROPOSAL = "prop-demo-e3-ornek";
export const DEMO_E3_EVIDENCE = "card-demo-e3-ornek";
export const DEMO_E3_ORDER = "ord-demo-e3-ornek";

export const DEMO_INJ_INDEX = 1_651_902;
export const DEMO_INJ_RUN = "run-demo-redteam-dmogd";

export const DEMO_R04_INDEX = 1_651_903;
export const DEMO_R04_RUN = "run-demo-r04-tmslj";

/** Personal-mode ticket shown in demo step 6. */
export const DEMO_TICKET = "T-2027-0111-003";
export const DEMO_TICKET_ORDER = "ord-demo-ticket-ornek";

/* Audit chain (11 Adım 4). */
export const AUDIT_BASE_LENGTH = 4_812;
export const AUDIT_TAMPER_POS = 3_907;

/* Pre-existing runs of the day that reached the approval queue. */
export const PENDING_RUNS = ["run-day-e1-krgcl", "run-day-e2-orncm", "run-day-e4-tmspz"] as const;
export const PENDING_PROPOSALS = ["prop-day-e1-krgcl", "prop-day-e2-orncm", "prop-day-e4-tmspz"] as const;

export type DemoScenario = "e3_contract" | "redteam_injection" | "restricted_r04" | "loss_simulation";

export const DEMO_SCENARIOS: ReadonlyArray<{ id: DemoScenario; label: string; step: string }> = [
  { id: "e3_contract", label: "E3: Yeni iş ilişkisi", step: "Adım 2" },
  { id: "redteam_injection", label: "Red-team: gizli talimat", step: "Adım 3" },
  { id: "restricted_r04", label: "Tedbirli hisse", step: "Adım 3" },
  { id: "loss_simulation", label: "Zarar simülasyonu", step: "Adım 4" },
];
