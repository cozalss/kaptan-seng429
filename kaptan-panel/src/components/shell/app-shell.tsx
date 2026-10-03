"use client";

import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { IS_MOCK } from "@/lib/api/config";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { Disclaimer } from "@/components/brand/disclaimer";
import { TooltipProvider } from "@/components/ui/overlay";
import { DemoRibbon, RiskBanner } from "./banners";
import { CommandPalette } from "./command-palette";
import { DeskStateProvider, ResetBoundary } from "./desk-state";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * The panel's frame: mock ribbon, left rail (drawer under 1024px), sticky top bar with
 * session/counters/approvals/kill switch, global risk bands, ⌘K palette, and the
 * disclaimer under every screen. Screens render inside <main>.
 */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <SessionProvider user={user}>
      <ApiProvider>
        <DeskStateProvider>
          <TooltipProvider>
            <a
              href="#icerik"
              className="sr-only-focusable fixed top-2 left-2 z-[70] border-[1.5px] border-ink bg-panel px-3 py-2 text-ui font-medium"
            >
              İçeriğe geç
            </a>
            {IS_MOCK ? <DemoRibbon /> : null}
            <div className={cn("flex min-h-[calc(100dvh-var(--chrome-top))]", IS_MOCK ? "[--chrome-top:var(--ribbon-h)]" : "[--chrome-top:0px]")}>
              <aside className="sticky top-[var(--chrome-top)] hidden h-[calc(100dvh-var(--chrome-top))] w-[var(--sidebar-w)] shrink-0 border-r-[1.5px] border-ink lg:block">
                <Sidebar />
              </aside>
              <D.Root open={menuOpen} onOpenChange={setMenuOpen}>
                <D.Portal>
                  <D.Overlay className="fixed inset-0 z-50 bg-scrim lg:hidden" />
                  <D.Content className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] border-r-[1.5px] border-ink shadow-[6px_0_0_var(--ink)] outline-none lg:hidden">
                    <D.Title className="sr-only">Menü</D.Title>
                    <D.Description className="sr-only">Panel ekranları</D.Description>
                    <Sidebar onNavigate={() => setMenuOpen(false)} />
                  </D.Content>
                </D.Portal>
              </D.Root>
              <div className="flex min-w-0 flex-1 flex-col">
                <Topbar onMenu={() => setMenuOpen(true)} onSearch={() => setPaletteOpen(true)} />
                <RiskBanner />
                <main id="icerik" tabIndex={-1} className="mx-auto w-full max-w-[1480px] flex-1 px-4 pt-6 pb-4 outline-none sm:px-6 lg:px-8">
                  <ResetBoundary>{children}</ResetBoundary>
                </main>
                <div className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-8">
                  <Disclaimer />
                </div>
              </div>
            </div>
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          </TooltipProvider>
        </DeskStateProvider>
      </ApiProvider>
    </SessionProvider>
  );
}
