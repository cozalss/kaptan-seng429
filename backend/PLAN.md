# KAPtan backend — wave-2/3 work packages

> **2026-11-03:** the demo described below is gone from the product: `kaptan/demo/*`, `/demo/*`, `DEMO_MODE`, the demo
> clock, demo fills and the replay LLM moved to `tests/harness/` or were deleted (README, "No demo in a running
> system"). This file stays as the record of how M1 was built; test databases per agent are set through
> TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL / REDIS_URL in the environment.

> Revizyon 4 (02.11.2026, tek kullanıcı): bu belge tarihseldir. Paket tanımları ve "DoD" maddeleri yazıldığı
> dönemin modelini (dört rol, `same_person` 403, iki imza) anlatır; bu kurallar artık geçerli değildir. Güncel sözleşme
> [`../kaptan-panel/API.md`](../kaptan-panel/API.md), karar [`../docs/proje/_KANONIK-KARARLAR.md`](../docs/proje/_KANONIK-KARARLAR.md)
> Revizyon 4'tür.

Wave 1 (done): project, compose, settings, migration `0001`, auth router, RBAC, error envelope,
audit canonical/writer/verify, pydantic mirrors of every zod schema, contract harness, demo fixtures +
seeder, router stubs (501). Read `README.md` first, then `../kaptan-panel/API.md` and the stub
docstring of your router (each lists its endpoints, rules, error codes and Turkish texts from the mock).

## Ground rules for every package

- **Own only your files.** Shared files get small additive edits, re-read right before editing:
  `api/main.py` (only if you add a router), `domain/schemas/*` (only if a mirror is wrong — the zod
  schema decides), `settings.py`. New SQL = **one new migration per package**
  (`migrations/versions/00NN_<pkg>_<slug>.py`, `down_revision` = the head you see; A=0002, B=0003,
  C=0004, D=0005, E=0006 — rebase the chain if one lands first; never edit another package's file).
- **Behaviour parity = the panel mock** (`kaptan-panel/src/lib/api/mock/*.ts`): same status codes,
  `code`s and Turkish `detail` texts. Mock state → tables mapping below.
- **Writes:** `async with conn.transaction():` around state change **and** `await audit.writer.append(conn,
  [AuditDraft(...)])` (same transaction; payload keys exactly as the mock's `db.audit(...)` call; human
  actions use `actor.audit_actor` and put `role` in the payload). Publish SSE **after** commit (package D helper).
- **Time:** always `request.app.state.clock.now()` (`ClockDep`) — the demo clock — never `datetime.now()`
  for domain time (JWT is the only wall-clock user). Format with `kaptan.domain.schemas.iso_ms`.
- **Guards:** `Depends(require("<action>"))` (already on the stubs), `ensure_second_signer(first_uid,
  actor, "kill_reset" | "limits")` for 403 `same_person`, `raise ApiError(status, code, detail)`.
- **Responses:** return dicts/models; `response_model` (already set) serialises via the mirrors. Add a
  contract test per endpoint: `tests.contract.harness.assert_matches("<ZodName>", res.json(), many=...)`
  and a parity test against `tests/fixtures/demo/expected/*.json` on a fresh seed.
- **Tests:** `client`, `pg`, `owner_pg`, `login()`, `bearer()` fixtures in `tests/conftest.py`; tests that
  mutate state call `reseed_test_db(migrated)` at the end (release your own read transaction first).
  When your endpoint stops answering 501, drop it from the allowed-role expectation in
  `tests/integration/test_routes_and_rbac.py::test_allowed_roles_reach_the_stub` (keep the 403 rows).
- **Done** = `uv run pytest` green, `ruff check`, `ruff format --check`, `mypy` clean, ≥ 80 % coverage
  on your modules, endpoint parity with the mock at 13:40 on a fresh seed, contract tests pass.

## Mock state → tables

| Mock (`state.ts` / selectors) | Postgres |
|---|---|
| `dayDisclosures()` (318), `releasedLate`, injected rows | `core.disclosures` (`visible`, `release_order` 1..106, `scenario`), `core.disclosure_texts` |
| run specs / `buildExplain()` | `trading.agent_runs` (`explain` JSONB = base document, `spec`, `run_set`, `visible`, `injected_at`) |
| approval cards + `approvals` patches | `trading.trade_proposals.doc`, `trading.approvals` (`card` + decision columns), `trading.approval_decisions` |
| `proposalNotes` | `trading.proposal_notes` (id default `not-<n>`) |
| SimBIST `orders` + fills, `canceledOrderIds` | `trading.orders` (broker `simbist` only), `trading.fills` |
| tickets + `ticketMarks` | `trading.order_tickets` (`doc` = ticket without `entry`; mark columns). The ticket's own order (broker `order_ticket`) is **derived** like `ticketOrder()`; an unmarked ticket past `valid_until` reads `expired` |
| `positions()` | `trading.positions` (paper + personal book; `holding_days`, `unrealized_pnl` computed at read) |
| `paperPnl()` | `trading.pnl_daily` (`ord` = fixture order) |
| `risk`, `positionsManagedByExit`, quota | `trading.risk_state` (single row, `reset_started` Signature JSONB), `trading.quota_usage`, `trading.live_arm` |
| `limitVersions` | `trading.limit_versions` (+ `trading.limits`, `ord`) |
| `auditAppends`, `tamperOn`, `verifiedAt` | `audit.audit_log`, `ops.demo_state` |
| `injections`, `startedAtReal` | `ops.demo_injections`, `ops.demo_state.started_at` |
| counters' LLM numbers | `core.day_counters` (calls 31; tokens raw 141 260 — show `max(raw, 412000)`, `meta.json counters_base`) |

Fixture constants (anchor, ids, LOSS_DAILY, quota bases, paper equity, tamper pos 3907) are in
`tests/fixtures/demo/meta.json`; load via `kaptan.demo.fixtures.DemoFixtures().meta`.

## Packages

### A — approvals, notes, runs/explain, tickets (wave 2)
Files: `api/routers/{approvals,runs,tickets}.py`, new `src/kaptan/approvals/` (service + SQL),
`src/kaptan/runs/explain.py`, migration `0002` if needed, `tests/integration/test_{approvals,runs,tickets}.py`.
Tables: agent_runs, trade_proposals, approvals, approval_decisions, proposal_notes, orders, fills,
order_tickets, risk_state (read), audit_log.
Work: effective card status (kill switch → `cancelled`, past `expires_at` → `expired`); list ordering
newest first, `run-hist-*` excluded; decide → audit `approval.decided`, SSE `approval.decided`, then
`execute_approved()` (mock `scenarios.ts executeApproved`): ticket issue (demo E3 uses
`demo_order_ticket.json`, others `buildTicket()` port, seq = 10 + spec index), audit `ticket.issued`,
SimBIST order (`ord-s-…`), fill 1.8 s later for intraday (48.32 for the demo E3; audit `order.filled`;
create the paper position via B's helper). Explain overlay = `selectors.explainFor()` (incl. `run.status`
while an injected run is in flight: `DEMO_RUN_MS` = 7 500 ms of wall time since `injected_at`, trace
nodes running/waiting). Marks → personal position (B helper).
DoD: `expected/approvals_all.json`, `expected/tickets.json`, `expected/explain.json` match on a fresh seed.

### B — portfolio, risk / kill switch, limits (wave 2)
Files: `api/routers/{portfolio,risk,limits}.py`, new `src/kaptan/risk/` (status, kill switch,
`loss_simulation` steps, `live_equity()` port of `pnl.ts liveEquity`) and `src/kaptan/portfolio/`
(positions read + `open_position()` helper used by A), migration `0003` if needed, tests.
Tables: risk_state, quota_usage, live_arm, orders (cancel on kill), positions, pnl_daily,
limit_versions, limits, audit_log.
Work: RiskStatus derivation = `selectors.riskStatus()` (peak from the pnl fixture, quota + per injection);
kill switch / two-person restart / limits exactly per stub docstrings; `limit_violations()` already in
`domain/schemas/governance.py`; provide `run_loss_step(conn, step)` for C/E (halt at ≤ −1 %: audit
`risk.halted`, SSE `halt`; ≤ −5 % drawdown: `kill_switch.on` by `system:risk_monitor`).
DoD: `expected/{risk_status,positions,limits_view}.json` + pnl match; two-signature flows incl.
`same_person` 403 tested.

### C — audit, admin, demo inject/tamper/reset, disclosures/counters (wave 2)
Files: `api/routers/{audit,admin,demo,disclosures}.py`, `src/kaptan/audit/search.py` (port of
`audit-words.ts auditMatches()`), `src/kaptan/demo/{tamper,ticker}.py`, migration `0004` if needed, tests.
Tables: audit_log, demo_state, demo_injections, users, disclosures, approvals, day_counters.
Work: `/audit` list (today = `istanbul_date(clock.now())`, `q`, `limit`, `total`, `length`, `tamper_on`);
`/audit/verify` = `verify_db()` (read-only); `/admin/users` from `auth.users` by `ord`;
`/demo/tamper` with an owner connection pool/connection (`settings.database_owner_url`, DEMO_MODE only):
disable `trg_audit_immutable` inside the transaction, `payload || {"kurcalandi": true}` on pos 3907 (off:
`payload - 'kurcalandi'`), set `tamper_on`, no audit entry; `/demo/reset` = `demo.seed.reseed(owner_conn)`
then `app.state.clock.restart(result.started_at)` and SSE counters; `/demo/inject` audits `demo.injected`
then calls E (`scenario`) or B (`loss_simulation`, steps every 1.4 s as a background task);
live disclosure ticker (release `release_order` rows every 7–12 s, re-timed to now; SSE `disclosure` + `counters`)
as a lifespan task, DEMO_MODE only. `/disclosures/counters` = `selectors.counters()`.
DoD: fresh seed → verify ok/4 812; tamper on → `{"ok":false,"first_bad_pos":3907,"kind":"hash_mismatch"}`;
`expected/counters.json` matches; reset restores everything.

### D — SSE + Redis event bus (wave 2)
Files: `api/routers/sse.py`, `src/kaptan/events/{bus,publish}.py`, tests.
Work: `publish(app_or_redis, stream, event, data)` → `XADD kaptan:<stream>` (MAXLEN ~1000) validating
`data` with `FEED_EVENTS` / `DESK_EVENTS` / `RUN_EVENTS` (`domain/schemas/events.py`); `/sse/ticket`
(Redis `SET kaptan:sse:<ticket> <uid,role> EX 60`, deleted on first use → 401 afterwards);
`/stream/{feed|desk}` streaming `event:/data:/id:` from `XREAD BLOCK`, replay after `last_event_id`
(`Last-Event-ID` header too), keep-alive comment every 15 s, stops on disconnect. Redis client:
`request.app.state.redis` (already created in the lifespan).
DoD: an approval decided via A appears on `/stream/desk` within 1 s; reconnect with last id replays.

### E — agent pipeline, replay mode (wave 2)
Files: `src/kaptan/agents/` (LangGraph 1.x graph, nodes per 05 code names), `src/kaptan/llm/replay.py`
(provider returning recorded outputs from `runs.json` specs/explains, keyed by prompt + input hash),
`src/kaptan/rules/` (E1–E4, deterministic, 06), `src/kaptan/risk/gate.py` (R01–R16 in `RISK_GATE_ORDER`),
migration `0006` if it needs tables, tests (`rules/` and `risk/` ≥ 90 %).
Work: `run_scenario(conn, scenario, clock)` used by C's `/demo/inject`: make the demo disclosure visible
(re-timed to now), set `agent_runs.visible/injected_at`, run the graph with replay outputs, write the
Explain document, proposal + approval card (`pending`, `expires_at` 09:50 next session) for
`e3_contract`; `compliance.rejected` (prompt injection) for `redteam_injection`; pre-gate `risk.rejected`
(R04) for `restricted_r04`; audit entries exactly as `scenarios.ts auditOutcome()`; SSE `node`/
`approval.requested`/`counters`; `core.day_counters` + `quota_usage` increments. The rule engine's trace
must reproduce the fixture's `rule_trace_summary` for the demo specs.
DoD: injecting `e3_contract` yields the same Explain (modulo timestamps) as `runs.json` for
`run-demo-e3-ornek`; a pending card shows in `/approvals`.

### F — panel wiring (wave 3)
Files: only `kaptan-panel/` env/config as needed + backend fixes in the owning package's files.
Work: run the panel with `NEXT_PUBLIC_API_MODE=http KAPTAN_API_ORIGIN=http://127.0.0.1:8000
NEXT_PUBLIC_DEMO_MODE=true`, run `npm run e2e` against the backend, fix every mismatch (502 schema =
response shape; compare with the contract tests), guided tour, all four roles.
DoD: panel e2e suite green against the backend; no 501 left.

## Known gaps / risks
- Single API process assumed (login rate limiter and demo timers are in-process).
- Demo timers (fill after 1.8 s, loss simulation, live ticker, run animation) need background tasks that
  stop on reset/shutdown — keep them in one place (C) to avoid races.
- `explain` JSONB for non-fixture runs must be produced by E in exactly the zod shape (validate with
  `kaptan.domain.schemas.Explain` before storing).

## Finish round (2026-10-30): spec gap audit vs 03/05/06/08/09/10/11

Built (tests in brackets):
- Risk gate to 06 §10 tables: SELL exits never stopped by buy-only rules (R04 stale/tedbir, R07/R08/R10 skip
  sells; R09 sell = limit ≥ taban, at-send uses the session whose close is the base); R04 stale → REJECT;
  R07 cost-aware cash cap + TOO_SMALL (max 2 000 TL, 1 % equity); R08 P5 gross ≤ 100 % / 50 % crisis and
  P6 cash buffer 5 %; R12 held-qty + NO_LEVERAGE at send; R14 missing amount rejects E1–E3; R15
  RESTRICTED_SELL; R11 also rejects on an agent's own injection flag [test_risk_gate_spec_cases,
  test_risk_gate_properties (2 000 seeded cases), test_exit_engine at-send].
- Audit: `auth.login_failed` (hashed client, no secret), `approval.expired` from the feed settle,
  `ticket.issued` names the company; `python -m kaptan.audit.verify_cli` / scripts/verify_audit_chain.py
  checks every anchor line (exit 0/1/2).
- Single-user waiver: `auth.single_user_waiver` audit for each waived second signature; migration 0021 relaxes the
  limit-version CHECK only under that waiver; `GET /me/overview`. Revizyon 4 removes the `KAPTAN_SINGLE_USER` switch
  and `/health.single_user`: there is one mode, so the switch and its per-mode branches are deleted, not kept behind a flag.
- Eval: `/eval/summary` red-team block from reports/redteam.json, ablation rows from reports/backtest.json,
  L1 from a human-labelled reports/classify.json; backtest total_return, Sortino, `--cost-scenarios`
  (gross / 5 / 20 / 30 bp); classify per-class P/R/F1, confusion, bootstrap CI, McNemar, CLI;
  `kaptan.evidence.inference` (BMP-KP, Corrado, Holm, BH, stationary block bootstrap Sharpe CI, deflated
  Sharpe, trial log).
- Demo: loss simulation = one market minute per step (halt 13:43, kill 13:46); feed skips "Düzeltme" (CORR);
  NFR-01 ingest-lag p95 gauge; import boundary test (LLM side cannot import execution).

Still open (with reason):
- External: real broker adapter (no broker API account), deploy (hosting account), 300-item human golden
  set + 50 RAG questions (human labelling), LangSmith (account), EVDS macro series (API key), RSS feeds.
- Needs a panel/contract change first: a HOLD reason code for unknown leakage/ret10d inputs (RuleReasonCode
  is mirrored from zod); pre-open ticket TTL 09:55 (06 R16) vs the mock's 10:10 (fixture parity);
  kill switch voiding open tickets/cards in the DB (the mock only shows them cancelled).
- Not built this round: N1c–N1f avoid list + X3 for them, E2_strong/CPI, E4 NPP/tone/audit-opinion rows,
  degraded flag from the provider chain, deterministic quote check, class suspension, PitStore + canary,
  ticker/company masking (A4), per-minute LLM token bucket, TOTP step-up, per-role DB users.
