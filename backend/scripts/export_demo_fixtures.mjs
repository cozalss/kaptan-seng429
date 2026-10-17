// Export the panel mock's demo day to JSON fixtures for the backend seed (tests/fixtures/demo/).
//
//   node backend/scripts/export_demo_fixtures.mjs        (needs kaptan-panel/node_modules)
//
// Runs the panel's own TypeScript generators (src/mocks/*, src/lib/api/mock/selectors.ts) through
// jiti with the "@/..." alias, with Date.now() pinned so "now" is exactly the demo clock anchor
// (11.01.2027 13:40 Istanbul). Deterministic: running it twice produces identical files.
// `expected/` holds what each read endpoint must answer on a fresh seed (parity tests).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panel = resolve(here, "../../kaptan-panel");
const out = resolve(here, "../tests/fixtures/demo");
const { createJiti } = await import(pathToFileURL(join(panel, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(join(panel, "src/index.ts"), { alias: { "@": join(panel, "src") }, interopDefault: true });
const load = (p) => jiti.import(join(panel, "src", p));

// Pin the real clock: the mock session starts "now", so the demo clock reads exactly the anchor.
const FIXED_REAL_MS = 1_900_000_000_000;
Date.now = () => FIXED_REAL_MS;

const ids = await load("mocks/ids.ts");
const clock = await load("mocks/clock.ts");
const { TEAM } = await load("lib/domain/role-meta.ts");
const { ISSUERS } = await load("mocks/issuers.ts");
const { dayDisclosures } = await load("mocks/day.ts");
const { DAY_SPECS, HISTORY_SPECS } = await load("mocks/runs-day.ts");
const { DEMO_E3_SPEC, DEMO_INJ_SPEC, DEMO_R04_SPEC } = await load("mocks/runs-demo.ts");
const { buildExplain, disclosureOf, PAPER_EQUITY_TRY, RULES_HASH, PROMPT_MANIFEST_HASH } = await load("mocks/explain-builder.ts");
const { baseAuditChain } = await load("mocks/audit.ts");
const { paperPnl, liveEquity, LIVE_STRATEGY } = await load("mocks/pnl.ts");
const gov = await load("mocks/governance.ts");
const { CURRENT_STAGE } = await load("mocks/personal.ts");
const { initialState } = await load("lib/api/mock/state.ts");
const sel = await load("lib/api/mock/selectors.ts");
const { limitsView } = await load("lib/api/mock/enterprise.ts");

const state = initialState(FIXED_REAL_MS);
const now = FIXED_REAL_MS;

const write = (name, data) => {
  const file = join(out, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`, "utf8");
  return file;
};

const SCENARIO_OF = { [DEMO_E3_SPEC.run_id]: "e3_contract", [DEMO_INJ_SPEC.run_id]: "redteam_injection", [DEMO_R04_SPEC.run_id]: "restricted_r04" };
const runEntry = (set) => (spec) => ({ set, scenario: SCENARIO_OF[spec.run_id] ?? null, spec, explain: buildExplain(spec) });

const days = dayDisclosures();
const demoDisclosures = [DEMO_E3_SPEC, DEMO_INJ_SPEC, DEMO_R04_SPEC].map((s) => ({ ...disclosureOf(s), scenario: SCENARIO_OF[s.run_id] }));

const files = [
  write("meta.json", {
    fixed_real_ms: FIXED_REAL_MS,
    demo_day: clock.DEMO_DAY,
    clock_anchor: clock.CLOCK_ANCHOR_ISO,
    day_index_base: ids.DAY_INDEX_BASE,
    day_total: ids.DAY_TOTAL,
    day_by_anchor: ids.DAY_BY_ANCHOR,
    audit_base_length: ids.AUDIT_BASE_LENGTH,
    audit_tamper_pos: ids.AUDIT_TAMPER_POS,
    demo: { e3_index: ids.DEMO_E3_INDEX, e3_run: ids.DEMO_E3_RUN, e3_proposal: ids.DEMO_E3_PROPOSAL, inj_index: ids.DEMO_INJ_INDEX, inj_run: ids.DEMO_INJ_RUN, r04_index: ids.DEMO_R04_INDEX, r04_run: ids.DEMO_R04_RUN, ticket: ids.DEMO_TICKET, ticket_order: ids.DEMO_TICKET_ORDER },
    demo_run_ms: sel.DEMO_RUN_MS,
    // scenarios.ts LOSS_DAILY (not exported): intraday daily P&L path of the loss simulation, one step per 1.4 s.
    loss_daily: [-0.004, -0.0075, -0.0112, -0.021, -0.03, -0.0392],
    loss_step_ms: 1400,
    opening_daily_pnl: 0.0021,
    paper_equity_try: PAPER_EQUITY_TRY,
    personal_account_try: gov.PERSONAL_ACCOUNT_TRY,
    live_strategy: LIVE_STRATEGY,
    rules_hash: RULES_HASH,
    prompt_manifest_hash: PROMPT_MANIFEST_HASH,
    current_stage: CURRENT_STAGE,
    // selectors.counters(): llm_calls = 31 + injected llmCalls; llm_tokens = max(sum of non-hist tokens, 412000)
    counters_base: { llm_calls: 31, llm_tokens_floor: 412000 },
    // selectors.riskStatus(): quota = base + per injected run
    quota_base: [
      { provider: "Gemini Flash-Lite", used: 118, per_injection: 4, limit: 500 },
      { provider: "Groq gpt-oss", used: 61, per_injection: 2, limit: 1000 },
      { provider: "Prompt Guard 2", used: 140, per_injection: 1, limit: 14400 },
    ],
    live_equity_at_anchor: liveEquity(0.0021),
  }),
  write("team.json", TEAM),
  write("issuers.json", ISSUERS),
  write("disclosures.json", days.map((d, i) => ({ ...d, slot: i, released_at_anchor: i < ids.DAY_BY_ANCHOR.total }))),
  write("demo_disclosures.json", demoDisclosures),
  write("runs.json", [...DAY_SPECS.map(runEntry("day")), ...HISTORY_SPECS.map(runEntry("history")), ...[DEMO_E3_SPEC, DEMO_INJ_SPEC, DEMO_R04_SPEC].map(runEntry("demo"))]),
  write("audit.json", baseAuditChain()),
  write("pnl.json", paperPnl()),
  write("limit_versions.json", gov.SEED_LIMIT_VERSIONS),
  write("restricted.json", gov.SEED_RESTRICTED),
  write("watchlist.json", gov.SEED_WATCHLIST),
  write("live_arm.json", gov.SEED_LIVE_ARM),
  write("demo_order_ticket.json", gov.DEMO_ORDER_TICKET),
  write("risk_state.json", state.risk),
  // What each read endpoint answers on a fresh seed, at the demo clock anchor.
  write("expected/counters.json", sel.counters(state, now)),
  write("expected/approvals_all.json", sel.approvalCards(state, now).filter((c) => !c.run_id.startsWith("run-hist"))),
  write("expected/tickets.json", sel.allTickets(state, now)),
  write("expected/orders.json", sel.allOrders(state, now)),
  write("expected/positions.json", sel.positions(state, now)),
  write("expected/risk_status.json", sel.riskStatus(state, now)),
  write("expected/limits_view.json", limitsView(state)),
  write("expected/explain.json", Object.fromEntries([...DAY_SPECS, ...HISTORY_SPECS].map((s) => [s.run_id, sel.explainFor(state, s.run_id, now)]))),
  write("expected/users.json", TEAM),
];
console.log(`wrote ${files.length} files to ${out}`);
