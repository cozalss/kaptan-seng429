/**
 * The panel's screens (SPEC.md §1): Bugün, an Öneri, Portföy, Denetim — plus Ayarlar behind
 * the ⚙ menu. This module is the single source for paths and the legacy redirects
 * (next.config.ts imports `LEGACY_REDIRECTS`).
 *
 * No imports on purpose: next.config.ts loads this file at build time.
 */
export const ROUTES = {
  bugun: "/bugun",
  oneri: "/oneri",
  bildirimler: "/bildirimler",
  portfoy: "/portfoy",
  denetim: "/denetim",
  ayarlar: "/ayarlar",
  login: "/login",
} as const;

/** Where you land after signing in, and where the wordmark goes. */
export const HOME = ROUTES.bugun;

/** Build links instead of concatenating strings in screens. */
export const href = {
  proposal: (proposalId: string) => `${ROUTES.oneri}/${encodeURIComponent(proposalId)}`,
} as const;

export type NavKey = "bugun" | "bildirimler" | "portfoy" | "denetim" | "ayarlar";

/** The items in the sidebar, in order (Ayarlar is also in the account menu). */
export const NAV_ITEMS: ReadonlyArray<{ key: NavKey; href: string; label: string }> = [
  { key: "bugun", href: ROUTES.bugun, label: "Bugün" },
  { key: "bildirimler", href: ROUTES.bildirimler, label: "Bildirimler" },
  { key: "portfoy", href: ROUTES.portfoy, label: "Portföy" },
  { key: "denetim", href: ROUTES.denetim, label: "Denetim kaydı" },
  { key: "ayarlar", href: ROUTES.ayarlar, label: "Ayarlar" },
];

/**
 * Paths that never need a session: /login (the four doors) and every /login/<rol> screen.
 * "/" (the landing) and static files are handled by the proxy matcher.
 */
export const PUBLIC_PATHS: readonly string[] = [ROUTES.login];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Every older path → the closest of the three screens (permanent: false while the IA settles). */
export const LEGACY_REDIRECTS: ReadonlyArray<{ source: string; destination: string }> = [
  ...["/kopru", "/oneriler", "/akis", "/karne", "/ozet", "/kosular", "/kosular/:id", "/tayfa", "/tayfa/:agent", "/styleguide"].map((source) => ({
    source,
    destination: ROUTES.bugun,
  })),
  ...["/inbox", "/approvals", "/runs", "/runs/:id", "/brief", "/eval", "/yetkisiz"].map((source) => ({ source, destination: ROUTES.bugun })),
  { source: "/audit", destination: ROUTES.denetim },
  { source: "/portfolio", destination: ROUTES.portfoy },
  { source: "/limits", destination: ROUTES.ayarlar },
  { source: "/admin", destination: ROUTES.ayarlar },
];

/** Which sidebar item is current for a path (an Öneri belongs to Bugün). */
export function activeNavHref(pathname: string): string | null {
  if (pathname === ROUTES.bugun || pathname.startsWith(`${ROUTES.oneri}/`)) return ROUTES.bugun;
  if (pathname === ROUTES.bildirimler) return ROUTES.bildirimler;
  if (pathname === ROUTES.portfoy) return ROUTES.portfoy;
  if (pathname === ROUTES.denetim) return ROUTES.denetim;
  if (pathname === ROUTES.ayarlar) return ROUTES.ayarlar;
  return null;
}

/** The eyebrow over a screen: where you are, in the sidebar's words. */
export function sectionLabel(pathname: string): string {
  if (pathname.startsWith(`${ROUTES.oneri}/`)) return "Bugün · Öneri";
  const active = activeNavHref(pathname);
  return NAV_ITEMS.find((i) => i.href === active)?.label ?? "Masa";
}

/** Only same-site panel paths are honoured for ?next= (no open redirect; "/" is the landing). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || next === "/" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (isPublicPath(next.split(/[?#]/)[0] ?? next)) return null;
  return next;
}
