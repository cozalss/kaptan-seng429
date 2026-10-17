import { z } from "zod";
import { IsoDateTime } from "./common";
import { memberForRole, ROLE_LABEL, ROLE_LINE, ROLES, TEAM, type Role as RoleName } from "./role-meta";

/**
 * The enterprise layer (SPEC.md §2, _KANONIK "Enterprise", 04 §11): one login, four roles.
 * The role is "whose eyes you look through"; it is picked in the top bar and kept in the
 * session. Each role belongs to one person of the team, so "a different person signs" is real.
 */
// The plain lists live in role-meta.ts (no zod there, so the shell stays light); re-exported here.
export { memberForRole, ROLE_LABEL, ROLE_LINE, ROLES, TEAM };

export const Role = z.enum(ROLES);
export type Role = RoleName;

/** Where you start after login: the role the canonical demo starts with (11 §2). */
export const DEFAULT_ROLE: Role = "risk_officer";

export const TeamMember = z.object({
  uid: z.string(),
  name: z.string(),
  role: Role,
  /** The person’s part in the project (placeholder until names are filled in). */
  duty_tr: z.string(),
});
export type TeamMember = z.infer<typeof TeamMember>;

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

/**
 * What the sign-in endpoint accepts (mock route; the http API takes the same body). `role` is
 * the door you came through: mock starts the session as that role; in http mode it is only a
 * hint and the backend decides (API.md §2). Unknown roles are refused, not ignored.
 */
export const LoginRequest = z.object({
  passphrase: z.string().max(200),
  next: z.string().max(500).nullish(),
  role: Role.optional(),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RoleInput = z.object({ role: Role });
