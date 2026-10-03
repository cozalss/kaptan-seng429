import type { DayCounters, DisclosureListItem, EventType, Order, SubjectRoute } from "@/lib/domain";
import { ISTANBUL_OFFSET_H } from "@/lib/time";
import { fmtDec, fmtInt } from "@/lib/format";

/**
 * Pure logic behind /inbox (FRONTEND-SPEC §2.2): filtering, live merges from /stream/feed,
 * the pipeline funnel (08 §8.1 #1) and keyboard triage. No React here; everything is tested.
 */

/* ── filters ─────────────────────────────────────────────────────────── */
export type EventFilter = "all" | "E1" | "E2" | "E3" | "E4" | "X" | "O" | "none";
export type RouteFilter = "all" | "event" | "llm" | "noise" | "archive" | "avoid";
export type ClassFilter = "all" | DisclosureListItem["disclosure_class"];

export interface InboxFilters {
  /** Free text: ticker, company or subject (Turkish-folded, diacritics ignored). */
  q: string;
  event: EventFilter;
  cls: ClassFilter;
  route: RouteFilter;
  /** Circuit-breaker noise is hidden by default (it is a third of the day). */
  showNoise: boolean;
}

export const DEFAULT_FILTERS: InboxFilters = { q: "", event: "all", cls: "all", route: "all", showNoise: false };

export const EVENT_FILTER_OPTIONS: ReadonlyArray<{ value: EventFilter; label: string }> = [
  { value: "all", label: "Sınıf: tümü" },
  { value: "E1", label: "E1 · Pay geri alımı" },
  { value: "E2", label: "E2 · Yönetici alımı" },
  { value: "E3", label: "E3 · Yeni iş / ihale" },
  { value: "E4", label: "E4 · Finansal sonuç" },
  { value: "X", label: "X · Filtre / kaçınma" },
  { value: "O", label: "O · Diğer" },
  { value: "none", label: "Sınıflanmamış" },
];

export const ROUTE_FILTER_OPTIONS: ReadonlyArray<{ value: RouteFilter; label: string }> = [
  { value: "all", label: "Rota: tümü" },
  { value: "event", label: "E-rotası (konu haritası)" },
  { value: "llm", label: "LLM'e gitti" },
  { value: "avoid", label: "Kaçınma filtresi" },
  { value: "archive", label: "Arşivlendi" },
  { value: "noise", label: "Devre kesici (gürültü)" },
];

export const CLASS_FILTER_OPTIONS: ReadonlyArray<{ value: ClassFilter; label: string }> = [
  { value: "all", label: "Tür: tümü" },
  { value: "ODA", label: "ODA · Özel durum" },
  { value: "FR", label: "FR · Finansal rapor" },
  { value: "DG", label: "DG · Diğer" },
  { value: "DKB", label: "DKB · Değişiklik" },
  { value: "DUY", label: "DUY · Duyuru" },
];

