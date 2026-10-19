# KAPtan backend (M1)

FastAPI + psycopg 3 (async, parametrised SQL) + Postgres 16/pgvector + Redis 7. Goal of M1: the panel
(`../kaptan-panel`, `NEXT_PUBLIC_API_MODE=http`) runs end-to-end on this API exactly as on its mock.
Contract: `../kaptan-panel/API.md`. Work split for the next agents: [PLAN.md](PLAN.md).

## Run

```bash
cp .env.example .env                                   # fill in passwords / JWT_SECRET
docker compose -f docker-compose.yml up -d             # Postgres :5432, Redis :6379 (127.0.0.1 only)
uv sync
uv run alembic upgrade head                            # owner role (DATABASE_OWNER_URL)
uv run python scripts/seed_demo.py                     # demo day; prints "audit verify: ok=True checked=4812"
uv run uvicorn kaptan.api.main:app --port 8000 --loop kaptan.api.loop:selector_loop
#   or: uv run python -m kaptan.api --port 8000
```

Windows: psycopg's async mode refuses the ProactorEventLoop (uvicorn's default on Windows), hence
`--loop kaptan.api.loop:selector_loop`. Linux/Docker can omit it.

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login -H "Content-Type: application/json" \
     -d '{"passphrase":"kaptan2026","role":"admin"}'
curl -s http://127.0.0.1:8000/api/v1/health
```

## Run the whole system locally (Bütün sistemi yerelde çalıştır)

Docker Desktop, uv, Python 3.11, Node 24. Two terminals; the commands are the same in Git Bash and
PowerShell except the env line of the API.

```bash
# 1) backend/ — once: .env, containers, schema, demo day
cp .env.example .env                                   # fill in passwords / JWT_SECRET (dev: KAPTAN_ENV=dev)
docker compose -f docker-compose.yml up -d
uv sync
uv run alembic upgrade head                            # 0001 … 0009
uv run python scripts/seed_demo.py                     # "audit verify: ok=True checked=4812"

# 2) backend/ — the API on :8000 (demo day, recorded LLM answers, no KAP/price network)
DEMO_MODE=true LLM_MODE=replay KAP_LIVE=false PRICES_LIVE=false uv run python -m kaptan.api --port 8000
#   PowerShell: $env:DEMO_MODE="true"; $env:LLM_MODE="replay"; $env:KAP_LIVE="false"; $env:PRICES_LIVE="false"
#               uv run python -m kaptan.api --port 8000

