"use client";

import "./solo.css";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/api/client";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { FULL_PANEL_HOME, SOLO_HOME } from "@/lib/solo/mode";
import { Wordmark } from "@/components/brand/marks";
import { SkeletonLines } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/toast";
import { logout } from "@/components/shell/session-actions";

/**
 * The frame of the single-user home: the wordmark, the screen's name, a small way into the full
 * desk ("Gelişmiş görünüm") and "Çıkış". No roles, no menus. `data-solo` switches on this
 * screen's tokens (dark reading, allocation inks) in solo.css.
 */
export function SoloShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <SessionProvider user={user}>
      <ApiProvider>
        <div data-solo className="min-h-dvh bg-paper text-ink">
          <a href="#icerik" className="sr-only-focusable fixed top-2 left-2 z-[70] border-2 border-ink bg-panel px-3 py-2 text-ui font-medium">
            İçeriğe geç
          </a>
          <SoloHeader />
          <main id="icerik" tabIndex={-1} className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-20 outline-none sm:px-8 sm:pt-10">
            {children}
          </main>
          <Toaster />
        </div>
      </ApiProvider>
    </SessionProvider>
  );
}

function SoloHeader() {
  const router = useRouter();
  const [leaving, start] = useTransition();
  const signOut = () =>
    start(async () => {
      router.replace(await logout());
      router.refresh();
    });
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-3 px-4 sm:px-8">
        <Link href={SOLO_HOME} aria-label="Benim KAPtan'ım, ana sayfa" className="shrink-0">
          <Wordmark className="h-8 w-auto" title="KAPtan" />
        </Link>
        <span aria-hidden className="hidden h-6 w-0.5 bg-hairline sm:block" />
        <span className="hidden text-ui font-semibold text-ink sm:block">Benim KAPtan&apos;ım</span>
        <nav aria-label="Hesap" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href={FULL_PANEL_HOME}
            className="inline-flex min-h-11 items-center px-2 text-dense font-medium text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink"
          >
            Gelişmiş görünüm
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={leaving}
            className="inline-flex min-h-11 items-center px-2 text-dense font-medium text-ink-soft hover:text-ink disabled:cursor-progress"
          >
            {leaving ? "Çıkılıyor…" : "Çıkış"}
          </button>
        </nav>
      </div>
    </header>
  );
}

/** http mode: resolve the person with GET /me, then render the frame; on failure → /login. */
export function SoloHttpBoot({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let alive = true;
    createClient({ getActor: () => null })
      .me()
      .then((me) => {
        if (alive) setUser({ uid: me.id, name: me.display_name, role: me.role });
      })
      .catch(() => router.replace(`/login?next=${encodeURIComponent(SOLO_HOME)}`));
    return () => {
      alive = false;
    };
  }, [router]);
  if (!user) {
    return (
      <div data-solo className="min-h-dvh bg-paper">
        <div className="mx-auto max-w-md p-10">
          <SkeletonLines lines={4} />
        </div>
      </div>
    );
  }
  return <SoloShell user={user}>{children}</SoloShell>;
}
