import type { AuditEntry, AuditQuery, ChainFailureKind, ChainVerifyResult } from "@/lib/domain";
import { NODE_LABELS, type NodeName } from "@/lib/domain";
import { canonicalOf, hashOf } from "@/lib/audit-chain";
import { accountName } from "@/lib/auth/accounts";

/**
 * Pure helpers for /audit (FRONTEND-SPEC §2.7, 09 §7): labels, URL ⇄ filter mapping,
 * deep-link page maths, per-entry integrity and the visible "walk" of the chain check.
 */

export const AUDIT_PAGE_SIZE = 50;

/** Turkish labels for the actions the chain records (09 §7.1 "Neler yazılır"). */
export const ACTION_LABEL: Readonly<Record<string, string>> = {
  "disclosure.ingested": "Bildirim alındı",
  "classification.done": "Sınıflandırıldı",
  "pregate.decided": "Ön eleme kararı",
  "agent.output": "Ajan çıktısı",
  "rule.decided": "Kural motoru kararı",
  "risk.checked": "Risk kapısı",
  "risk.rejected": "Sert veto (ön eleme)",
  "risk.halted": "Günlük durdurma (R02)",
  "proposal.created": "Öneri oluşturuldu",
  "approval.decided": "Onay kararı",
  "order.filled": "Dolum",
  "order.manual_fill": "Manuel dolum",
  "kill_switch.on": "Kill switch açıldı",
  "kill_switch.reset_requested": "Sıfırlama başlatıldı (1/2)",
  "kill_switch.reset": "Sıfırlama onaylandı (2/2)",
  "limits.proposed": "Limit önerisi",
  "limits.approved": "Limit onayı",
  "limits.rejected": "Limit reddi",
  "restricted.added": "Engel listesine eklendi",
  "restricted.removed": "Engel listesinden çıkarıldı",
  "live.arm_requested": "Canlı mod başlatıldı (K3 1/2)",
  "live.arm_confirmed": "Canlı mod onayı (K3 2/2)",
  "demo.injected": "Demo fikstürü enjekte edildi",
  "note.added": "Not eklendi",
  "brief.generated": "Sabah özeti üretildi",
  "audit.verified": "Gece doğrulaması",
};

/** Filter families for the action select (prefix match, as the API does). */
export const ACTION_FAMILIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "disclosure.", label: "Bildirim" },
  { value: "classification.", label: "Sınıflandırma" },
  { value: "agent.", label: "Ajan çıktısı" },
  { value: "rule.", label: "Kural motoru" },
  { value: "risk.", label: "Risk kapısı / durdurma" },
  { value: "proposal.", label: "Öneri" },
  { value: "approval.", label: "Onay" },
  { value: "order.", label: "Emir ve dolum" },
  { value: "kill_switch.", label: "Kill switch" },
  { value: "limits.", label: "Limitler" },
  { value: "restricted.", label: "Engel listesi" },
  { value: "live.", label: "Canlı mod" },
  { value: "demo.", label: "Demo fikstürü" },
  { value: "note.", label: "Not" },
  { value: "audit.", label: "Doğrulama" },
];

export const ACTOR_KINDS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "user:", label: "Kullanıcı" },
  { value: "agent:", label: "Ajan / düğüm" },
  { value: "system:", label: "Sistem işi" },
];

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/** Actions that must read as critical in the ledger (north red). */
export function isCriticalAction(action: string): boolean {
  return action === "kill_switch.on" || action === "risk.rejected" || action === "limits.rejected";
}

export interface ActorView {
  kind: "user" | "agent" | "system";
  id: string;
  label: string;
}

export function actorView(actor: string): ActorView {
  const sep = actor.indexOf(":");
  const kindRaw = actor.slice(0, sep);
  const id = actor.slice(sep + 1);
  const kind = kindRaw === "user" || kindRaw === "agent" ? kindRaw : "system";
  if (kind === "user") return { kind, id, label: accountName(id) };
  if (kind === "agent") {
    const node = NODE_LABELS[id as NodeName];
    return { kind, id, label: node ? node.tr : id };
  }
  return { kind, id, label: id.replace(/_/g, " ") };
}

export const FAILURE_LABEL: Readonly<Record<ChainFailureKind, string>> = {
  gap_or_duplicate: "Sıra boşluğu ya da tekrar (chain_pos)",
  prev_hash_mismatch: "Önceki hash bağı kopuk",
  fields_changed_canonical_stale: "Alanlar canonical ile uyuşmuyor",
  hash_mismatch: "İçerik değişmiş: hash yeniden hesaplanınca tutmuyor",
  anchor_mismatch: "Dış çapa ile uyuşmuyor",
};

