/** Imported by vi.mock factories: no app imports here, or the mock deadlocks on itself. */
/** next/navigation stand-in: a fixed pathname and a router spy. */
export const nav = {
  pathname: "/bugun",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};
export function mockNavigation() {
  return {
    usePathname: () => nav.pathname,
    useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh, back: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
}
