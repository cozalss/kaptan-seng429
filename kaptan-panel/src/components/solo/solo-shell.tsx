"use client";

import "./solo.css";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/api/client";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider, type SessionUser } from "@/lib/auth/session-context";
import { useNow } from "@/lib/clock";
import { ROLE_LABEL } from "@/lib/domain/role-meta";
import { dayLabel as longDay, istanbulDay } from "@/lib/session-day";
import { greeting, marketOpen } from "@/lib/solo/greeting";
import { FULL_PANEL_HOME, SOLO_HOME } from "@/lib/solo/mode";
import { rememberView } from "@/lib/solo/view-pref";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { SkeletonLines } from "@/components/ui/primitives";
import { Toaster } from "@/components/ui/toast";
import { logout } from "@/components/shell/session-actions";
import { SoloModeProvider } from "./solo-mode";

/**
 * The frame of the personal home: the wordmark and the screen's name, the way into the full desk
 * ("Gelişmiş görünüm"), who is signed in and "Çıkış"; under it one quiet line with the greeting,
 * the day and whether the market is open. `data-solo` switches on this screen's tokens (dark
 * reading, allocation inks) in solo.css. Opening it remembers "benim" as this browser's view.
 */
export function SoloShell({ user, singleUser = true, children }: { user: SessionUser; singleUser?: boolean; children: ReactNode }) {
  useEffect(() => rememberView("benim"), []);
  return (
    <SessionProvider user={user}>
      <SoloModeProvider singleUser={singleUser}>
        <ApiProvider>
          <div data-solo className="min-h-dvh bg-paper text-ink">
            <a href="#icerik" className="sr-only-focusable fixed top-2 left-2 z-[70] rounded-lg border-2 border-ink bg-panel px-3 py-2 text-ui font-medium">
              İçeriğe geç
            </a>
            <SoloHeader user={user} singleUser={singleUser} />
            <main id="icerik" tabIndex={-1} className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-20 outline-none sm:px-8 sm:pt-7">
              <DayLine name={user.name} />
              {children}
            </main>
            <Toaster />
          </div>
        </ApiProvider>
      </SoloModeProvider>
    </SessionProvider>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("tr-TR");
}

function SoloHeader({ user, singleUser }: { user: SessionUser; singleUser: boolean }) {
  const router = useRouter();
  const [leaving, start] = useTransition();
  const signOut = () =>
    start(async () => {
      router.replace(await logout());
      router.refresh();
    });
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-4 sm:px-8">
        <Link href={SOLO_HOME} aria-label="Benim KAPtan'ım, ana sayfa" className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
          <Wordmark className="solo-wordmark h-8 w-auto" title="KAPtan" />
        </Link>
        <span aria-hidden className="hidden h-6 w-px bg-line-strong sm:block" />
        <span className="hidden text-ui font-semibold text-ink sm:block">Benim KAPtan&apos;ım</span>
        <nav aria-label="Hesap" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href={FULL_PANEL_HOME}
            onClick={() => rememberView("masa")}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-dense font-semibold text-ink transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-sm:h-11 sm:px-3"
          >
            <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
              <rect x="3" y="3" width="6" height="6" rx="1.5" />
              <rect x="11" y="3" width="6" height="6" rx="1.5" />
              <rect x="3" y="11" width="6" height="6" rx="1.5" />
              <rect x="11" y="11" width="6" height="6" rx="1.5" />
            </svg>
            Gelişmiş görünüm
          </Link>
          <span className="hidden items-center gap-2.5 border-l border-line pl-3 md:flex">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-navy text-meta font-semibold text-on-navy ring-1 ring-line-strong">
              {initials(user.name)}
            </span>
            <span className="leading-tight">
              <span className="block text-dense font-semibold text-ink">{user.name}</span>
              {singleUser ? null : <span className="block text-meta text-muted">{ROLE_LABEL[user.role]}</span>}
            </span>
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={leaving}
            className="inline-flex h-10 items-center rounded-lg px-2.5 text-dense font-medium text-ink-soft transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-progress max-sm:h-11"
          >
            {leaving ? "Çıkılıyor…" : "Çıkış"}
          </button>
        </nav>
      </div>
    </header>
  );
}

/** "İyi günler, Üye 3." · "31 Ekim Cuma · Piyasa kapalı" on the server's clock (empty until known). */
function DayLine({ name }: { name: string }) {
  const now = useNow(60_000);
  const open = now !== null && marketOpen(now);
  return (
    <div className="mb-5 flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:mb-6">
      {now === null ? (
        <span />
      ) : (
        <>
          <p className="text-ui text-ink-soft">
            {greeting(now)}, <span className="font-semibold text-ink">{name}</span>.
          </p>
          <p className="inline-flex items-center gap-2 text-meta font-semibold tracking-[0.06em] text-muted uppercase">
            <span aria-hidden className={cn("size-2 rounded-full", open ? "bg-gain" : "bg-line-strong")} />
            {longDay(istanbulDay(now))} · {open ? "Piyasa açık" : "Piyasa kapalı"}
          </p>
        </>
      )}
    </div>
  );
}

/** http mode: resolve the person with GET /me, then render the frame; on failure → /login. */
export function SoloHttpBoot({ singleUser = true, children }: { singleUser?: boolean; children: ReactNode }) {
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
  return (
    <SoloShell user={user} singleUser={singleUser}>
      {children}
    </SoloShell>
  );
}
