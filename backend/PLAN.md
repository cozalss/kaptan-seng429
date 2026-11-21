# KAPtan backend: how the parts fit

This file was the work plan of the first build (four roles, a demo day, SimBIST). That model is gone: KAPtan is for
one person, runs on real data only, and keeps one book, the person's own. [README.md](README.md) has the run
instructions and decisions; the API contract is [`../kaptan-panel/API.md`](../kaptan-panel/API.md) and the zod schemas
in `../kaptan-panel/src/lib/` decide every response shape. The old plan is in git history (commit be4a4de and before).

## The flow

1. **Read.** `workers/ingest_worker` polls KAP and stores disclosures (`ingest/`); `prices/` stores raw daily bars.
2. **Think.** `workers/agent_worker` consumes the feed (`agents/feed.py`): caps, quota and the starting-money check
   decide whether a disclosure gets a run; the LangGraph pipeline (`agents/`, `rules/`, `llm/`) ends in a proposal.
3. **Gate.** `risk/gate.py` (R03–R16; R01 and R02, the old stop rules, are retired) judges the proposal against the person's real book (`risk/book.py`, `risk/desk.py`).
   A card appears in `/approvals`.
4. **Decide.** The person approves (`approvals/service.py`). That writes a ticket only (`brokers/ticket.py`,
   `GuardedBroker`: cooldown and hard cap, checked again at send; a refusal is a 409 and the
   approval is rolled back).
5. **Record.** The person enters the order at their own bank and marks the ticket entered with the real fill
   (`approvals/service.mark_ticket`): `portfolio/` opens or closes the position and `portfolio/ledger.py` moves cash.
6. **Watch.** There is no stop and no automatic brake: a loss never halts anything, the person decides.
   `portfolio/exits.py` (after the 18:30 prices) raises X1–X6 exit suggestions for positions a ticket opened;
   `risk/pnl_eod.py` closes the day. `alerts/` tells the person (no ticker, no amount) and `ops/system_status.py`
   says whether KAPtan is really working.

## The one book (`trading.book_ledger`, migration 0026)

Every movement of the person's money and shares is a ledger row: `start`, `deposit`, `withdrawal`, `holding` (a
share owned before KAPtan), `buy`, `sell`. Cash, shares and the money put in are sums over it
(`risk/book.py` `own_book`). A deposit or withdrawal is an outside flow: the day-start level and the peak are
shifted by it, so it is neither a gain nor a loss. Before the `start` row exists the book is empty, every number is
0, `needs_setup` is true, and no run reaches an LLM (`waiting_for_money`).

| Endpoint | What |
|---|---|
| `GET /me/overview`, `GET/POST /me/money` | the home screen figures; start, deposit, withdrawal |
| `POST /me/holdings`, `POST /me/holdings/{id}/sell` | a share owned before KAPtan; selling it |
| `GET /approvals`, `POST /approvals/{id}/decision` | suggestions; approve = ticket |
| `GET /tickets`, `POST /tickets/{no}/mark` | the ticket; the real fill with its commission (late fills kept, flagged) |
| `GET /portfolio/positions`, `/portfolio/pnl`, `GET /risk/status` | the same book, marked to the last stored price |
| `GET /system/status`, `GET /me/alerts`, `POST /me/alerts/test` | is it working; phone / e-mail alerts |

## Rules for changes

- The zod schema decides a response; the pydantic mirror (`domain/schemas/`) follows it. After a panel schema change:
  `node tests/contract/export_schemas.mjs`.
- A write is `async with conn.transaction():` around the state change and its audit record
  (`audit/writer.append`); publish SSE after the commit. Book writes take `ledger.lock()` first.
- Time comes from `app.state.clock.now()`, never `datetime.now()`, for domain time.
- Money is Decimal inside (`cents()`), JSON numbers outside.
- New SQL is one migration (`migrations/versions/00NN_*.py`); never edit an earlier one.
- Tests: `tests/harness/` holds the recorded fixture day, the replay LLM and the fixed clock, test doubles only.
  Tests on the own book start from `empty_book` and `start_money` (`tests/integration/order_support.py`).
  Each parallel worker uses its own test database and Redis DB through `TEST_DATABASE_URL`,
  `TEST_DATABASE_OWNER_URL` and `REDIS_URL`.
- Done = `uv run pytest` (coverage at least 90 %), `ruff check`, `ruff format --check`, `mypy` clean.

## Open (needs something from outside)

A real broker adapter (orders stay manual by design), a hosted deployment (free hosting only, runs on the person's
PC), the human-labelled golden sets, LangSmith, EVDS macro series.
