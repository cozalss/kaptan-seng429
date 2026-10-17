"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref, HOME, NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { AccountMenu } from "./account-menu";
import { ActiveRule } from "./active-rule";

/**
 * KAPtan · Bugün · Portföy · Denetim · [account]. One white row with one ink rule under it,
 * sticky from 640px. On a phone the navigation takes its own row under the wordmark and the
 * account, so every target stays 44px. Each control is rendered once.
 */
export function TopBar() {
  const active = activeNavHref(usePathname());

  return (
    <header className="z-30 border-b-2 border-ink bg-panel sm:sticky sm:top-0">
      <div className="mx-auto grid max-w-[752px] grid-cols-[1fr_auto] items-center gap-x-4 px-4 sm:flex sm:h-16 sm:px-6">
        <Link href={HOME} aria-label="KAPtan — Bugün" className="col-start-1 row-start-1 -ml-1 inline-flex h-14 shrink-0 items-center justify-self-start p-1 sm:h-16">
          <Wordmark className="h-6 w-auto sm:h-7" />
        </Link>
        <nav
          aria-label="Ana gezinme"
          className="col-span-full row-start-2 -mx-4 flex items-center gap-1 border-t border-hairline px-3 sm:mx-0 sm:ml-6 sm:mr-auto sm:border-t-0 sm:px-0"
        >
          {NAV_ITEMS.map((item) => {
            const on = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center px-2.5 text-ui transition-colors duration-[var(--dur-quick)] sm:h-16 sm:px-3",
                  on ? "font-semibold text-brand" : "font-medium text-ink-soft hover:text-ink",
                )}
              >
                {item.label}
                <ActiveRule on={on} className="inset-x-2.5 sm:inset-x-3" />
              </Link>
            );
          })}
        </nav>
        <div className="col-start-2 row-start-1 justify-self-end">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
