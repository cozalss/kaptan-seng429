import { ROLE_LABEL, ROLES, type Role } from "@/lib/domain/user";

/**
 * Who may do what (SPEC.md §2; _KANONIK "Enterprise"; 04 §11). One table, used by the mock
 * API (403 with a plain reason), by every screen (a disabled control shows the same reason)
 * and by the "Kim ne yapabilir?" table in Ayarlar. The backend mirrors it (API.md §3).
 */
export const ACTIONS = [
  "proposal.note",
  "proposal.decide",
  "ticket.mark",
  "kill.stop",
  "kill.reset_start",
  "kill.reset_confirm",
  "limits.propose",
  "limits.decide",
  "audit.verify",
  "users.view",
  "demo.run",
] as const;
export type Action = (typeof ACTIONS)[number];

export const ROLE_ACTIONS: Readonly<Record<Role, ReadonlySet<Action>>> = {
  analyst: new Set<Action>(["proposal.note"]),
  risk_officer: new Set<Action>(["proposal.note", "proposal.decide", "ticket.mark", "kill.stop", "kill.reset_confirm", "limits.decide", "audit.verify"]),
  admin: new Set<Action>(["proposal.note", "kill.stop", "kill.reset_start", "limits.propose", "audit.verify", "users.view", "demo.run"]),
  // Read-only: sees everything, changes nothing. Verifying the ledger has no side effects.
  auditor: new Set<Action>(["audit.verify", "users.view"]),
};

export function can(role: Role | null | undefined, action: Action): boolean {
  return role ? ROLE_ACTIONS[role].has(action) : false;
}

/** The roles that may do an action, in the order of ROLES. */
export function rolesFor(action: Action): Role[] {
  return ROLES.filter((r) => ROLE_ACTIONS[r].has(action));
}

/** What the action is, in words (the "Kim ne yapabilir?" table). */
export const ACTION_LABEL: Readonly<Record<Action, string>> = {
  "proposal.note": "Öneriye not ekler",
  "proposal.decide": "Öneriyi imzalar ya da reddeder",
  "ticket.mark": "Emir fişini işaretler",
  "kill.stop": "Her şeyi durdurur",
  "kill.reset_start": "Yeniden başlatmayı başlatır",
  "kill.reset_confirm": "Yeniden başlatmayı onaylar",
  "limits.propose": "Sınır değişikliği önerir",
  "limits.decide": "Sınır değişikliğini onaylar",
  "audit.verify": "Defteri doğrular",
  "users.view": "Kullanıcıları görür",
  "demo.run": "Demoyu yönetir",
};

/** The plain reason a control is closed: "Bunu Risk Sorumlusu yapar." */
export function deniedReason(action: Action, role?: Role | null): string {
  const who = rolesFor(action).filter((r) => r !== "auditor").map((r) => ROLE_LABEL[r]);
  const list = who.length <= 1 ? (who[0] ?? "kimse") : `${who.slice(0, -1).join(", ")} ya da ${who[who.length - 1]}`;
  const base = `Bunu ${list} yapar.`;
  return role === "auditor" ? `Denetçi yalnızca bakar. ${base}` : base;
}

/** The role to switch to when you want to do it yourself (first one that may). */
export function roleThatCan(action: Action): Role | null {
  return rolesFor(action).find((r) => r !== "auditor") ?? null;
}

/**
 * Route guards. Every screen is open to all four roles (the Denetçi must see everything);
 * what differs is what you can press. Unknown paths fall through to not-found.
 */
export const PANEL_PATHS = ["/bugun", "/oneri", "/portfoy", "/denetim", "/ayarlar"] as const;

export const ROUTE_ROLES: Readonly<Record<(typeof PANEL_PATHS)[number], readonly Role[]>> = {
  "/bugun": ROLES,
  "/oneri": ROLES,
  "/portfoy": ROLES,
  "/denetim": ROLES,
  "/ayarlar": ROLES,
};

export function canOpen(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const base = PANEL_PATHS.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return base ? ROUTE_ROLES[base].includes(role) : true;
}
