import type { SourceQuote } from "@/lib/domain";

/**
 * Highlights for the disclosure text: the explain payload's `source_spans` plus every
 * verbatim agent quote found in the text (quotes are checked against the source by the
 * graph, 05 quote_check). Overlapping ranges merge; fields are kept for the legend.
 */
export interface Span {
  start: number;
  end: number;
  fields: string[];
}

export interface Segment {
  text: string;
  fields: string[] | null;
}

export function quoteSpans(text: string, quotes: readonly (SourceQuote & { source?: string })[]): Span[] {
  const out: Span[] = [];
  for (const q of quotes) {
    const needle = q.quote.trim();
    if (needle.length < 4) continue;
    const at = text.indexOf(needle);
    if (at >= 0) out.push({ start: at, end: at + needle.length, fields: [q.source ? `${q.source}:${q.field}` : q.field] });
  }
  return out;
}

/** Sort and merge overlapping or touching spans; clamp to the text. */
export function mergeSpans(spans: readonly Span[], length: number): Span[] {
  const clean = spans
    .map((s) => ({ start: Math.max(0, Math.min(s.start, length)), end: Math.max(0, Math.min(s.end, length)), fields: s.fields }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Span[] = [];
  for (const s of clean) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, s.end), fields: [...new Set([...last.fields, ...s.fields])] };
    } else {
      merged.push({ ...s, fields: [...s.fields] });
    }
  }
  return merged;
}

export function segmentText(text: string, spans: readonly Span[]): Segment[] {
  const merged = mergeSpans(spans, text.length);
  const out: Segment[] = [];
  let cursor = 0;
  for (const s of merged) {
    if (s.start > cursor) out.push({ text: text.slice(cursor, s.start), fields: null });
    out.push({ text: text.slice(s.start, s.end), fields: s.fields });
    cursor = s.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), fields: null });
  return out;
}

/** Instruction-like phrases the guard's regex looks for (shown as data, never obeyed). */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /SİSTEM NOTU:[^\n]*/giu,
  /önceki (tüm )?talimatları yok say[^\n.]*/giu,
  /ignore (all )?previous instructions[^\n.]*/giu,
];

export function injectionSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const re of INJECTION_PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (m.index !== undefined) out.push({ start: m.index, end: m.index + m[0].length, fields: ["injection"] });
    }
  }
  return out;
}
