"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DEMO_MODE } from "@/lib/api/config";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { Disclaimer } from "@/components/brand/disclaimer";
import { Toaster } from "@/components/ui/toast";
import { GuidedDemo } from "@/components/demo/guided-demo";
import { RiskBanner } from "./banners";
import { DeskStateProvider, ResetBoundary } from "./desk-state";
import { TopBar } from "./top-bar";

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

/**
 * The panel's frame: a white top bar (KAPtan · Bugün · Portföy · Denetim · account), one
 * calm column (~720 px) for the screen, the required disclaimer under it, the guided-tour bar
 * when it is running, and the toasts.
 */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  useRouteFocus(pathname);
  return (
    <SessionProvider user={user}>
      <ApiProvider>
        <DeskStateProvider>
          <a href="#icerik" className="sr-only-focusable fixed top-2 left-2 z-[70] border-2 border-ink bg-panel px-3 py-2 text-ui font-medium">
            İçeriğe geç
          </a>
          <TopBar />
          <RiskBanner />
          <main id="icerik" tabIndex={-1} className="mx-auto w-full max-w-[752px] px-4 pt-10 pb-16 outline-none sm:px-6 sm:pt-14">
            <ResetBoundary>
              {/* Each screen is set down once per route (opacity + 4 px, 180ms, never a slide-in). */}
              <div key={pathname} className="animate-page-in">
                {children}
              </div>
            </ResetBoundary>
          </main>
          <div className="mx-auto w-full max-w-[752px] px-4 sm:px-6">
            <Disclaimer />
          </div>
          {DEMO_MODE ? <GuidedDemo /> : null}
          <Toaster />
        </DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}
