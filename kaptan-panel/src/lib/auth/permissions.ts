import type { Role } from "@/lib/domain/user";

/**
 * Permission model, mirrored from 09 §5 (`ROLE_PERMS` in backend/api/deps.py) plus the
 * panel-only permissions the matrix lists in prose (demo inject, manual fill, admin screen).
 * FRONTEND-SPEC.md §4 is the human-readable version of this table.
 */
export const PERMS = [
  "view",
  "note",
  "audit_export",
  "approve",
  "kill_on",
  "kill_reset_init",
  "kill_reset_confirm",
  "limit_propose",
  "limit_approve",
  "blocklist_add",
  "blocklist_remove_confirm",
  "users",
  "config",
  "live_arm_init",
  "live_arm_confirm",
  "demo_inject",
  "manual_fill",
  "ticket_pdf",
] as const;
export type Perm = (typeof PERMS)[number];

export const ROLE_PERMS: Readonly<Record<Role, ReadonlySet<Perm>>> = {
  analyst: new Set<Perm>(["view", "note"]),
  // Auditor: read-only, no mutations at all; /audit/verify is side-effect free.
  auditor: new Set<Perm>(["view", "audit_export"]),
  risk_officer: new Set<Perm>([
    "view",
    "note",
    "audit_export",
    "approve",
    "kill_on",
    "kill_reset_confirm",
    "limit_propose",
    "limit_approve",
    "blocklist_remove_confirm",
    "live_arm_confirm",
    "manual_fill",
    "ticket_pdf",
  ]),
  admin: new Set<Perm>([
    "view",
    "note",
    "audit_export",
    "kill_on",
    "kill_reset_init",
    "limit_propose",
    "limit_approve",
    "blocklist_add",
    "users",
    "config",
    "live_arm_init",
    "demo_inject",
    "ticket_pdf",
  ]),
};

/** Step-up (TOTP within 5 minutes) is required for these (09 §5–6). */
export const STEP_UP: ReadonlySet<Perm> = new Set<Perm>([
  "approve",
  "kill_reset_init",
  "kill_reset_confirm",
  "live_arm_init",
  "live_arm_confirm",
]);

export function can(role: Role | null | undefined, perm: Perm): boolean {
  if (!role) return false;
  return ROLE_PERMS[role].has(perm);
}

/** Human reason shown when a control is disabled for the current role. */
export const DENIED_HINT: Readonly<Partial<Record<Perm, string>>> = {
  note: "Auditor rolü salt okunurdur; not ekleyemez.",
  approve: "Yalnızca Risk Officer onaylayabilir (görevler ayrılığı).",
  kill_on: "Kill switch'i yalnızca Risk Officer veya Admin açabilir.",
  kill_reset_init: "Sıfırlamayı yalnızca Admin başlatır.",
  kill_reset_confirm: "Sıfırlamayı yalnızca Risk Officer onaylar.",
  limit_propose: "Limit değişikliğini Risk Officer veya Admin önerir.",
  limit_approve: "Limit değişikliğini Risk Officer veya Admin onaylar.",
  audit_export: "Zincir doğrulama ve dışa aktarma Risk Officer, Admin ve Auditor içindir.",
  demo_inject: "Demo bildirimini yalnızca Admin, yalnızca demo modunda enjekte eder.",
  manual_fill: "Manuel dolumu Risk Officer girer.",
};

export function deniedHint(perm: Perm): string {
  return DENIED_HINT[perm] ?? "Bu işlem rolünüze kapalı.";
}