# 3) kaptan-panel/ — the panel on :3100 in http mode (/api/v1 is rewritten to 127.0.0.1:8000)
npm ci
npm run dev:api                                        # http://localhost:3100/login · passphrase kaptan2026 (dev)
```

The panel's e2e suite against this backend: `npm run e2e:api` in `kaptan-panel/`. It starts the API
(with `LOGIN_RATE_PER_MINUTE=600`: the suite signs in ~60 times in a few minutes; the default is 5/min)
and `dev:api` unless they already answer on :8000 / :3100, and resets the demo day (`POST /demo/reset`
as admin) before the suite and before every test that changes state. If you run your own API for it,
start it with `LOGIN_RATE_PER_MINUTE=600` too. A fresh demo day by hand: `uv run python scripts/seed_demo.py`
or ⚙ Ayarlar → Senaryolar → "Verileri sıfırla" (Yönetici). The mock suite (`npm run e2e`) needs no backend.

SSE through the Next rewrite: streams are not buffered or compressed (`Cache-Control: no-cache,
no-transform`, `X-Accel-Buffering: no`, a keep-alive comment every 15 s). `events/bus.py` reads Redis
with `XREAD BLOCK` in 1 s slices because redis-py 8 has a 5 s socket timeout.

## Checks

```bash
uv run pytest            # unit + contract + integration (integration uses the kaptan_test database)
uv run ruff check . && uv run ruff format --check . && uv run mypy
node scripts/export_demo_fixtures.mjs        # re-export the demo day from the panel mock (deterministic)
node tests/contract/export_schemas.mjs       # re-export zod -> JSON Schema after panel schema changes
```

Integration tests skip when Postgres is down; the cross-language tests skip when `node` or
`kaptan-panel/node_modules` is missing.

## Decisions worth knowing

- **Auth.** One passphrase (argon2id `PASSPHRASE_HASH`; dev default `kaptan2026`), role = request
  (unknown → 400, none → `risk_officer`), each role maps to its team member. Access JWT HS256 15 min
  (`sub, name, role, fam, jti, iat, exp, iss, aud`), refresh = opaque token in `__Host-kaptan_rt`
  (HttpOnly, Secure, SameSite=Strict, Path=/), sha256 stored, rotated on every use, reuse revokes the
  family, 8 h absolute. `/auth/refresh` needs `X-KAPtan-CSRF: 1` and an allowed `Origin` (if sent).
  Dev over http: browsers treat `localhost`/`127.0.0.1` as secure contexts, so `Secure` + `__Host-` work
  through the panel's Next rewrite. Other plain-http hosts: `COOKIE_SECURE=false` → cookie `kaptan_rt`.
- **Errors.** Always `{"detail": "<Turkish>", "code": "<machine>"}`; 403 texts come from
  `domain/permissions.py` (`denied_reason()` = the panel's `deniedReason()`, tested against node).
- **Audit ledger.** `audit/canonical.py` reproduces `audit-chain.ts` byte for byte (JSON.stringify
  numbers/escapes/key order); the hash is computed by `audit/writer.py` under an advisory lock, not
  by a trigger. The app role (`kaptan_app`) has INSERT/SELECT only; triggers block UPDATE/DELETE/TRUNCATE
  for everyone; the demo reset/tamper use the owner connection and disable the trigger inside one transaction.
- **Demo clock.** In `DEMO_MODE` "now" = 2027-01-11 10:40Z + (wall time since seed/reset)
  (`clock.py`, `ops.demo_state.started_at`), like the panel mock.
- **M1 schema** follows `docs/proje/07` names with text ids and the Explain document as JSONB; see the
  docstring of `migrations/versions/0001_m1_core.py`.

## Prices (M2, `kaptan.prices`)

Daily bars for the rule engine, event study, SimBIST and position marks. Basis rule (P8): **levels are
raw, returns are adjusted.**

| Source | What it gives | Stored as |
|---|---|---|
| İş Yatırım `HisseTekil` (httpx, 90 s timeout, ≤ 1-year chunks) | raw close/low/high `HG_*`, TL turnover `HG_HACIM`, `SERMAYE`, `PD`, `HAO_PD`, adjusted `HGDG_KAPANIS`; delisted codes too (TRKCM) | `source='isyatirim'`, `price_basis='raw'` |
| Yahoo chart API (`<T>.IS`, what yfinance calls; no `yfinance` dependency) | split-adjusted OHLC, `adjclose`, volume (shares), split/dividend events; indices (XU100) | `source='yfinance'`, `price_basis='adjusted'` (yfinance `auto_adjust`) |

- **Open price:** İş Yatırım has none. Raw open = Yahoo open × median(raw close / Yahoo close) of the
  stretch between Yahoo split dates (`merge.py`); kept only if it lies inside İş Yatırım's [low, high]
  (±0.5 %), else NULL (`open_source` says where it came from). Raw volume is scaled the same way.
- **Holidays:** Yahoo `Volume == 0` rows are dropped; İş Yatırım rows on non-sessions too.
  `calendar.py` = BIST sessions 2018–2027 (Europe/Istanbul; fixed + religious holidays, arife/28 Oct
  half days to 12:30, the Feb 2023 earthquake closure), checked against 9 years of XU100 sessions;
  seeded into `core.market_calendar` by migration 0008.
- **Corporate actions:** detected from İş Yatırım itself (jumps in `HGDG/HG`, classified by `SERMAYE`:
  bedelsiz / bedelli / temettü / other), confirmed by Yahoo events; Yahoo-only when İş Yatırım has no
  rows. Factors multiply prices before the ex-date; view `core.prices_daily_adj` applies them.
- **Polite:** one request at a time, ≥ 2 s apart + jitter (`PRICES_MIN_INTERVAL_S`), 3 retries with
  exponential backoff on 429/5xx/timeouts, `Retry-After` honoured, browser User-Agent.

```bash
uv run python -m kaptan.prices.backfill --tickers THYAO,FROTO,XU100 --from 2025-01-01 --to 2025-06-30
uv run python -m kaptan.prices.backfill --tickers TRKCM --from 2020-01-02 --to 2020-03-31 --sources isyatirim
uv run python -m kaptan.prices.backfill --tickers THYAO --from 2026-09-01 --to 2026-09-30 --dry-run
```

Read helpers (`from kaptan.prices import ...`, all `async (conn, ...)`):
`close_on` / `open_on` (`basis='raw'|'adjusted'`), `adv20(ticker, asof)` (TL turnover of the 20
sessions before `asof`), `forward_return(ticker, t0, h, entry='open')` (open(t0) → close(t0+h−1),
adjusted), `daily_returns(ticker, start, end)`, `latest_mark(s)(tickers, at)` (point in time: the
open counts from 10:15, the close from 18:30 Istanbul), `PriceSource` / `DbPriceSource`.

Tests run offline on a recorded cassette (`tests/fixtures/prices/`, re-record with
`uv run python -m tests.fixtures.prices.record`, ≈ 11 requests). Live smoke test (2 requests):
`uv run pytest -m live tests/integration/test_prices_live.py`.

**Live marks (`PRICES_LIVE`, default false):** the setting exists; the switch itself belongs in
`portfolio/positions.py` (package B): with the flag on it marks each position with
`latest_marks(conn, tickers, now)` and falls back to the replay mark when a ticker has no stored
price. Until it is wired, positions use the demo's replay marks (`portfolio/marks.py`).

## Live LLM mode (M2, `kaptan.llm`)

`LLM_MODE=replay` (default) answers every agent from the recorded demo runs: no network, no keys.
`LLM_MODE=live` sends the same requests to real models. To switch:

```bash
# backend/.env (never commit it): any provider without a key is simply skipped
LLM_MODE=live
GEMINI_API_KEY=...    DEEPSEEK_API_KEY=...    GROQ_API_KEY=...
uv run alembic upgrade head          # 0009: trading.llm_usage
```

**Chain** (`get_provider("live")` → `LiveProvider`, one per process, counters/cache in the app's Redis):
every request is (1) **masked** (`mask_persons.py`: person names → `KİŞİ_n`, KVKK: unmasked text never leaves
the machine), (2) looked up in the **response cache** (key = agent, prompt version + template sha256, schema,
inputs, text hash, context; TTL `LLM_CACHE_TTL_S`, 30 days), (3) answered:
`guard` → Llama Prompt Guard 2 on Groq (≤ 8 chunks, max score) + Turkish/English rule list
(`injection_rules_tr.py`, a hit lifts the score to 0.95 → the graph quarantines → compliance RET; Prompt Guard
down = rules only); other agents → their chain from `config/models.yaml`: default **Gemini Flash-Lite →
DeepSeek → Groq gpt-oss → HOLD**; Classifier and Skeptic start on Groq (05 §1.4: a different model family from
the Reader), DeepSeek (paid) last. Azure for Students and Ollama slots are TODO. Each provider retries
429/5xx/timeouts with backoff (`Retry-After` honoured), validates the JSON against the agent's schema and gets
exactly one repair attempt; an exhausted chain makes the agent `failed` → the run HOLDs (never a crash).
Prompts: `src/kaptan/llm/prompts/v1.1.0/*.md` (Turkish, versioned; nonce-fenced DATA blocks, TASK_CONTEXT with
structured upstream fields only, no `*_tr` free text).

**Caps** (per UTC day, settings/env, checked before every call; over a cap = provider skipped):

| Setting | Default | Why |
|---|---|---|
| `LLM_CAP_GEMINI_RPD` | 400 | Flash-Lite free tier ~500 RPD (measured) |
| `LLM_CAP_GROQ_RPD` / `LLM_CAP_GROQ_TPD` | 900 / 180 000 | gpt-oss free ~1K RPD / ~200K TPD |
| `LLM_CAP_GUARD_RPD` | 14 000 | Prompt Guard 2 free 14.4K RPD |
| `LLM_CAP_DEEPSEEK_RPD` / `LLM_CAP_DEEPSEEK_USD` | 200 / 0.50 | paid; cost estimated from `price_usd_per_mtok` |

A daily-quota 429 marks the provider exhausted for the day. After each injected run `llm.usage.sync_usage`
writes one `trading.llm_usage` row per call (cached ones too, with the estimated cost) and today's real
request counts into `trading.quota_usage` (the panel's quota bars; limit = the cap).

**Model IDs** live only in `config/models.yaml` (pinned, no `-latest`): Gemini `gemini-3.5-flash-lite`,
DeepSeek `deepseek-flash`, Groq `openai/gpt-oss-120b`, guard `meta-llama/llama-prompt-guard-2-86m`. Change a
model, timeout, retry count, chain or output budget there; prices for the DeepSeek cost cap too.

Tests are offline (respx; recorded reply shapes in `tests/unit/llm_support.py`). Live smoke test, ~1 Gemini,
1 DeepSeek, 1 Groq and 2 Prompt Guard calls (`KAPTAN_LLM_RECORD=1` saves the reply bodies, never headers):
`uv run pytest -m live -s tests/integration/test_llm_smoke_live.py`.

## KAP ingestion (M2, `kaptan.ingest`, `kaptan.text`)

Real disclosures from kap.org.tr through our own async httpx client (`ingest/kap_client.py`; the
`kap-client` package cannot resolve BIST tickers and is not a dependency). **Off by default:** demo mode
stays the default and nothing talks to KAP unless `KAP_LIVE=true`.

| Endpoint | Used for |
|---|---|
| `POST /tr/api/disclosure/list/main` (`dd.MM.yyyy`) | live poller (has the 32-hex OID and the filer's MKK member OID) |
| `POST /tr/api/disclosure/members/byCriteria` (`yyyy-MM-dd`, ≤ 2000 rows/answer) | backfill, one day at a time |
| `GET /tr/api/company/items/IGS/A` | issuers: MKK member OID ↔ BIST code(s) → `core.companies` / `core.tickers` |
| `GET /tr/api/BildirimPdf/{idx}` (PDF → text with `pypdf`) | full text, primary (forms come out as "label value" lines) |
| `GET /tr/Bildirim/{idx}` (Next.js RSC payload) | fallback; TR + EN (`content-tr` / `content-en` cells) |

```bash
uv run alembic upgrade head                                            # 0007: KAP tables/columns
KAP_LIVE=true uv run python -m kaptan.workers.ingest_worker            # poller + detail fetcher (1 replica)
uv run python -m kaptan.ingest.backfill --from 2026-10-15 --to 2026-10-16
uv run python -m kaptan.ingest.backfill --from 2025-01-01 --to 2025-01-31 --details --drain 20 --raw-dir ../data/raw
```

**Politeness (MKK runs a WAF; academic, non-commercial use, data not redistributed):** one KAP request at
a time per process, ≥ `KAP_MIN_INTERVAL_S` (2 s) apart + 0–25 % jitter, real browser User-Agent with
`Origin`/`Referer`. 429/5xx/timeouts: backoff 2, 4, 8 … s (cap 300 s, `Retry-After` honoured, ≤
`KAP_MAX_RETRIES`). A WAF signal (HTTP 666/403, an HTML page or an empty body where JSON/PDF was
expected) is never retried quickly: the poller backs off 60 → 120 → 300 → 600 s, the detail queue
pauses 10 min, the backfill stops (exit 2) and resumes at the same day on the next run.

**Poller** (`ingest/kap_poller.py`): today's `list/main`; Istanbul weekdays 08:00–19:00 every
`KAP_POLL_SESSION_S` (30 s, the setting refuses less), evenings/weekends `KAP_POLL_OFFHOURS_S` (60 s),
00:00–08:00 `KAP_POLL_NIGHT_S` (300 s); jitter only upwards. Cursor = `max(disclosure_index)` of KAP rows
in Postgres; every 10 min the whole day is reconciled (late lower indexes → `ingest_source='reconcile'`);
the first poll of a new day also reads the previous day. The member list is refreshed once a day.

**Storage** (07 §3): dedup by `disclosure_index` (`ON CONFLICT … DO UPDATE` of mutable fields only;
`published_at`/`available_at` never change, `first_seen_at` is filled once). Real rows have `origin='kap'`;
M1's demo rows are `origin='demo'` and ingestion never modifies them (an index clash is skipped).
Live rows: `first_seen_at` = our clock, `available_at = max(first_seen_at, published_at)`; backfill rows:
`first_seen_at` NULL, `available_at = published_at + 60 s`, `visible=false`. Issuer link: the filer's MKK
OID, else the first *listed* code among `stockCode`/`relatedStocks` (KAP-forwarded notices and brokers
filing about a listed company go to that company). `subject_route` / `is_noise` / subject-map
`classification` come from `ingest/subject_routes.py` (noise by **subject**, not class). Raw list rows go to
`ops.ingest_raw` (one row per changed payload), the backfill to `ops.ingestion_runs` (resumable).

**Texts and parsers:** target routes (E1–E4, `llm`) are queued in `ops.detail_fetch_queue` (priority 0
live, 1 holdout 2025–2026, 2 older); the worker's detail loop stores `core.disclosure_texts` (NFC,
invisible/bidi characters removed, `body_norm` = Turkish-lowercased key for search, `source`,
`extractor_version`, `payload_sha256`) and `core.disclosures.parsed` from the type parser
(`ingest/parsers/`: buyback transactions, insider-trade rows, new business / tender amounts with currency
and binding cues, financial-report line items, ÖDA explanation). The form's "Güncelleme mi? / Düzeltme
mi?" answers set `reason` (NEW/UPD/CORR). Person names are not extracted (KVKK).

**SSE / counters:** outside `DEMO_MODE`, every new visible row is published as `disclosure` and then one
`counters` on the feed stream (after commit, via `kaptan.events.publish`); `visible` = today's feed
(earlier KAP rows are hidden at each poll so the counters stay "today"). With `DEMO_MODE=true` the worker
still stores KAP rows but invisible and publishes nothing. Note: `/demo/reset` truncates
`core.disclosures` (and the KAP texts/queue with it), so run live ingestion against a non-demo database.

Tests are offline on recorded fixtures (`tests/fixtures/kap_json/` two days of `list/main`, one
`byCriteria` day, the member list; `detail_text/`, `detail_pdf/`, `detail_html/`; see its `manifest.json`).
Live smoke test (4 KAP requests): `uv run pytest -m live tests/integration/test_ingest_live.py`.

## Agent feed and durable runs (M2, `kaptan.agents.feed`, `kaptan.agents.checkpoint`)

New KAP disclosures reach the agent graph through a Redis stream; the graph's state can live in Postgres.
Both are opt-in: with the defaults (`KAP_LIVE=false`, `CHECKPOINTER=memory`) M1 behaves exactly as before.

```bash
uv run alembic upgrade head                                            # 0010: ops.agent_feed + schema agent_ckpt
KAP_LIVE=true DEMO_MODE=false uv run python -m kaptan.workers.ingest_worker      # producer
KAP_LIVE=true DEMO_MODE=false LLM_MODE=live CHECKPOINTER=postgres \
  uv run python -m kaptan.workers.agent_worker                                     # consumer (1 replica)
```

**Why a separate worker, not the API lifespan:** the API stays the M1 process (demo/replay, no LLM spend),
live spend sits in one process with its own cap, and a crash/restart of the agent loop never touches a
request. The API only opens the configured checkpointer in its lifespan (so demo runs use it too).

**Feed** (`kaptan:kap.disclosures`, consumer group `agent-worker`): the poller appends `listed` for each
new visible KAP row, the detail fetcher appends `text` once the full text is stored
(`ingest/publish.py publish_to_agents`, `SET NX` marker per index + stage, so polls/reconciles never
duplicate). The consumer keeps one `ops.agent_feed` row per disclosure index (idempotency key):

| Status | Meaning |
|---|---|
| `skipped` | out of scope: not a live KAP row (`not_kap`, `backfill`), subject route not E1–E4/`llm` (`route:noise`, `route:archive_only`, `route:avoid:*`), or no ticker; no run |
| `awaiting_text` | in scope, TR text not stored yet; the `text` entry starts the run |
| `capped` | `hourly_cap` (more than `AGENT_MAX_RUNS_PER_HOUR`, default 6, runs that reached an LLM in the last hour; pre-gate vetoes with 0 calls do not count) or `llm_daily_cap` (every live provider over its `LLM_CAP_*` for the day); not retried |
| `running` | started; a restart resumes it (not counted against the hour again) |
| `waiting_approval` / `done` | the run is persisted; parked runs are settled (see below) |
| `failed` | the run raised 3 times |

A run is `run-live-<index>` (`run_set='live'`, `mode='paper'`, real published/available times) and is
written like an injected demo run, in one transaction with its feed row: `trading.agent_runs`,
`core.disclosures.run_id` + classification, proposal + pending card (`prop-live-<index>`), today's LLM
counters, the audit outcome. After commit its SSE events go out at once (node/crew/classification/
`approval.requested`/done/counters), so the panel shows it through the existing `/runs`, `/approvals`
and `/stream/*` endpoints. The stream entry is **acknowledged only after that commit**; on start the
worker reads its own pending entries first and `XAUTOCLAIM`s entries idle > 5 min. A redelivered entry
of a persisted run is just acknowledged.

**Checkpointer** (`CHECKPOINTER=memory|postgres`, default `memory`): `memory` stays the default because
the unit tests compile the graph without a database and replay must stay byte-identical; nothing else
changes with `postgres`. Postgres uses `langgraph-checkpoint-postgres`'s `AsyncPostgresSaver` on its own
small pool with `search_path=agent_ckpt`. Migration 0010 (owner role) creates the tables with the
library's own `setup()` statements and versions, so the app role needs no DDL; at start-up the saver only
checks the version (a newer library version → `setup()`, or a clear "apply it as the owner" error).
The thread id of a live run is its run id, so a run that died mid-graph continues from its last
super-step (the analysts' LLM calls are not paid again), and a run parked at `approval` survives a
restart. **Settling** (worker start + every minute): a parked run whose card was approved/rejected is
resumed with that decision, one past `expires_at` (or cancelled) is resumed with `expire` and its card
marked `expired`; then the run is `completed`. With `memory` a restart loses the thread and the run is
closed without a resume (`reason = "<decision>:no_checkpoint"`). Still in-memory: the demo timers in the
API (SimBIST fill 1.8 s after an approval, run animation, loss simulation, live ticker); a restart drops
a pending fill (the order stays `accepted`).

Tests: `tests/integration/test_feed.py` (fake disclosures, replay LLM: idempotency, skipping, caps,
ack/replay after a crash, settling, the worker loop) and `tests/integration/test_checkpoint_postgres.py`
(resume after a simulated restart, a mid-graph crash that continues without re-calling the analysts).

## RAG: the disclosure archive (M2, `kaptan.rag`)

Earlier KAP disclosures, found by hybrid search, for the analysts ("benzer geçmiş bildirimler").
One table, `rag.rag_chunks` (migration 0012, 07 §9: `base_type='disclosure_archive'`; event memory and
regulation come later), with an HNSW index (cosine) on `embedding vector(1024)`, a `turkish` `tsvector`
and a `pg_trgm` index on `content_norm`.

| Piece | What it does |
|---|---|
| `config/rag.yaml` | pinned embedding model **`gemini-embedding-001`** (version `001`), `outputDimensionality` **1024** (Matryoshka, then L2-normalised; bge-m3's size), chunker and RRF knobs |
| `rag/embed.py` | `Embedder` protocol. `CachedEmbedder` = the choke point: person names masked (`mask_persons`, as in the LLM chain), Redis cache (model+version+dim+task+text hash, 30 days), daily caps `RAG_EMBED_CAP_RPD` (500 batch calls) / `RAG_EMBED_CAP_TPD` (1.5 M est. tokens), batches of `RAG_EMBED_BATCH` (16), ≥ `RAG_EMBED_MIN_INTERVAL_S` apart. Backends: Gemini `batchEmbedContents` (key in `x-goog-api-key`), and a deterministic fake (hashed Turkish 5-prefix stems, no network) for tests/replay (`RAG_EMBEDDER=fake`). |
| `rag/chunking.py` | 07 §11.1: header `[TICKER \| date \| subject \| class \| kap:idx]` on every chunk; KAP form boilerplate dropped; ≤ 500 est. tokens = one chunk, else paragraph units packed to 400 (max 700) with a one-unit overlap; sentence splitting knows "A.Ş.", "Ltd. Şti.", "vb.", "1.234,56", "16.10.2026" |
| `rag/index.py` | backfill CLI + ingest hook; idempotent (`content_sha256` + embedder version), stale chunks removed, each vector stores `embed_model` + `embed_version` |
| `rag/hybrid.py` | `similar_disclosures(conn, embedder, as_of=…, text=… \| disclosure_index=…, k, ticker, event_type)`: dense + `turkish` full text (OR of the query's terms) + trigram (short queries), RRF k=60 per disclosure. **No look-ahead:** every leg filters `published_at < as_of AND available_at <= as_of`; only vectors of the running model are compared; the query disclosure is excluded |
| `rag/agent_context.py` | `attach_similar(conn, ctx)`: fills `RunContext.similar` (agents/context.py) with `as_of` = the disclosure's `available_at`; the reader, materiality, evidence and skeptic prompts get `similar_disclosures` in TASK_CONTEXT (ref_id `doc:<idx>:<chunk>`, ticker, event type, subject, date, citation `kap:<idx> (<date>)`, score; never the snippet text). **Live mode only** (`provider.name == "live"`, `RAG_CONTEXT_K`, default 5, 0 = off); replay never calls it, so replay stays byte-identical. A failure leaves the context unchanged. |

```bash
uv run alembic upgrade head                                       # 0012: rag.rag_chunks
uv run python -m kaptan.rag.index --since 2026-10-15 --dry-run    # chunk counts, no embedding
uv run python -m kaptan.rag.index --since 2026-10-15              # RAG_EMBEDDER (default gemini)
uv run python -m kaptan.rag.index --since 2025-01-01 --until 2025-02-01 --summaries --embedder fake
```

Exit codes: 0 done, 2 embedder unavailable (no key), 3 stopped by a cap or a provider error (rerun: resumes).

**Ingest hook (for the KAP → worker feed):** `from kaptan.rag.index import index_new_disclosures` and
`await index_new_disclosures(conn, [disclosure_index, ...])` after `core.disclosure_texts` is written.
Off unless `RAG_INDEX_ON_INGEST=true`; never raises (returns `IndexStats`, errors logged without text);
works inside the caller's transaction (savepoint). A context builder for live runs calls
`ctx = await kaptan.rag.agent_context.attach_similar(conn, ctx)` (`agents/scenario.build_context` does).

**Eval** (offline, committed fixtures: 11 recorded texts + ~430 header/summary distractors of the two
recorded days; 13 hand-labelled queries: 9 disclosure→disclosure pairs, 4 Turkish text queries):
`uv run python scripts/rag_eval.py [--embedder gemini --no-distractors]` (test database; ~2 embedding calls live).

| Corpus / embedder | leg set | recall@1 | recall@3 | recall@5 | MRR |
|---|---|---|---|---|---|
| 11 texts, Gemini | hybrid | 0.718 | 0.949 | 1.000 | 1.000 |
| 11 texts, Gemini | dense | 0.718 | 1.000 | 1.000 | 1.000 |
| 11 texts, any embedder | fts | 0.679 | 0.833 | 1.000 | 0.962 |
| 11 texts, fake | hybrid | 0.679 | 0.872 | 0.962 | 0.962 |
| + distractors, fake | hybrid | 0.615 | 0.692 | 0.731 | 0.769 |

recall@1 cannot exceed 0.718 (several queries have 2–3 relevant disclosures). With distractors the
"misses" are same-subject disclosures without a fetched text (unlabelled but relevant): same-event
precision@1 is 1.0. Tests: `tests/unit/test_rag_*.py`, `tests/integration/test_rag_db.py` (fake
embedder; no-look-ahead to the second). Live smoke test (2 embedding calls):
`uv run pytest -m live tests/integration/test_rag_live.py`.

## The risk gate on the real desk (M3, `kaptan.risk`)

Outside the demo the gate reads the desk as it is; the demo keeps its seeded desk, so replay is unchanged.

- **Limits (FR-33).** Every run (`agents.context.with_active_limits`) and every at-send check reads the
  `active` limit version (`risk/active_limits.py`); a two-signature change applies to the next run. Keys are
  `GateLimits` field names; `risk_tolerance` (R07 lot-rounding band, default 1.05) and the other gate-only
  keys keep their documented defaults when the version has no row. Live audit outcomes carry `limits_version`.
- **Live desk (`risk/desk.py`, `risk/book.py`; real runs = `LLM_MODE=live`, or `LiveDeps(live_desk=True)`).**
  Equity = `PAPER_CAPITAL_TRY` (default 1 000 000) + fill cash flows + positions × point-in-time raw marks;
  free cash = equity − open notional − unfilled SimBIST buys; day start / peak from `trading.pnl_daily`.
  R04 age = now − `core.restriction_refresh` (the tedbir job calls `mark_restrictions_refreshed`; no row =
  stale = HOLD), R11 KAP delay = available − published, R09 price age (intraday orders, session open only;
  `core.prices_intraday` when filled), P7 entries today, P3/P4 sector/group exposure (`core.issuer_groups`,
  else `core.issuers.group_name`; unknown group = the sector's exposure), `schema_ok` = the proposal
  validates as `TradeProposal`. `GET /risk/status` shows the marked book when `DEMO_MODE=false`.
- **R16 before the order (FR-28).** Approving a real run's card (`run_set='live'`) re-runs R01–R04, R09, R12,
  R13 inside the decision transaction; a failure is audited (`risk.rejected`, `system:risk_gate`), the card
  stays pending and the API answers 409 `kill_switch` / `halted` / `conflict` with the R16 text.
- **Jobs (the scheduler comes later; all skip under `DEMO_MODE`):** `risk.monitor.run_risk_monitor(conn, now)`
  every 5 min in session (−1 % daily → `halted_today` + SSE `halt`, lifted at the next session; −5 % from the
  peak → kill switch by `system:risk_monitor` + SSE `kill_switch`; after a restart the peak stays, −4.9 % floor
  until a further −3 %); `risk.pnl_eod.run_pnl_eod(conn, day)` after 18:30 (strategy + `baseline:xu100_bh` +
  `baseline:ew_universe`); `risk.regime.run_regime(conn, day)` (06 §9, `trading.regime_daily`, 5-session exit).
- **Personal mode (`KAPTAN_MODE=personal`):** the kill-switch restart needs ≥ 24 h between the two signatures
  and ≥ 5 sessions since the kill (409 `conflict` until then).

## Deploy-ready backend (M3 A5, `kaptan.ops`) — runs anywhere with Docker, no provider config

**From scratch** (the image serves `api | ingest_worker | agent_worker | scheduler | migrate | bootstrap | dlq`):

```bash
cd backend
cp prod.env.example prod.env          # fill in (hex passwords; PASSPHRASE_HASH in single quotes); gitignored
docker compose -f docker-compose.prod.yml --env-file prod.env up -d --build
curl -s http://127.0.0.1:8000/readyz  # {"status":"ready","checks":{"db":"ok","redis":"ok","migrations":"ok"},…}
```

Order: postgres/redis healthy → `db-roles` (`python -m kaptan.bootstrap roles`: app role, extensions — the SQL
of `db/init/00_roles.sh`, for a managed Postgres too) → `migrate` (`python -m kaptan.ops.migrate`, owner role,
the only process that needs `DATABASE_OWNER_URL`) → `bootstrap` (`python -m kaptan.bootstrap`: team users,
limits v1 `rules-v1.0`, `risk_state`, quota rows, `live_arm` all off; idempotent; `--users team.yaml` with
`password_env` per person, argon2id, never printed) → api + workers. Workers exit 0 unless `KAP_LIVE=true`.

| Concern | What |
|---|---|
| Image | `Dockerfile`: multi-stage uv (`uv sync --locked --no-dev`), non-root uid 10001, read-only rootfs in compose, `HEALTHCHECK` = `python -m kaptan.ops.healthcheck` (API `/healthz`, workers their Redis heartbeat), no secrets (`.dockerignore`) |
| Prod checks (NFR-08) | `KAPTAN_ENV=prod` refuses to start with `DEMO_MODE=true`, `COOKIE_SECURE=false`, empty `ALLOWED_ORIGINS`, a Redis URL without password, `LLM_MODE=live` without a key, a weak `JWT_SECRET`, a non-argon2 `PASSPHRASE_HASH` (all listed at once; never a value) |
| Health | `/healthz` liveness, `/readyz` 503 on DB/Redis down or schema ≠ alembic head (migration 0017 lets the app role read `alembic_version`); the API logs an error at startup when the schema is behind; `/api/v1/health` unchanged |
| Logs | `ops/logs.py`: text in dev, JSON lines in prod (`LOG_FORMAT`), `request_id` (`X-Request-ID`), `run_id`, `disclosure_index`; redaction of URL passwords, Bearer/JWT, provider keys, argon2 hashes, the configured secrets, and disclosure texts in `extra=`; own access log without query strings |
| Workers | `ops/runtime.py`: SIGTERM → stop event, the unit in flight finishes and is acked (45 s drain, then cancel), heartbeat `kaptan:hb:<component>`, Postgres advisory-lock leader guard (a 2nd instance waits) |
| Security headers | nosniff, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS in prod; plain ASGI so SSE streams untouched |
| Rate limits (NFR-09) | login `LOGIN_RATE_PER_MINUTE`/IP, mutations `MUTATION_RATE_PER_MINUTE`/user (raised with the e2e override); Redis sliding window in prod (`RATE_LIMIT_BACKEND`), in-process fallback; `TRUSTED_PROXIES` for `X-Forwarded-For` |
| Refresh grace | `REFRESH_GRACE_S` (default 0 = M1 behaviour, compose prod 10): a just-rotated token may be presented again inside the window |
| Metrics | `/metrics` (`METRICS_TOKEN` Bearer or loopback): KAP lag/WAF, agent stream pending/DLQ, graph duration, LLM tokens/quota, risk rejects, approvals pending, audit_chain_ok, heartbeats |
| DLQ | feed entries failing 3× → `kaptan:kap.dlq`; `python -m kaptan.ops.dlq list` / `redrive --all\|--index N [--dry-run]` |
| Backups | `ops/backup.sh` (pg_dump -Fc, optional `AGE_RECIPIENTS`, retention) via `--profile backup run --rm backup` (cron nightly); `ops/restore.sh <file>` into an empty DB; `python -m kaptan.ops.backup verify --url …` walks the audit chain |
| Secrets | SOPS/age: `../docs/ops/SOPS-AGE.md`, `../.sops.yaml` (placeholders); gitleaks CI job + `../.gitleaks.toml` |

**Coverage gates (NFR-14).** CI reports risk 100 %, ingest 85 %, brokers+domain 90 % (line+branch) after the
suite; they are **warn-only** (`continue-on-error`) while other M3 packages change those modules. To enforce,
remove `continue-on-error: true` from the three "Coverage gate" steps in `.github/workflows/ci.yml`.
