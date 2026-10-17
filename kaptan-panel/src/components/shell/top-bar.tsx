"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref, HOME, NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { RolePicker } from "@/components/roles/role-picker";
import { ActiveRule } from "./active-rule";
import { SettingsMenu } from "./settings-menu";

/**
 * KAPtan · Bugün · Portföy · Denetim · [rol] · ⚙ Ayarlar. One row on a wide screen, sticky,
 * on paper with one hairline under it. On a phone the bar scrolls away with the page and the
 * role picker and ⚙ get a second row, under the question they answer. Each control is
 * rendered once; the second row simply dissolves into the first on wider screens.
 */
export function TopBar() {
  const active = activeNavHref(usePathname());

  return (
    <header className="z-30 border-b border-hairline bg-paper sm:sticky sm:top-0">
      <div className="mx-auto grid max-w-[752px] grid-cols-[1fr_auto] items-center px-4 sm:flex sm:h-14 sm:gap-1 sm:px-6">
        <Link href={HOME} aria-label="KAPtan — Bugün" className="-ml-1 inline-flex h-11 shrink-0 items-center self-center p-1 sm:mr-auto sm:h-14">
          <Wordmark className="h-6 w-auto sm:h-7" />
        </Link>
        <nav aria-label="Ana gezinme" className="flex items-center justify-self-end">
          {NAV_ITEMS.map((item) => {
            const on = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center px-1.5 text-ui transition-colors duration-[var(--dur-quick)] min-[360px]:px-2 sm:h-14 sm:px-3",
                  on ? "font-medium text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {item.label}
                <ActiveRule on={on} className="inset-x-1.5 min-[360px]:inset-x-2 sm:inset-x-3" />
              </Link>
            );
          })}
        </nav>
        <div className="col-span-full -mx-4 flex h-11 items-center justify-between gap-1.5 border-t border-hairline px-4 sm:contents">
          <span className="min-w-0 truncate text-dense text-muted sm:hidden">
            <span className="min-[420px]:hidden">Kimin gözüyle?</span>
            <span className="hidden min-[420px]:inline">Kimin gözüyle bakıyorsun?</span>
          </span>
          <div className="flex shrink-0 items-center sm:ml-3">
            <RolePicker />
            <SettingsMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
