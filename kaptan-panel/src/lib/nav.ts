/**
 * The panel's three screens (PERSONAL-SPEC §2): Bugün, an Öneri, Portföy — plus Ayarlar behind
 * the ⚙ menu. One user, no roles. This module is the single source for paths and the legacy
 * redirects (next.config.ts imports `LEGACY_REDIRECTS`).
 *
 * No imports on purpose: next.config.ts loads this file at build time.
 */
export const ROUTES = {
  bugun: "/bugun",
  oneri: "/oneri",
  portfoy: "/portfoy",
  ayarlar: "/ayarlar",
  login: "/login",
} as const;

/** Where you land after signing in, and where the wordmark goes. */
export const HOME = ROUTES.bugun;

/** Build links instead of concatenating strings in screens. */
export const href = {
  proposal: (proposalId: string) => `${ROUTES.oneri}/${encodeURIComponent(proposalId)}`,
} as const;

/** The two items in the top bar (Ayarlar lives in the ⚙ menu). */
export const NAV_ITEMS: ReadonlyArray<{ href: string; label: string }> = [
  { href: ROUTES.bugun, label: "Bugün" },
  { href: ROUTES.portfoy, label: "Portföy" },
];

/** Paths that never need a session. "/" (the landing) and static files are handled by the proxy matcher. */
export const PUBLIC_PATHS: readonly string[] = [ROUTES.login];

/** Every older path → the closest of the three screens (permanent: false while the IA settles). */
export const LEGACY_REDIRECTS: ReadonlyArray<{ source: string; destination: string }> = [
  ...["/kopru", "/oneriler", "/akis", "/karne", "/ozet", "/kosular", "/kosular/:id", "/tayfa", "/tayfa/:agent", "/styleguide"].map((source) => ({
    source,
    destination: ROUTES.bugun,
  })),
  ...["/inbox", "/approvals", "/runs", "/runs/:id", "/brief", "/eval", "/audit", "/yetkisiz"].map((source) => ({ source, destination: ROUTES.bugun })),
  { source: "/portfolio", destination: ROUTES.portfoy },
  { source: "/limits", destination: ROUTES.ayarlar },
  { source: "/admin", destination: ROUTES.ayarlar },
];

/** Which top-bar item is current for a path (an Öneri belongs to Bugün). */
export function activeNavHref(pathname: string): string | null {
  if (pathname === ROUTES.bugun || pathname.startsWith(`${ROUTES.oneri}/`)) return ROUTES.bugun;
  if (pathname === ROUTES.portfoy) return ROUTES.portfoy;
  return null;
}

/** Only same-site panel paths are honoured for ?next= (no open redirect; "/" is the landing). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || next === "/" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (PUBLIC_PATHS.some((p) => next === p || next.startsWith(`${p}?`))) return null;
  return next;
}
