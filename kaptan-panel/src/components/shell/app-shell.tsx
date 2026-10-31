"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DEMO_MODE } from "@/lib/api/config";
import { cn } from "@/lib/utils";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { rememberView } from "@/lib/solo/view-pref";
import { Toaster } from "@/components/ui/toast";
import { GuidedDemo } from "@/components/demo/guided-demo";
import { RiskBanner } from "./banners";
import { DeskStateProvider, ResetBoundary } from "./desk-state";
import { MobileBar, PageEyebrow } from "./page-frame";
import { Sidebar } from "./sidebar";

/**
 * After a client-side route change, focus lands on the new screen's big sentence (marked
 * `data-route-focus`, see story/ui.tsx BigSentence) or, failing that, on <main>, so keyboard
 * and screen-reader users start on the new page instead of the link they left. The first
 * render keeps the browser's own focus.
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

/** The folded sidebar is a preference of this browser. */
const COLLAPSE_KEY = "kaptan.sidebar.collapsed";

function useSidebarState(pathname: string) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1"), 0);
    return () => clearTimeout(id);
  }, []);
  // The drawer closes when you go somewhere.
  useEffect(() => {
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }, []);
  return { open, setOpen, collapsed, toggleCollapsed };
}

/**
 * The panel's frame: the navy sidebar (a drawer under 1024px, opened from a slim top bar), the
 * risk band, and the content column that fills the width: an eyebrow line (where you are · the
 * server's date) over each screen, then the screen's own cards. The guided-tour bar and the
 * toasts sit on top.
 */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  useRouteFocus(pathname);
  const side = useSidebarState(pathname);
  // This browser's view is now the full desk: the next sign-in lands here (see view-pref.ts).
  useEffect(() => rememberView("masa"), []);
  return (
    <SessionProvider user={user}>
      <ApiProvider>
        <DeskStateProvider>
          <a href="#icerik" className="sr-only-focusable fixed top-2 left-2 z-[70] rounded-lg border-2 border-ink bg-panel px-3 py-2 text-ui font-medium">
            İçeriğe geç
          </a>
          <MobileBar open={side.open} onOpen={() => side.setOpen(true)} />
          <Sidebar open={side.open} onClose={() => side.setOpen(false)} collapsed={side.collapsed} onToggleCollapsed={side.toggleCollapsed} />
          {side.open ? <button type="button" aria-label="Menüyü kapat" tabIndex={-1} onClick={() => side.setOpen(false)} className="fixed inset-0 z-40 bg-navy/40 backdrop-blur-[2px] lg:hidden" /> : null}
          <div
            data-shell=""
            className={cn(
              "min-h-dvh transition-[padding] duration-[var(--dur-base)] ease-[var(--ease-out-expo)]",
              side.collapsed ? "lg:pl-[76px] lg:[background:linear-gradient(to_right,var(--navy)_76px,transparent_76px)]" : "lg:pl-[var(--sidebar-w)] lg:[background:linear-gradient(to_right,var(--navy)_var(--sidebar-w),transparent_var(--sidebar-w))]",
            )}
          >
            <main id="icerik" tabIndex={-1} className="mx-auto w-full max-w-[1560px] px-4 pt-5 pb-16 outline-none sm:px-6 lg:px-8 lg:pt-7 xl:px-10">
              <RiskBanner />
              <PageEyebrow />
              <ResetBoundary>
                {/* Each screen is set down once per route (opacity + 4 px, 180ms, never a slide-in). */}
                <div key={pathname} className="animate-page-in">
                  {children}
                </div>
              </ResetBoundary>
            </main>
          </div>
          {DEMO_MODE ? <GuidedDemo /> : null}
          <Toaster />
        </DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}
