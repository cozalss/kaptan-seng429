"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUP_LABEL, routesFor, type NavGroup } from "@/lib/auth/routes";
import { useSession } from "@/lib/auth/session-context";
import { ROLE_CODE, ROLE_LABEL } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { Kbd } from "@/components/ui/primitives";
import { useDesk } from "./desk-state";
import { RoleSwitcher } from "./role-switcher";
import { IS_MOCK } from "@/lib/api/config";

const GROUPS: NavGroup[] = ["masa", "denetim", "sistem"];

/** Left rail: the book's table of contents. Active item = ink bar + wash fill. */
export function Sidebar({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  const user = useSession();
  const { pending } = useDesk();
  const routes = routesFor(user.role);

  return (
    <nav aria-label="Ana gezinme" className={cn("flex h-full flex-col bg-paper", className)}>
      <div className="flex h-[var(--topbar-h)] items-center border-b-[1.5px] border-ink px-4">
        <Link href="/inbox" onClick={onNavigate} className="-ml-1 flex items-center px-1 py-1" aria-label="KAPtan Paneli — Canlı akış">
          <Wordmark className="h-8 w-auto" />
        </Link>
        <span className="ml-auto text-meta text-muted">Panel</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {GROUPS.map((g) => {
          const items = routes.filter((r) => r.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="mb-4">
              <div className="px-4 pb-1.5 text-meta text-muted">{NAV_GROUP_LABEL[g]}</div>
              <ul>
                {items.map((r) => {
                  const active = pathname === r.href || pathname.startsWith(`${r.href}/`);
                  const count = r.href === "/approvals" ? pending.length : 0;
                  return (
                    <li key={r.href}>
                      <Link
                        href={r.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-9 items-center gap-3 pr-3 pl-4 text-ui text-ink-soft",
                          "hover:bg-wash-tint hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                          active && "bg-wash-tint font-medium text-ink",
                        )}
                      >
                        <span aria-hidden className={cn("absolute inset-y-1 left-0 w-[3px]", active ? "bg-ink" : "bg-transparent")} />
                        <span className="flex-1 truncate">{r.label}</span>
                        {count > 0 ? (
                          <span className="grid h-5 min-w-5 place-items-center bg-ink px-1 text-meta font-medium text-on-dark tabular-nums">
                            {count}
                            <span className="sr-only"> bekleyen onay</span>
                          </span>
                        ) : (
                          <Kbd className="opacity-0 group-hover:opacity-100" aria-hidden>
                            {r.goKey}
                          </Kbd>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t-[1.5px] border-ink p-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center border-[1.5px] border-ink bg-panel text-[13px] font-medium">
            {ROLE_CODE[user.role]}
          </span>
          <div className="min-w-0">
            <div className="truncate text-dense font-medium text-ink">{user.name}</div>
            <div className="truncate text-meta text-muted">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>
        {IS_MOCK ? <RoleSwitcher className="mt-3" /> : null}
      </div>
    </nav>
  );
}