/** Lowercase in Turkish, then drop diacritics so "ornek" finds "ÖRNEK ENERJİ". */
export function foldTr(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function routeGroup(route: SubjectRoute): Exclude<RouteFilter, "all"> {
  if (route === "noise") return "noise";
  if (route === "archive_only") return "archive";
  if (route === "llm") return "llm";
  if (route.startsWith("avoid:")) return "avoid";
  return "event";
}

/** X/O codes as in the eval docs (FRONTEND-SPEC §9 Ç-2). */
export function eventCodeOf(type: EventType | null | undefined): Exclude<EventFilter, "all" | "none"> | null {
  if (!type) return null;
  if (type === "FILTER") return "X";
  if (type === "IGNORE") return "O";
  return type;
}

export function matchesFilters(row: DisclosureListItem, f: InboxFilters): boolean {
  if (!f.showNoise && row.is_noise && f.route !== "noise") return false;
  if (f.route !== "all" && routeGroup(row.subject_route) !== f.route) return false;
  if (f.cls !== "all" && row.disclosure_class !== f.cls) return false;
  if (f.event !== "all") {
    const code = eventCodeOf(row.classification?.event_type);
    if (f.event === "none" ? code !== null : code !== f.event) return false;
  }
  const q = foldTr(f.q.trim());
  if (q) {
    const hay = foldTr([row.primary_ticker ?? "", ...row.stock_codes, row.company_name, row.subject, String(row.disclosure_index)].join(" "));
    if (!q.split(/\s+/).every((part) => hay.includes(part))) return false;
  }
  return true;
}

export function filterRows(rows: readonly DisclosureListItem[], f: InboxFilters): DisclosureListItem[] {
  return rows.filter((r) => matchesFilters(r, f));
}

export function activeFilterCount(f: InboxFilters): number {
  return [f.q.trim() !== "", f.event !== "all", f.cls !== "all", f.route !== "all", f.showNoise].filter(Boolean).length;
}

/* ── live merges (/stream/feed) ──────────────────────────────────────── */
export interface FeedPatch {
  classification?: DisclosureListItem["classification"];
  linked_news_count?: number;
}

/** Newest first by publication time; ties keep the higher index on top. */
function byNewest(a: DisclosureListItem, b: DisclosureListItem): number {
  return Date.parse(b.published_at) - Date.parse(a.published_at) || b.disclosure_index - a.disclosure_index;
}

/**
 * Base rows (last fetch) + rows that arrived over SSE + per-row patches → one list.
 * A later fetch that already contains an arrival wins; patches always apply on top.
 */
export function mergeFeed(
  base: readonly DisclosureListItem[],
  arrivals: readonly DisclosureListItem[],
  patches: ReadonlyMap<number, FeedPatch>,
): DisclosureListItem[] {
  const seen = new Map<number, DisclosureListItem>();
  for (const r of arrivals) seen.set(r.disclosure_index, r);
  for (const r of base) seen.set(r.disclosure_index, r);
  return [...seen.values()]
    .map((r) => {
      const p = patches.get(r.disclosure_index);
      if (!p) return r;
      return {
        ...r,
        classification: p.classification !== undefined ? p.classification : r.classification,
        linked_news_count: p.linked_news_count ?? r.linked_news_count,
      };
    })
    .sort(byNewest);
}

/** Merge a patch into the patch map immutably. */
export function withPatch(map: ReadonlyMap<number, FeedPatch>, index: number, patch: FeedPatch): Map<number, FeedPatch> {
  const next = new Map(map);
  next.set(index, { ...(map.get(index) ?? {}), ...patch });
  return next;
}

/* ── counters, funnel, LLM cost ──────────────────────────────────────── */
/** "~0,4M" — tokens in millions with one decimal (11 Adım 1 wording). */
export function tokensLabel(tokens: number): string {
  if (tokens < 100_000) return `~${fmtInt(Math.round(tokens / 1000))}B`;
  return `~${fmtDec(tokens / 1_000_000, 1)}M`;
}

export function llmCostLabel(c: Pick<DayCounters, "llm_calls" | "llm_tokens">): string {
  return `Bugün: ${fmtInt(c.llm_calls)} çağrı · ${tokensLabel(c.llm_tokens)} token`;
}

/** Istanbul calendar date (YYYY-MM-DD) of an ISO instant. */
export function istanbulDate(iso: string): string {
  return new Date(Date.parse(iso) + ISTANBUL_OFFSET_H * 3_600_000).toISOString().slice(0, 10);
}

/** Orders with at least one fill on the counters' day (the funnel's last stage). */
export function filledToday(orders: readonly Order[], asOfIso: string): number {
  const day = istanbulDate(asOfIso);
  return orders.filter((o) => o.fills.some((f) => istanbulDate(f.filled_at) === day)).length;
}

export interface FunnelStage {
  key: "in" | "dropped" | "processed" | "candidates" | "gate" | "approved" | "filled";
  label: string;
  value: number;
  hint: string;
  /** A side exit (what left the pipeline without an LLM call), not a forward step. */
  exit?: boolean;
}

export function funnelStages(c: DayCounters, filled: number): FunnelStage[] {
  return [
    { key: "in", label: "Gelen", value: c.total, hint: "Bugün KAP'tan alınan bildirim" },
    {
      key: "dropped",
      label: "Elenen · LLM'siz",
      value: c.noise + c.archived,
      hint: `Devre kesici ${fmtInt(c.noise)} · arşiv ve kaçınma ${fmtInt(c.archived)} — LLM çağrısı 0`,
      exit: true,
    },
    { key: "processed", label: "Sınıflanan", value: c.processed, hint: "Grafa alınan bildirim (işleme alındı)" },
    { key: "candidates", label: "E-adayı", value: c.e_candidates, hint: "E1–E4 olarak sınıflanan" },
    { key: "gate", label: "Risk kapısı", value: c.proposals, hint: "Kural motoru ve risk kapısından geçen öneri" },
    { key: "approved", label: "Onay", value: c.approvals, hint: "Risk Officer onayı (insan)" },
    { key: "filled", label: "Dolum", value: filled, hint: "SimBIST paper dolumu (sanal para)" },
  ];
}

/** Bar height for a funnel stage: square-root scale so 1 of 212 is still visible. */
export function funnelBarPct(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0;
  return Math.max(4, Math.round(Math.sqrt(Math.min(1, value / total)) * 100));
}

/** Share of the previous forward stage, e.g. "%6". */
export function conversion(value: number, previous: number): number | null {
  if (previous <= 0) return null;
  return value / previous;
}

/**
 * Each stage's share: forward stages against the previous forward stage, the side exit
 * against everything that came in; the first stage has none.
 */
export function stageConversions(stages: readonly FunnelStage[]): Array<number | null> {
  const total = stages[0]?.value ?? 0;
  const out: Array<number | null> = [];
  let previous: number | null = null;
  for (const s of stages) {
    if (s.exit) {
      out.push(conversion(s.value, total));
      continue;
    }
    out.push(previous === null ? null : conversion(s.value, previous));
    previous = s.value;
  }
  return out;
}

/* ── keyboard triage ─────────────────────────────────────────────────── */
/** Move a selection by id through an ordered list (j = +1, k = −1). Clamps at both ends. */
export function moveSelection(ids: readonly number[], current: number | null, delta: number): number | null {
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return delta >= 0 ? (ids[0] as number) : (ids[ids.length - 1] as number);
  const next = Math.min(ids.length - 1, Math.max(0, at + delta));
  return ids[next] as number;
}

/** True when a key event comes from a text field (shortcuts must not fire there). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/* ── pre-screen explanation (US-03, FR-22) ───────────────────────────── */
export interface PreScreen {
  code: string;
  label: string;
  llmCalls: "0" | "≥ 1";
  detail: string;
}

export function preScreenOf(row: Pick<DisclosureListItem, "subject_route" | "subject_map_version" | "subject">): PreScreen {
  const r = row.subject_route;
  const g = routeGroup(r);
  if (g === "noise") return { code: r, label: "Devre kesici · elendi", llmCalls: "0", detail: "Otomatik devre kesici bildirimi; konu haritası ilk adımda eler." };
  if (g === "archive") return { code: r, label: "Arşivlendi", llmCalls: "0", detail: `“${row.subject}” konusu E1–E4 kapsamı dışında; yalnızca arşive yazılır.` };
  if (g === "avoid") return { code: r, label: "Kaçınma filtresi", llmCalls: "0", detail: `Kaçınma listesindeki konu (${r.slice(6)}); öneri üretilmez.` };
  if (g === "llm") return { code: r, label: "LLM'e gitti", llmCalls: "≥ 1", detail: "Konu haritası kesin değil; sınıflandırma LLM ile yapılır." };
  return { code: r, label: `${r} adayı`, llmCalls: "≥ 1", detail: `Konu haritası (${row.subject_map_version}) doğrudan ${r} rotasına yönlendirdi.` };
}
