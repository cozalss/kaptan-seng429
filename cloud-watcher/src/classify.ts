import data from "./generated/subject_map.json";
import { normKey, trLower } from "./norm";
import type { Classified, KapRow, Tone } from "./types";

type Reading = { line: string; tone: Tone; so_what: string | null };
const LINES = data.lines as unknown as Record<string, Reading>;
const ROUTES = data.routes as Record<string, string>;
const ROUTE_KINDS = data.route_kinds as Record<string, string>;
const SUBJECT_LINES = data.subject_lines as unknown as Record<string, [string, string]>;
const QUARTER = data.quarter_words as Record<string, string>;
const LINE_MAX = 140;

/** KAP subject -> route (noise | E1..E4 | llm | avoid:* | archive_only); unknown subjects are archive_only. */
export function routeFor(subject: string): string {
  return ROUTES[normKey(subject)] ?? "archive_only";
}

function clip(text: string, limit = LINE_MAX): string {
  const t = text.split(/\s+/).filter(Boolean).join(" ");
  return t.length <= limit ? t : t.slice(0, limit - 1).trimEnd() + "…";
}

function reading(kind: string, r: Reading | undefined): Classified {
  if (!r) throw new Error(`generated lines are missing for ${kind}`);
  return { kind, line: r.line, tone: r.tone, soWhat: r.so_what };
}

function earningsLine(row: KapRow): string {
  const period = row.finPeriod ?? "";
  if (row.finYear === null || !["1", "2", "3", "4"].includes(period)) return data.earnings_unknown_line;
  const words = period === "4" ? "yıllık" : QUARTER[period];
  return `${row.finYear} ${words} finansal tablolarını açıkladı.`;
}

/** Insider direction from the list row alone (the backend also reads the parsed form; the Worker never sees it). */
function direction(summary: string): "buy" | "sell" | null {
  const low = trLower(summary);
  const buys = low.includes("alım");
  const sells = low.includes("satım") || low.includes("satış");
  if (buys === sells) return null;
  return buys ? "buy" : "sell";
}

/**
 * The deterministic part of backend `Signal.important` + `signal.lines.read`: a KAP original (not an update), not
 * noise, with a usable ticker and a known kind. Null means "not important". `mine` only changes one so-what.
 */
export function classify(row: KapRow, mine: string | null = null): Classified | null {
  if (!row.isNew || !row.ticker || row.route === "noise") return null;
  const key = normKey(row.subject);
  if (row.route === "E2") {
    const d = direction(row.summary);
    if (d === null) return null;
    if (d === "buy") return reading("insider", LINES.insider_buy);
    return reading("insider", mine === "held" ? LINES.insider_sell_held : LINES.insider_sell);
  }
  const kind = ROUTE_KINDS[row.route];
  if (kind === "buyback") return reading(kind, LINES.buyback);
  if (kind === "contract") return reading(kind, key.includes("ihale") ? LINES.tender : LINES.contract);
  if (kind === "earnings") return { kind, line: earningsLine(row), tone: "belirsiz", soWhat: null };
  if (kind === "restriction") return reading(kind, LINES.restriction);
  const found = SUBJECT_LINES[key];
  if (!found) return null;
  const [k, base] = found;
  if (k === "capital") {
    const low = trLower(`${row.summary} ${key}`);
    const r = low.includes("bedelsiz") ? LINES.capital_bedelsiz : low.includes("bedelli") ? LINES.capital_bedelli : LINES.capital_other;
    return reading(k, r);
  }
  const tone = (k === "dividend" ? LINES.dividend : LINES.merger)?.tone ?? "belirsiz";
  const soWhat = (k === "dividend" ? LINES.dividend : LINES.merger)?.so_what ?? null;
  return { kind: k, line: clip(base), tone, soWhat };
}

/** What a non-important disclosure of a watched stock says: the KAP subject itself, tone unknown. */
export function plainLine(row: KapRow): string {
  return clip(row.subject || "Yeni bir bildirim yayımladı.");
}
