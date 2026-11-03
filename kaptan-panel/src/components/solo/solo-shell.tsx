"use client";

import "./solo.css";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/api/client";
import { ApiProvider } from "@/lib/api/react";
import { isUnreachable } from "@/lib/api/types";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { activeNavHref, HOME, NAV_ITEMS, ROUTES, type NavKey } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { DropdownMenu as M } from "radix-ui";
import { Wordmark } from "@/components/brand/marks";
import { RiskBanner } from "@/components/shell/banners";
import { DeskStateProvider, ResetBoundary, useDesk } from "@/components/shell/desk-state";
import { logout } from "@/components/shell/session-actions";
import { UnreachableScreen } from "@/components/shell/unreachable";
import { MENU_CONTENT, MENU_ITEM } from "@/components/ui/menu";
import { SkeletonLines } from "@/components/ui/primitives";
import { notify, Toaster } from "@/components/ui/toast";
import { ConfirmAction, useStopRestart } from "./stop-panel";

/** A page that has not landed by then simply appears: input is never held longer than this. */
const TRANSITION_CAP_MS = 240;

/**
 * After a client-side route change, focus lands on the new screen's big sentence (marked
 * `data-route-focus`) or, failing that, on <main>, so keyboard and screen-reader users start on
 * the new page instead of the link they left. The first render keeps the browser's own focus.
 */
function useRouteFocus(pathname: string) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = document.querySelector<HTMLElement>("main [data-route-focus]") ?? document.querySelector<HTMLElement>("main");
    target?.focus({ preventScroll: true });
  }, [pathname]);
}

/**
 * Page changes as View Transitions where the browser has them: an internal link click starts the
 * transition, the route change happens inside it, and the capped wait keeps a slow page from
 * holding input. Elsewhere, and under reduced motion, links work exactly as they do by default.
 */
function useRouteTransition(pathname: string) {
  const router = useRouter();
  const landed = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    landed.current?.();
    landed.current = null;
  }, [pathname]);
  useEffect(() => {
    if (typeof document.startViewTransition !== "function") return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const link = e.target instanceof Element ? e.target.closest("a") : null;
      if (!link || link.target || link.hasAttribute("download") || link.origin !== window.location.origin) return;
      // A suggestion carries its own shared-element move into its page (proposal/view-transition.ts).
      if (link.closest(".oneri-object")) return;
      // The landing is a separate page, not a route; a same-page link has nothing to transition.
      const to = link.pathname + link.search + link.hash;
      if (link.pathname === "/" || link.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            landed.current = resolve;
            router.push(to);
            setTimeout(resolve, TRANSITION_CAP_MS);
          }),
      );
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
}

/** Tells .u-bleed the width of a classic scrollbar, so full-bleed bands stay centred. */
function useScrollbarWidth() {
  useEffect(() => {
    const measure = () => document.documentElement.style.setProperty("--u-scrollbar", `${window.innerWidth - document.documentElement.clientWidth}px`);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
}

/**
 * The app's one frame: the wordmark, the four screens, the stop and the account. The home is a
 * full-bleed scene; every other screen sits in the page column. `data-solo` marks the frame.
 */
export function SoloShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  useRouteFocus(pathname);
  useRouteTransition(pathname);
  useScrollbarWidth();
  const isHome = pathname === HOME;
  return (
    <SessionProvider user={user}>
      <ApiProvider>
        <DeskStateProvider>
          <div data-solo className="flex min-h-dvh flex-col text-ink">
            <a href="#icerik" className="sr-only-focusable fixed top-2 left-2 z-[70] border-2 border-ink bg-panel px-3 py-2 text-ui font-medium">
              İçeriğe geç
            </a>
            <SoloHeader pathname={pathname} />
            <main id="icerik" tabIndex={-1} className="flex-1 pb-[calc(var(--tab-h)+env(safe-area-inset-bottom))] outline-none sm:pb-0">
              <div className="u-page">
                {/* Home and Param carry the stop state themselves, with the way back. */}
                <RiskBanner showStopped={pathname !== HOME && pathname !== ROUTES.portfoy} />
              </div>
              <ResetBoundary>
                <div key={pathname} className={isHome ? undefined : "u-page pt-4 pb-16 sm:pt-8 sm:pb-24"}>
                  {children}
                </div>
              </ResetBoundary>
            </main>
            <Toaster />
          </div>
        </DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}

/** Flips once the page has moved under the bar: only then does the bar get an edge. */
function useScrolled() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setScrolled(e ? !e.isIntersecting : false));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { sentinel, scrolled };
}

/** Sits in the sky with no box. From 640px the nav is in the row; on a phone it is the bottom bar. */
function SoloHeader({ pathname }: { pathname: string }) {
  const { sentinel, scrolled } = useScrolled();
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      <header className="bar" data-scrolled={scrolled}>
        <div className="bar__row u-page">
          <Link href={HOME} aria-label="KAPtan, ana sayfa" className="flex h-11 shrink-0 items-center focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <Wordmark className="solo-wordmark h-9 w-auto sm:h-10" title="KAPtan" />
          </Link>
          <MainNav pathname={pathname} />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <StopControl />
            <AccountMenu />
          </div>
        </div>
      </header>
    </>
  );
}

