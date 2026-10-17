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

Panel: `NEXT_PUBLIC_API_MODE=http KAPTAN_API_ORIGIN=http://127.0.0.1:8000 npm run dev` in `kaptan-panel/`.

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