/* ── URL ⇄ filters ──────────────────────────────────────────────────── */
export interface AuditFilters {
  actor: string;
  action: string;
  entity: string;
  from: string;
  run_id: string;
  page: number;
}

export const EMPTY_FILTERS: AuditFilters = { actor: "", action: "", entity: "", from: "", run_id: "", page: 1 };

type Params = Pick<URLSearchParams, "get">;

function positiveInt(raw: string | null): number | null {
  if (!raw || !/^\d{1,7}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** Read filters from the query string. Unknown or malformed values are dropped. */
export function filtersFromParams(p: Params): AuditFilters {
  const clean = (v: string | null, max = 80) => (v ?? "").trim().slice(0, max);
  const from = clean(p.get("from"), 10);
  return {
    actor: clean(p.get("actor")),
    action: clean(p.get("action")),
    entity: clean(p.get("entity")),
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "",
    run_id: clean(p.get("run") ?? p.get("run_id")),
    page: positiveInt(p.get("sayfa")) ?? 1,
  };
}

/** Query string for the filters (page 1 and empty values omitted). */
export function filtersToSearch(f: AuditFilters): string {
  const q = new URLSearchParams();
  if (f.actor) q.set("actor", f.actor);
  if (f.action) q.set("action", f.action);
  if (f.entity) q.set("entity", f.entity);
  if (f.from) q.set("from", f.from);
  if (f.run_id) q.set("run", f.run_id);
  if (f.page > 1) q.set("sayfa", String(f.page));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function hasFilters(f: AuditFilters): boolean {
  return Boolean(f.actor || f.action || f.entity || f.from || f.run_id);
}

/** API query for the filters. `from` is a calendar day in Istanbul (UTC+3, no DST). */
export function toAuditQuery(f: AuditFilters, pageSize = AUDIT_PAGE_SIZE): AuditQuery {
  return {
    ...(f.actor ? { actor: f.actor } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.from ? { from: new Date(`${f.from}T00:00:00+03:00`).toISOString() } : {}),
    ...(f.run_id ? { run_id: f.run_id } : {}),
    page: f.page,
    page_size: pageSize,
  };
}

/**
 * Deep link target: `?pos=3907`, `?chain_pos=3907` or `#pos-3907` (from /runs/[id]'s
 * audit positions). Returns null when absent or malformed.
 */
export function targetPos(p: Params, hash = ""): number | null {
  const fromHash = /^#(?:pos|kayit)-(\d{1,7})$/.exec(hash)?.[1] ?? null;
  return positiveInt(p.get("pos")) ?? positiveInt(p.get("chain_pos")) ?? positiveInt(fromHash);
}

/** The newest-first page that holds `pos` in an unfiltered chain of `total` entries. */
export function pageForPos(total: number, pos: number, pageSize = AUDIT_PAGE_SIZE): number | null {
  if (pos < 1 || pos > total) return null;
  return Math.floor((total - pos) / pageSize) + 1;
}

export function pageCount(total: number, pageSize = AUDIT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/* ── per-entry integrity (shown in the detail drawer) ───────────────── */
export interface EntryIntegrity {
  canonical: string;
  recomputed: string;
  hashOk: boolean;
}

export function entryIntegrity(e: AuditEntry): EntryIntegrity {
  const recomputed = hashOf(e.prev_hash, e);
  return { canonical: canonicalOf(e), recomputed, hashOk: recomputed === e.hash };
}

/* ── the visible walk ───────────────────────────────────────────────── */
/** Where the walk stops: the whole chain when OK, the first bad position otherwise. */
export function walkTarget(r: Pick<ChainVerifyResult, "ok" | "checked" | "first_bad_pos">): number {
  return r.ok ? r.checked : (r.first_bad_pos ?? r.checked);
}

/** Ease-out position of the walk at time `t` (ms) of `duration`. */
export function walkPosition(t: number, duration: number, target: number): number {
  if (duration <= 0 || t >= duration) return target;
  const x = Math.max(0, t) / duration;
  const eased = 1 - (1 - x) ** 3;
  return Math.max(1, Math.round(eased * target));
}

/** While the API has not answered, the walk crawls towards (but never reaches) the end. */
export function provisionalPosition(t: number, total: number): number {
  const share = 0.82 * (1 - Math.exp(-t / 900));
  return Math.max(1, Math.floor(share * total));
}

/** Map a chain position to one of `cells` tape cells (1-based pos → 0-based cell). */
export function cellOf(pos: number, total: number, cells: number): number {
  if (total <= 0) return 0;
  return Math.min(cells - 1, Math.floor(((pos - 1) / total) * cells));
}

/** Pretty JSON with Turkish-safe key order as stored. */
export function prettyPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}
