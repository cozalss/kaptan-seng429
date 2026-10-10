import { z } from "zod";
import { IsoDateTime } from "./common";

/**
 * The enterprise layer (SPEC.md §2, _KANONIK "Enterprise", 04 §11): one login, four roles.
 * The role is "whose eyes you look through"; it is picked in the top bar and kept in the
 * session. Each role belongs to one person of the team, so "a different person signs" is real.
 */
export const Role = z.enum(["analyst", "risk_officer", "admin", "auditor"]);
export type Role = z.infer<typeof Role>;

export const ROLES: readonly Role[] = Role.options;

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
  admin: "Kullanıcılar, ayarlar, demo.",
  auditor: "Her şeyi görür, hiçbir şeyi değiştiremez (jüri için).",
};

/** Where you start after login: the role the canonical demo starts with (11 §2). */
export const DEFAULT_ROLE: Role = "risk_officer";

export const TeamMember = z.object({
  uid: z.string(),
  name: z.string(),
  role: Role,
  /** The person's part in the project (placeholder until names are filled in). */
  duty_tr: z.string(),
});
export type TeamMember = z.infer<typeof TeamMember>;

/** The team (placeholders) plus the jury's read-only seat. One person per role is "on duty". */
export const TEAM: readonly TeamMember[] = [
  { uid: "uye-1", name: "Üye 1", role: "admin", duty_tr: "Veri ve RAG · takım lideri" },
  { uid: "uye-2", name: "Üye 2", role: "analyst", duty_tr: "Ajanlar" },
  { uid: "uye-3", name: "Üye 3", role: "risk_officer", duty_tr: "Strateji, risk ve yürütme" },
  { uid: "uye-4", name: "Üye 4", role: "analyst", duty_tr: "Arayüz ve değerlendirme" },
  { uid: "denetci", name: "Denetçi", role: "auditor", duty_tr: "Jüri · salt okunur" },
];

/** The team member who acts for a role (the first one listed). */
export function memberForRole(role: Role): TeamMember {
  return TEAM.find((m) => m.role === role) ?? (TEAM[0] as TeamMember);
}

export function memberByUid(uid: string | null | undefined): TeamMember | null {
  if (!uid) return null;
  const id = uid.startsWith("user:") ? uid.slice(5) : uid;
  return TEAM.find((m) => m.uid === id) ?? null;
}

export const Me = z.object({
  id: z.string(),
  display_name: z.string(),
  role: Role,
});
export type Me = z.infer<typeof Me>;

/** A signature on a decision: who (person and role) and when. */
export const Signature = z.object({
  uid: z.string(),
  name: z.string(),
  role: Role,
  at: IsoDateTime,
  reason: z.string().nullable(),
});
export type Signature = z.infer<typeof Signature>;

/** /login takes one passphrase (mock: the demo passphrase is printed on the page). */
export const LoginInput = z.object({
  passphrase: z.string().min(1, "Parola gerekli").max(200, "Parola çok uzun"),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const RoleInput = z.object({ role: Role });
