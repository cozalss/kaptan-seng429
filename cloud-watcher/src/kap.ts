import { routeFor } from "./classify";
import { addDays, kapDay } from "./time";
import type { KapRow } from "./types";

/** Same browser identity and endpoint as backend/src/kaptan/ingest/kap_client.py. */
export const KAP_BASE = "https://www.kap.org.tr";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const TICKER = /^[A-Z0-9]{3,6}$/;
const CLASSES = new Set(["ODA", "FR", "DG", "DKB", "DUY"]);
const IST_MS = 3 * 3600_000;

export type KapResult = { ok: true; rows: KapRow[]; skipped: number } | { ok: false; blocked: boolean; reason: string };

function codes(value: unknown): string[] {
  if (value == null) return [];
  const parts = Array.isArray(value) ? value : String(value).replace(/;/g, ",").split(",");
  const out: string[] = [];
  for (const p of parts) {
    const c = String(p).replace(/\s+/g, " ").trim().toUpperCase();
    if (TICKER.test(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/** "dd.MM.yyyy HH:mm:ss" (Istanbul local) -> epoch ms, or null. */
export function parseKapDate(s: unknown): number | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", sec = "0"] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)) - IST_MS;
}

function int(v: unknown): number | null {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

const squash = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

/** One `list/main` row ({disclosureBasic, disclosureDetail}) -> KapRow, or null when it cannot be used. */
export function parseRow(item: unknown): KapRow | null {
  const basic = (item as { disclosureBasic?: Record<string, unknown> } | null)?.disclosureBasic;
  if (!basic || typeof basic !== "object") return null;
  const detail = ((item as { disclosureDetail?: Record<string, unknown> }).disclosureDetail ?? {}) as Record<string, unknown>;
  const index = int(basic.disclosureIndex);
  const klass = squash(basic.disclosureClass).toUpperCase();
  const subject = squash(basic.title);
  const publishedAt = parseKapDate(basic.publishDate);
  if (index === null || index <= 0 || !CLASSES.has(klass) || !subject || publishedAt === null) return null;
  const route = routeFor(subject);
  const own = codes(basic.stockCode);
  const related = codes(basic.relatedStocks);
  // A holding filing a trade in its subsidiary's shares: the event is the traded company's.
  const ordered = route === "E2" ? [...related, ...own] : [...own, ...related];
  const relatedIndex = int(detail.relatedDisclosureIndex);
  const period = squash(basic.period);
  return {
    index,
    ticker: ordered[0] ?? null,
    company: squash(basic.companyTitle),
    subject,
    summary: squash(basic.summary),
    route,
    isNew: !(basic.relatedDisclosureOid || (relatedIndex !== null && relatedIndex > 0)),
    finYear: int(basic.year),
    finPeriod: period && period !== "-" ? period : null,
    publishedAt,
  };
}

/** Whether an answer is the WAF's page instead of JSON (backend `KapClient._check_blocked`). */
export function blockedAnswer(status: number, text: string, contentType: string): string | null {
  if (status === 403 || status === 666) return `HTTP ${status} (WAF)`;
  if (status >= 300) return null;
  if (!text.trim()) return "empty body";
  const head = text.slice(0, 200).trimStart().toLowerCase();
  if (contentType.includes("text/html") || head.startsWith("<!doctype") || head.startsWith("<html")) {
    return "HTML page instead of JSON";
  }
  return null;
}

async function listDay(base: string, date: string): Promise<KapResult> {
  const day = kapDay(date);
  const body = { fromDate: day, toDate: day, disclosureType: null, fundTypes: null, memberTypes: ["IGS"], mkkMemberOid: null };
  let res: Response;
  try {
    res = await fetch(`${base}/tr/api/disclosure/list/main`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain, */*",
        "user-agent": USER_AGENT,
        origin: base,
        referer: `${base}/tr/`,
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, blocked: false, reason: `network: ${(e as Error).name}` };
  }
  const text = await res.text();
  const block = blockedAnswer(res.status, text, res.headers.get("content-type") ?? "");
  if (block) return { ok: false, blocked: true, reason: block };
  if (res.status >= 300) return { ok: false, blocked: false, reason: `HTTP ${res.status}` };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, blocked: true, reason: "body is not JSON" };
  }
  if (!Array.isArray(data)) return { ok: false, blocked: false, reason: "not a JSON array" };
  const rows: KapRow[] = [];
  let skipped = 0;
  for (const item of data) {
    const row = parseRow(item);
    if (row) rows.push(row);
    else skipped += 1;
  }
  return { ok: true, rows, skipped };
}

/** Today's rows (and yesterday's when `alsoYesterday`: the midnight leak), deduplicated, oldest index first. */
export async function fetchKap(base: string, today: string, alsoYesterday = false): Promise<KapResult> {
  const days = alsoYesterday ? [addDays(today, -1), today] : [today];
  const all = new Map<number, KapRow>();
  let skipped = 0;
  for (const d of days) {
    const r = await listDay(base, d);
    if (!r.ok) return r;
    skipped += r.skipped;
    for (const row of r.rows) all.set(row.index, row);
  }
  return { ok: true, rows: [...all.values()].sort((a, b) => a.index - b.index), skipped };
}
