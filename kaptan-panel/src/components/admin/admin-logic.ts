import type { LiveArmState, RestrictedKind, UniverseEntry } from "@/lib/domain";
import { Role } from "@/lib/domain/user";
import { PERMS, ROLE_PERMS, STEP_UP, type Perm } from "@/lib/auth/permissions";
import { accountName } from "@/lib/auth/accounts";

/** Pure helpers for /admin (FRONTEND-SPEC §2.11, 09 §5, §8). */

export const KIND_LABEL: Readonly<Record<RestrictedKind, string>> = {
  spk_tedbir: "SPK tedbiri",
  vbts_brut_takas: "VBTS · brüt takas",
  vbts_aciga_satis: "VBTS · açığa satış yasağı",
  vbts_kredili_islem: "VBTS · kredili işlem yasağı",
  vbts_tek_fiyat: "VBTS · tek fiyat",
  trading_halt: "İşlem durdurma",
  team_insider: "Ekip içeriden-öğrenen (R13)",
  other: "Diğer",
};

/** Kinds an Admin adds by hand; tedbir kinds come from the 30-minute sync job (04 §6). */
export const MANUAL_KINDS: readonly RestrictedKind[] = ["team_insider", "other"];

export function isSystemSourced(addedBy: string): boolean {
  return addedBy.startsWith("system:");
}

export function addedByLabel(addedBy: string): string {
  return isSystemSourced(addedBy) ? "Tedbir senkronu (sistem)" : accountName(addedBy);
}

export function normalizeTicker(raw: string): string {
  return raw.trim().toLocaleUpperCase("tr-TR");
}

export function tickerError(raw: string): string | null {
  const t = normalizeTicker(raw);
  if (!t) return "Sembol gerekli.";
  if (!/^[A-Z0-9]{3,6}$/.test(t)) return "3–6 harf/rakam (ör. KRGTK).";
  return null;
}

/* ── live mode: three keys (09 §8) ─────────────────────────────────── */
export interface LiveKey {
  id: "K1" | "K2" | "K3";
  title: string;
  where: string;
  on: boolean;
  detail: string;
}

export function liveKeys(s: LiveArmState, names: (uid: string) => string = accountName): LiveKey[] {
  const k3 = s.ui_armed_by && s.ui_confirmed_by;
  return [
    {
      id: "K1",
      title: "Config",
      where: "config/trading.yaml → mode",
      on: s.config_live,
      detail: s.config_live ? "mode: live" : "mode: paper · iki onaylı PR olmadan değişmez",
    },
    {
      id: "K2",
      title: "Ortam",
      where: "KAPTAN_LIVE_ENABLED",
      on: s.env_enabled,
      detail: s.env_enabled ? "true (prod host)" : "false · CI ve geliştirmede her zaman kapalı",
    },
    {
      id: "K3",
      title: "Arayüz (iki kişi)",
      where: "system_flags.live_armed",
      on: Boolean(k3),
      detail: k3
        ? `Başlatan ${names(s.ui_armed_by as string)} · onaylayan ${names(s.ui_confirmed_by as string)}`
        : s.ui_armed_by
          ? `Başlatan ${names(s.ui_armed_by)} (1/2) · Risk Officer onayı bekleniyor`
          : "Admin başlatır, Risk Officer onaylar · 18:30'da düşer",
    },
  ];
}

export interface LiveVerdict {
  armed: boolean;
  reason: string;
}

/** Live is on only when all three keys are on and the kill switch is off. */
export function liveVerdict(s: LiveArmState, opts: { isMock: boolean; killOn: boolean }): LiveVerdict {
  if (opts.isMock) {
    return {
      armed: false,
      reason: "Mock/demo modunda canlı mod her zaman kapalıdır: K1 ve K2 bu derlemede kapalı, gerçek para yolu yok. Tüm emirler SimBIST paper.",
    };
  }
  if (opts.killOn) return { armed: false, reason: "Kill switch açıkken canlı mod silahlandırılamaz." };
  const missing = liveKeys(s).filter((k) => !k.on);
  if (missing.length || !s.armed) {
    return { armed: false, reason: `Eksik anahtar: ${missing.map((k) => `${k.id} ${k.title}`).join(", ") || "K3"}. Biri eksikse adaptör paper'a düşer.` };
  }
  return { armed: true, reason: "Üç anahtar açık. Her emirde yine insan onayı gerekir (R15)." };
}

/* ── role / permission matrix (09 §5) ──────────────────────────────── */
export const PERM_LABEL: Readonly<Record<Perm, string>> = {
  view: "Görüntüleme (akış, kanıt, P&L, audit)",
  note: "Not ekleme",
  audit_export: "Audit doğrulama ve dışa aktarma",
  approve: "Öneri onay / küçült / ret",
  kill_on: "Kill switch açma",
  kill_reset_init: "Kill switch reset başlatma",
  kill_reset_confirm: "Kill switch reset onayı",
  limit_propose: "Limit önerme",
  limit_approve: "Limit onaylama (öneren hariç)",
  blocklist_add: "Engel listesine ekleme / çıkarma talebi",
  blocklist_remove_confirm: "Engel listesinden çıkarma onayı",
  users: "Kullanıcı ve rol yönetimi",
  config: "Evren ve config",
  live_arm_init: "Canlı mod başlatma (K3 1/2)",
  live_arm_confirm: "Canlı mod onayı (K3 2/2)",
  demo_inject: "Demo enjeksiyonu (yalnızca demo)",
  manual_fill: "Manuel dolum",
  ticket_pdf: "Emir fişi PDF",
};

export interface MatrixRow {
  perm: Perm;
  label: string;
  stepUp: boolean;
  roles: Readonly<Record<Role, boolean>>;
}

export function permissionMatrix(): MatrixRow[] {
  return PERMS.map((perm) => ({
    perm,
    label: PERM_LABEL[perm],
    stepUp: STEP_UP.has(perm),
    roles: Object.fromEntries(Role.options.map((r) => [r, ROLE_PERMS[r].has(perm)])) as Record<Role, boolean>,
  }));
}

/** Separation of duties (09 §5 a–d). */
export const SOD_RULES: ReadonlyArray<{ code: string; text: string }> = [
  { code: "a", text: "Limit öneren kişi aynı öneriyi onaylayamaz." },
  { code: "b", text: "Kill switch sıfırlamasını başlatan kişi onaylayamaz." },
  { code: "c", text: "Admin bir işlem önerisini onaylayamaz." },
  { code: "d", text: "Auditor başka bir rolle birleşemez; hiçbir şey yazamaz." },
];

/* ── universe ──────────────────────────────────────────────────────── */
export function filterUniverse(rows: readonly UniverseEntry[], q: string, onlyIn: boolean): UniverseEntry[] {
  const needle = q.trim().toLocaleUpperCase("tr-TR");
  return rows.filter(
    (r) =>
      (!onlyIn || r.in_universe) &&
      (!needle ||
        r.ticker.includes(needle) ||
        r.company_name.toLocaleUpperCase("tr-TR").includes(needle) ||
        r.sector.toLocaleUpperCase("tr-TR").includes(needle)),
  );
}
