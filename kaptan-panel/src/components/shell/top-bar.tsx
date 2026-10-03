"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu as M } from "radix-ui";
import { activeNavHref, HOME, NAV_ITEMS, ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { logout } from "./session-actions";

/** KAPtan · Bugün · Portföy · ⚙ — nothing else. Sticky, paper, one hairline under it. */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeNavHref(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-paper/92 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-[752px] items-center gap-1 px-4 sm:px-6">
        <Link href={HOME} aria-label="KAPtan — Bugün" className="-ml-1 mr-auto p-1">
          <Wordmark className="h-7 w-auto" />
        </Link>
        <nav aria-label="Ana gezinme" className="flex items-center">
          {NAV_ITEMS.map((item) => {
            const on = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative px-3 py-2 text-[15px] transition-colors duration-[var(--dur-quick)]",
                  on ? "font-medium text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {item.label}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-3 -bottom-[1px] h-[2px] origin-left bg-ink transition-transform duration-[var(--dur-base)] ease-[var(--ease-ink)]",
                    on ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </Link>
            );
          })}
        </nav>
        <M.Root modal={false}>
          <M.Trigger
            aria-label="Ayarlar ve çıkış"
            className={cn(
              "ml-1 grid size-10 place-items-center text-[19px] leading-none text-ink-soft transition-colors hover:bg-wash-tint hover:text-ink data-[state=open]:bg-wash-tint data-[state=open]:text-ink",
              pathname === ROUTES.ayarlar && "text-ink",
            )}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.85 1.85M16.65 16.65l1.85 1.85M5.5 18.5l1.85-1.85M16.65 7.35l1.85-1.85" strokeLinecap="square" />
            </svg>
          </M.Trigger>
          <M.Portal>
            <M.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[180px] border-[1.5px] border-ink bg-panel py-1 shadow-ink data-[state=open]:animate-[page-in_160ms_var(--ease-ink)]"
            >
              <M.Item asChild className="block cursor-pointer px-4 py-2.5 text-[15px] text-ink outline-none data-[highlighted]:bg-wash-tint">
                <Link href={ROUTES.ayarlar}>Ayarlar</Link>
              </M.Item>
              <M.Separator className="my-1 h-px bg-hairline" />
              <M.Item
                className="cursor-pointer px-4 py-2.5 text-[15px] text-ink outline-none data-[highlighted]:bg-wash-tint"
                onSelect={async () => {
                  router.replace(await logout());
                  router.refresh();
                }}
              >
                Çıkış
              </M.Item>
            </M.Content>
          </M.Portal>
        </M.Root>
      </div>
    </header>
  );
}
