import type { Role } from "@/lib/domain/user";

/**
 * Route access (FRONTEND-SPEC.md §2, §9 Ç-4): every viewing screen is open to all four roles
 * (09 §5 gives VIEW to everyone); /admin is Admin only. Actions are gated inside screens.
 */
export type NavGroup = "masa" | "denetim" | "sistem";

export interface PanelRoute {
  href: string;
  label: string;
  /** One line under the label in the command palette. */
  hint: string;
  group: NavGroup;
  roles: readonly Role[];
  /** Single-key shortcut after "g" (g i → /inbox). */
  goKey: string;
  owner: "S1" | "S2" | "S3" | "S4" | "temel";
}

const ALL: readonly Role[] = ["analyst", "risk_officer", "admin", "auditor"];

export const PANEL_ROUTES: readonly PanelRoute[] = [
  { href: "/inbox", label: "Canlı akış", hint: "Bugünkü KAP bildirimleri, sayaçlar", group: "masa", roles: ALL, goKey: "i", owner: "S2" },
  { href: "/approvals", label: "Onay kuyruğu", hint: "Onayla, küçült, reddet · 09:50", group: "masa", roles: ALL, goKey: "o", owner: "S2" },
  { href: "/runs", label: "Çalıştırmalar", hint: "Neden bu işlem? · ajan izi", group: "masa", roles: ALL, goKey: "r", owner: "S1" },
  { href: "/portfolio", label: "Portföy", hint: "Pozisyonlar, K/Z, kill switch", group: "masa", roles: ALL, goKey: "p", owner: "S3" },
  { href: "/brief", label: "Sabah özeti", hint: "Her iş günü 08:45", group: "masa", roles: ALL, goKey: "b", owner: "S3" },
  { href: "/audit", label: "Denetim kaydı", hint: "Hash zinciri, doğrulama", group: "denetim", roles: ALL, goKey: "a", owner: "S4" },
  { href: "/limits", label: "Limitler", hint: "Sürümler, dört göz onayı", group: "denetim", roles: ALL, goKey: "l", owner: "S4" },
  { href: "/eval", label: "Değerlendirme", hint: "4 katman, holdout, ablation", group: "denetim", roles: ALL, goKey: "e", owner: "S3" },
  { href: "/admin", label: "Yönetim", hint: "Kullanıcılar, evren, demo", group: "sistem", roles: ["admin"], goKey: "y", owner: "S4" },
  { href: "/styleguide", label: "Stil rehberi", hint: "Tasarım sistemi", group: "sistem", roles: ALL, goKey: "s", owner: "temel" },
];

export const NAV_GROUP_LABEL: Readonly<Record<NavGroup, string>> = {
  masa: "Masa",
  denetim: "Denetim",
  sistem: "Sistem",
};

export const PUBLIC_PATHS: readonly string[] = ["/login"];

function matches(route: PanelRoute, pathname: string): boolean {
  return pathname === route.href || pathname.startsWith(`${route.href}/`);
}

export function routeFor(pathname: string): PanelRoute | undefined {
  return PANEL_ROUTES.find((r) => matches(r, pathname));
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const route = routeFor(pathname);
  // Unknown panel paths fall through to not-found; /yetkisiz is open to any signed-in role.
  if (!route) return true;
  return route.roles.includes(role);
}

export function homeFor(role: Role): string {
  return role === "risk_officer" ? "/approvals" : "/inbox";
}

export function routesFor(role: Role): PanelRoute[] {
  return PANEL_ROUTES.filter((r) => r.roles.includes(role));
}

/** Only same-site absolute paths are honoured for ?next= (no open redirect). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (PUBLIC_PATHS.includes(next)) return null;
  return next;
}
