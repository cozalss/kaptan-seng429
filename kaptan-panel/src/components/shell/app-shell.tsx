"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { IS_MOCK } from "@/lib/api/config";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { Disclaimer } from "@/components/brand/disclaimer";
import { DemoRibbon, RiskBanner } from "./banners";
import { DeskStateProvider, ResetBoundary } from "./desk-state";
import { TopBar } from "./top-bar";

/**
 * The panel's frame: a thin demo ribbon, a quiet top bar (KAPtan · Bugün · Portföy · ⚙), one
 * calm column (~720 px) for the screen, and the required disclaimer under it.
 */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <SessionProvider user={user}>
      <ApiProvider>
        <DeskStateProvider>
          <a href="#icerik" className="sr-only-focusable fixed top-2 left-2 z-[70] border-[1.5px] border-ink bg-panel px-3 py-2 text-ui font-medium">
            İçeriğe geç
          </a>
          {IS_MOCK ? <DemoRibbon /> : null}
          <TopBar />
          <RiskBanner />
          <main id="icerik" tabIndex={-1} className="mx-auto w-full max-w-[752px] px-4 pt-10 pb-16 outline-none sm:px-6 sm:pt-14">
            <ResetBoundary>
              {/* Each screen is set down once per route (opacity + 4 px, never a slide-in). */}
              <div key={pathname} className="animate-page-in">
                {children}
              </div>
            </ResetBoundary>
          </main>
          <div className="mx-auto w-full max-w-[752px] px-4 sm:px-6">
            <Disclaimer />
          </div>
        </DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}
