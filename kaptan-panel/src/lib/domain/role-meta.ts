/**
 * The four roles and their plain words, with no schema library attached: the top bar, the
 * role picker and the doors import this file so zod stays out of their bundles. The zod
 * schema (`Role` in user.ts) is built from the same list.
 */
export const ROLES = ["analyst", "risk_officer", "admin", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  analyst: "Analist",
  risk_officer: "Risk Sorumlusu",
  admin: "Yönetici",
  auditor: "Denetçi",
};

/** One plain line per role: what it is for. */
export const ROLE_LINE: Readonly<Record<Role, string>> = {
  analyst: "Okur, not ekler.",
  risk_officer: "Onaylar ya da reddeder; durdurur.",
  admin: "Kullanıcılar, ayarlar, senaryolar.",
  auditor: "Her şeyi görür, hiçbir şeyi değiştiremez (jüri için).",
};

/** A person of the team, as the role picker and the team list show them. */
export interface TeamMemberMeta {
  uid: string;
  name: string;
  role: Role;
  /** The person's part in the project (placeholder until names are filled in). */
  duty_tr: string;
}

/** The team (placeholders) plus the jury's read-only seat. One person per role is "on duty". */
export const TEAM: readonly TeamMemberMeta[] = [
  { uid: "uye-1", name: "Üye 1", role: "admin", duty_tr: "Veri ve RAG · takım lideri" },
  { uid: "uye-2", name: "Üye 2", role: "analyst", duty_tr: "Ajanlar" },
  { uid: "uye-3", name: "Üye 3", role: "risk_officer", duty_tr: "Strateji, risk ve yürütme" },
  { uid: "uye-4", name: "Üye 4", role: "analyst", duty_tr: "Arayüz ve değerlendirme" },
  { uid: "denetci", name: "Denetçi", role: "auditor", duty_tr: "Jüri · salt okunur" },
];

/** The team member who acts for a role (the first one listed). */
export function memberForRole(role: Role): TeamMemberMeta {
  return TEAM.find((m) => m.role === role) ?? (TEAM[0] as TeamMemberMeta);
}
