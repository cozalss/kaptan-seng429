import { classify, plainLine } from "./classify";
import { mineOf, type Lists, type State } from "./db";
import { refine } from "./gemini";
import type { Classified, KapRow } from "./types";

/** How far back a first look reaches (backend telegram/dispatch.py LOOKBACK). */
export const LOOKBACK_MS = 3 * 3600_000;
const CHUNK = 80;

interface Candidate {
  row: KapRow;
  cls: Classified | null;
}

async function known(db: D1Database, ids: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { results } = await db
      .prepare(`SELECT idx FROM events WHERE idx IN (${part.map(() => "?").join(",")})`)
      .bind(...part)
      .all<{ idx: number }>();
    for (const r of results) out.add(r.idx);
  }
  return out;
}

/**
 * Stores what is worth keeping from today's KAP rows: every important disclosure (the morning message lists them)
 * and, for the "daha çok" level, the other disclosures of watched stocks. Returns how many new events were stored.
 */
export async function ingest(env: Env, db: D1Database, state: State, lists: Lists, rows: KapRow[], now: number): Promise<number> {
  const since = Math.max(now - LOOKBACK_MS, state.pairedAt ?? now);
  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (row.publishedAt < since || !row.ticker) continue;
    const mine = mineOf(row.ticker, lists);
    const cls = classify(row, mine);
    if (cls || mine === "watched") candidates.push({ row, cls });
  }
  if (!candidates.length) return 0;
  const have = await known(db, candidates.map((c) => c.row.index));
  const fresh = candidates.filter((c) => !have.has(c.row.index));
  const statements: D1PreparedStatement[] = [];
  for (const { row, cls } of fresh) {
    const ticker = row.ticker as string;
    const mine = mineOf(ticker, lists);
    const final = cls && mine ? await refine(env, state, db, row, cls, now) : cls;
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO events (idx, ticker, company, kind, important, line, tone, so_what, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          row.index,
          ticker,
          row.company || ticker,
          final?.kind ?? null,
          final ? 1 : 0,
          final?.line ?? plainLine(row),
          final?.tone ?? "belirsiz",
          final?.soWhat ?? null,
          row.publishedAt,
        ),
    );
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  return statements.length;
}
