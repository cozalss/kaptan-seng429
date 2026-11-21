/** Imported by vi.mock factories: no app imports here, or the mock deadlocks on itself. */
import { useMemo, useSyncExternalStore } from "react";

/** next/navigation stand-in: a fixed pathname, a router spy, and an address bar (`search`) that `replace` rewrites. */
export const nav = {
  pathname: "/benim",
  /** The query string the screens read with useSearchParams ("" = none). Reset it in afterEach. */
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

const listeners = new Set<() => void>();

/** A `router.replace("/path?x=1")` moves the address bar the screens read. */
export function setSearch(url: string): void {
  nav.search = url.includes("?") ? (url.split("?")[1] ?? "") : "";
  for (const fn of listeners) fn();
}

export function mockNavigation() {
  return {
    usePathname: () => nav.pathname,
    useRouter: () => ({
      push: nav.push,
      replace: (url: string, opts?: unknown) => {
        if (opts === undefined) nav.replace(url);
        else nav.replace(url, opts);
        setSearch(url);
      },
      refresh: nav.refresh,
      back: vi.fn(),
      prefetch: vi.fn(),
    }),
    useSearchParams: () => {
      const search = useSyncExternalStore(
        (fn) => {
          listeners.add(fn);
          return () => void listeners.delete(fn);
        },
        () => nav.search,
        () => "",
      );
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
}
