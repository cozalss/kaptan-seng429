import { ROLES, TEAM, type Role } from "@/lib/domain/role-meta";
import { ROUTES } from "@/lib/nav";

/**
 * The four doors of /login: each role has its own sign-in screen at /login/<slug>. Slugs are
 * plain ASCII Turkish so the URL reads aloud ("/login/risk"). The copy here is what a role
 * does, in one sentence on the door and a few lines on its own screen; the permission table
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

/** A door's link, carrying a safe ?next= through. */
export function loginHref(role: Role | null, next?: string | null): string {
  const path = role ? `${ROUTES.login}/${ROLE_SLUG[role]}` : ROUTES.login;
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

export interface RoleDoor {
  /** The role's verb, the small capitals above its name on the door ("İMZALAR"). */
  verb: string;
  /** One plain sentence on the door. */
  line: string;
  /** "Bu rolle neler yaparsın" — two or three short lines on the role's screen. */
  does: readonly string[];
}

export const ROLE_DOOR: Readonly<Record<Role, RoleDoor>> = {
  analyst: {
    verb: "OKUR",
    line: "Okursun, not düşersin; kararı başkası verir.",
    does: ["Tayfanın önerilerini baştan sona okursun.", "Önerilere kısa notlar eklersin.", "İmza atmazsın; sözün notta kalır."],
  },
  risk_officer: {
    verb: "İMZALAR",
    line: "Son imzayı sen atarsın.",
    does: ["Öneriyi imzalar ya da reddedersin.", "Gerekirse her şeyi tek tuşla durdurursun.", "Sınır değişikliklerine son onayı verirsin."],
  },
  admin: {
    verb: "KURAR",
    line: "Ekibi, sınırları ve senaryoları sen yönetirsin.",
    does: ["Ekibi ve ayarları yönetirsin.", "Sınır değişikliği önerirsin; onayı Risk Sorumlusu verir.", "Senaryo ekler, rehberli turu başlatırsın."],
  },
  auditor: {
    verb: "GÖZETLER",
    line: "Her şeyi görürsün, hiçbir şeye dokunmazsın.",
    does: ["Her ekranı ve her kaydı görürsün.", "Defterin bozulmadığını doğrularsın.", "Hiçbir düğme sana açık değil: jüri koltuğu."],
  },
};

/** Who sits behind a door: "Üye 2 · Üye 4", or the jury seat's duty for the Denetçi. */
export function doorPeople(role: Role): string {
  const people = TEAM.filter((m) => m.role === role);
  if (role === "auditor") return people[0]?.duty_tr ?? "Jüri";
  return people.map((m) => m.name).join(" · ");
}