/** Drawn for the bottom bar only: a person looking for a screen by its shape. */
const TAB_ICON: Readonly<Record<NavKey, ReactNode>> = {
  benim: <path d="M3 16.5c2 1 16 1 18-.5l-2 3.5a1 1 0 0 1-.9.5H6a1 1 0 0 1-.8-.4ZM12 16V3.5l6 11M12 4l-5.5 10.5H12" />,
  portfoy: <path d="M3.5 4h17v16h-17ZM13.5 4v16M13.5 11h7M3.5 14h10" />,
  bildirimler: <path d="M6 3.5h9l4 4V20.5H6ZM14.5 3.5V8H19M9 12h7M9 15.5h7" />,
  gecmis: <path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5M4 4v4.5h4.5M12 7.5V12l3 2" />,
};

function MainNav({ pathname }: { pathname: string }) {
  const active = activeNavHref(pathname);
  return (
    <nav aria-label="Ana gezinme" className="bar-nav sm:ml-4">
      <ul className="flex items-center">
        {NAV_ITEMS.map((item) => (
          <li key={item.key}>
            <Link href={item.href} aria-current={item.href === active ? "page" : undefined} className="nav-link">
              {item.href === active ? <span aria-hidden className="nav-flag" /> : null}
              <svg aria-hidden viewBox="0 0 24 24" className="nav-link__icon">
                {TAB_ICON[item.key]}
              </svg>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The stop is reachable from every screen, a quiet red word in the bar; it still asks first. Once
 * stopped it says so and leads home, where the band has the way back.
 */
function StopControl() {
  const desk = useDesk();
  const controls = useStopRestart(() => desk.refresh());
  if (desk.risk?.kill_switch === "on") {
    return (
      <Link href={HOME} className="stop-chip">
        <span aria-hidden className="stop-chip__mark" />
        Durduruldu
      </Link>
    );
  }
  return (
    <ConfirmAction
      trigger={
        <button type="button" className="stop-chip" aria-label="Durdur: tüm işlemler">
          <span aria-hidden className="stop-chip__mark" />
          Durdur
        </button>
      }
      title="Tüm işlemler durdurulsun mu?"
      description="Yeni alım ve satım yapılmaz, bekleyen işlemler iptal edilir. Elindeki hisseler satılmaz."
      confirm="Evet, durdur"
      busy="Durduruluyor…"
      tone="critical"
      pending={controls.stopPending}
      error={controls.stopError}
      onConfirm={controls.onStop}
    />
  );
}

/** The account: a person in a compass ring, "Hesabım" from 768px. The menu: Ayarlar, Çıkış. */
function AccountMenu() {
  const router = useRouter();
  const [leaving, start] = useTransition();
  const signOut = () =>
    start(async () => {
      try {
        router.replace(await logout());
        router.refresh();
      } catch {
        notify.error("Çıkış yapılamadı", "Bir daha dene.");
      }
    });
  return (
    <M.Root modal={false}>
      <M.Trigger
        aria-label="Hesabım"
        aria-busy={leaving || undefined}
        className="group inline-flex h-11 items-center gap-2 pr-1 pl-1 transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-brand data-[state=open]:bg-wash-tint"
      >
        <span aria-hidden className="grid size-9 place-items-center rounded-full border-2 border-ink text-ink">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <circle cx="12" cy="8.5" r="3.75" />
            <path d="M5 20c.8-3.9 3.5-6 7-6s6.2 2.1 7 6" />
          </svg>
        </span>
        <span className="hidden text-[15px] leading-tight font-medium text-ink md:block">Hesabım</span>
        <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 text-ink transition-transform duration-[var(--dur-quick)] group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path d="M2 4l3 3 3-3" />
        </svg>
      </M.Trigger>
      <M.Portal>
        <M.Content side="bottom" align="end" sideOffset={8} className={cn(MENU_CONTENT, "w-[220px]")}>
          <M.Item asChild className={MENU_ITEM}>
            <Link href={ROUTES.ayarlar}>Ayarlar</Link>
          </M.Item>
          <M.Item className={MENU_ITEM} disabled={leaving} onSelect={signOut}>
            {leaving ? "Çıkılıyor…" : "Çıkış"}
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

/**
 * Resolve the person with GET /me, then render the frame. Signed out → /login; the API not
 * answering is a different thing and says so, with a retry.
 */
export function HttpBoot({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    createClient()
      .me()
      .then((me) => {
        if (alive) setUser({ uid: me.id, name: me.display_name });
      })
      .catch((e: unknown) => {
        if (!isUnreachable(e)) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        else if (alive) {
          setDown(true);
          setChecking(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [router, pathname, attempt]);
  if (!user && down) {
    return (
      <UnreachableScreen
        pending={checking}
        onRetry={() => {
          setChecking(true);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!user) {
    return (
      <div data-solo className="min-h-dvh">
        <div className="mx-auto max-w-md p-10">
          <SkeletonLines lines={4} />
        </div>
      </div>
    );
  }
  return <SoloShell user={user}>{children}</SoloShell>;
}
