import { memberForRole, ROLES, type Role } from "@/lib/domain/role-meta";
import { ROUTES } from "@/lib/nav";

/**
 * The four team accounts of /login. /login/<slug> opens the same sign-in screen with that
 * account preselected (slugs are plain ASCII Turkish: "/login/risk"). The permission table
 * (permissions.ts) stays the source of truth for what a role may press.
 */
export const ROLE_SLUG: Readonly<Record<Role, string>> = {
  analyst: "analist",
  risk_officer: "risk",
  admin: "yonetici",
  auditor: "denetci",
};

export const ROLE_SLUGS: readonly string[] = ROLES.map((r) => ROLE_SLUG[r]);

/** "/login/risk" → "risk_officer"; anything else → null (the page then 404s). */
export function roleFromSlug(slug: string | null | undefined): Role | null {
  if (!slug) return null;
  return ROLES.find((r) => ROLE_SLUG[r] === slug) ?? null;
}

/** The sign-in link for an account (or none), carrying a safe ?next= through. */
export function loginHref(role: Role | null, next?: string | null): string {
  const path = role ? `${ROUTES.login}/${ROLE_SLUG[role]}` : ROUTES.login;
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/**
 * Who a sign-in account is, as /login lists it: the person (or, for the Denetçi, the jury
 * seat's duty) under the role's name. The account decides the role the session starts in.
 */
export function accountPerson(role: Role): string {
  const m = memberForRole(role);
  return role === "auditor" ? m.duty_tr : m.name;
}
