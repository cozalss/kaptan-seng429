/**
 * The app's screens, one person's: Ana sayfa, an Öneri, Param, Okunanlar, Geçmiş, plus Ayarlar
 * behind the account menu. This module is the single source for paths and the legacy redirects
 * (next.config.ts imports `LEGACY_REDIRECTS`).
 *
 * No imports on purpose: next.config.ts loads this file at build time.
 */
export const ROUTES = {
  benim: "/benim",
  oneri: "/oneri",
  portfoy: "/portfoy",
  bildirimler: "/bildirimler",
  gecmis: "/gecmis",
  ayarlar: "/ayarlar",
  login: "/login",
} as const;

/** Where you land after signing in, and where the wordmark goes. */
export const HOME = ROUTES.benim;

/** Build links instead of concatenating strings in screens. */
export const href = {
  proposal: (proposalId: string) => `${ROUTES.oneri}/${encodeURIComponent(proposalId)}`,
} as const;

export type NavKey = "benim" | "portfoy" | "bildirimler" | "gecmis";

/** The items in the top bar, in order (Ayarlar lives in the account menu). */
export const NAV_ITEMS: ReadonlyArray<{ key: NavKey; href: string; label: string }> = [
  { key: "benim", href: ROUTES.benim, label: "Ana sayfa" },
  { key: "portfoy", href: ROUTES.portfoy, label: "Param" },
  { key: "bildirimler", href: ROUTES.bildirimler, label: "Okunanlar" },
  { key: "gecmis", href: ROUTES.gecmis, label: "Geçmiş" },
];

/** The one page of the public website besides the landing (src/proxy.ts rewrites every other path to it). */
export const SITE_ONLY_PATH = "/burada-acilmaz";

/** Paths that never need a session. "/" (the landing) and static files are handled by the proxy matcher. */
export const PUBLIC_PATHS: readonly string[] = [ROUTES.login];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Every older path → the closest screen (permanent: false while the IA settles). */
export const LEGACY_REDIRECTS: ReadonlyArray<{ source: string; destination: string }> = [
  ...["/bugun", "/kopru", "/oneriler", "/akis", "/karne", "/ozet", "/kosular", "/kosular/:id", "/tayfa", "/tayfa/:agent", "/styleguide", "/inbox", "/approvals", "/runs", "/runs/:id", "/brief", "/eval", "/yetkisiz"].map((source) => ({
    source,
    destination: ROUTES.benim,
  })),
  // `:rol+`, not `*`: "/login" itself must not match.
  { source: "/login/:rol+", destination: ROUTES.login },
  { source: "/denetim", destination: ROUTES.gecmis },
  { source: "/audit", destination: ROUTES.gecmis },
  { source: "/portfolio", destination: ROUTES.portfoy },
  { source: "/limits", destination: ROUTES.ayarlar },
  { source: "/admin", destination: ROUTES.ayarlar },
];

/** Which nav item is current for a path (an Öneri belongs to Ana sayfa); null outside the nav (Ayarlar). */
export function activeNavHref(pathname: string): string | null {
  if (pathname === ROUTES.benim || pathname.startsWith(`${ROUTES.oneri}/`)) return ROUTES.benim;
  return NAV_ITEMS.find((i) => i.href === pathname)?.href ?? null;
}

/** Only same-site app paths are honoured for ?next= (no open redirect; "/" is the landing). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || next === "/" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (isPublicPath(next.split(/[?#]/)[0] ?? next)) return null;
  return next;
}
