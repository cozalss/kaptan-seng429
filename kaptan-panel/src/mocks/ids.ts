/**
 * Stable fixture IDs. Screen engineers link to these in tests
 * (PANEL-CONTRACT.md §5). Never renumber: tests and the demo script depend on them.
 */

/** First disclosure index of the demo day; the day's rows are BASE + 0…317. */
export const DAY_INDEX_BASE = 1_651_200;
export const DAY_TOTAL = 318;
/** Published by 13:40 (the clock anchor): 61 noise + 138 archived + 13 processed (11 Adım 1). */
export const DAY_BY_ANCHOR = { total: 212, noise: 61, archived: 138, processed: 13 } as const;

/* Demo scenarios (11 §2), injected from Canlı akış → "Senaryo", ⌘K or Ayarlar → Demo. */
export const DEMO_E3_INDEX = 1_651_901;
export const DEMO_E3_RUN = "run-demo-e3-ornek";
export const DEMO_E3_PROPOSAL = "prop-demo-e3-ornek";
export const DEMO_E3_EVIDENCE = "card-demo-e3-ornek";
export const DEMO_E3_ORDER = "ord-demo-e3-ornek";

/** Personal-mode ticket shown in demo step 6. */
export const DEMO_TICKET = "T-2027-0111-003";
export const DEMO_TICKET_ORDER = "ord-demo-ticket-ornek";

/* Audit chain (11 Adım 4). */
export const AUDIT_BASE_LENGTH = 4_812;
/** The record the tamper test changes ("Kayıt #3.907'de zincir kırık", 11 Adım 4). */
export const AUDIT_TAMPER_POS = 3_907;

/* Pre-existing runs of the day that reached the approval queue. */
export const PENDING_RUNS = ["run-day-e1-krgcl", "run-day-e2-orncm", "run-day-e4-tmspz"] as const;
export const PENDING_PROPOSALS = ["prop-day-e1-krgcl", "prop-day-e2-orncm", "prop-day-e4-tmspz", "prop-exit-x1-krgsg"] as const;
/** The seeded sell: an X1 time exit on the KRGSG position (mocks/runs-day.ts EXIT_SPECS). */
export const EXIT_RUN = "run-exit-x1-krgsg";
export const EXIT_PROPOSAL = "prop-exit-x1-krgsg";

