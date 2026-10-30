"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNow } from "@/lib/clock";
import { activeNavHref, HOME, href, NAV_ITEMS, ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { effectiveStatus } from "@/components/approvals/approvals-logic";
import { useRole } from "@/components/roles/use-role";
import { AccountMenu } from "./account-menu";
import { useDesk } from "./desk-state";
import { IconArrow, IconClose, IconSidebar, NAV_ICON } from "./icons";

export interface SidebarProps {
  /** Phone/tablet: the drawer is open. Ignored from 1024px, where the sidebar is always there. */
  open: boolean;
  onClose: () => void;
  /** Desktop: folded to an icon rail. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** Open proposals still waiting for their second signature (none while everything is stopped). */
function useOpenCount(): number {
  const { pending, risk } = useDesk();
  const now = useNow(30_000);
  if (risk?.kill_switch === "on") return 0;
  return pending.filter((c) => effectiveStatus(c, now) === "pending").length;
}

/**
 * The fixed navy sidebar: the wordmark, the desk's sections with live counts, one action that
 * fits the role you look through, and the account card (role switch, Ayarlar, Çıkış) at the
 * foot. Under 1024px it is a drawer opened from the top bar. The current section is cut out
 * of the navy in the canvas colour, so it reads as the page it opens.
 */
export function Sidebar({ open, onClose, collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const active = activeNavHref(pathname);
  const { risk } = useDesk();
  const count = useOpenCount();
  const stopped = risk?.kill_switch === "on";
  // Opening the drawer puts focus inside it (on its close button), so keys start there.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <aside
      id="kenar-cubugu"
      aria-label="Kenar çubuğu"
      data-collapsed={collapsed || undefined}
      className={cn(
        "group/side fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-w)] flex-col bg-navy text-on-navy-soft",
        "transition-[translate,width,visibility] duration-[var(--dur-base)] ease-[var(--ease-out-expo)]",
        open ? "max-lg:visible max-lg:translate-x-0 max-lg:shadow-[8px_0_40px_rgb(10_33_72/0.35)]" : "max-lg:invisible max-lg:-translate-x-full",
        collapsed && "lg:w-[76px]",
      )}
    >
      <div className={cn("flex h-16 shrink-0 items-center gap-2 pr-3 pl-5", collapsed && "lg:justify-center lg:px-0")}>
        <Link
          href={HOME}
          aria-label="KAPtan — Bugün"
          className="-ml-1 inline-flex h-11 min-w-0 items-center rounded-md p-1 text-on-navy focus-visible:outline-on-navy"
        >
          <Wordmark className={cn("h-7 w-auto text-on-navy", collapsed && "lg:hidden")} />
          <CompassMark className={cn("hidden size-8 text-on-navy", collapsed && "lg:block")} />
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Kenar çubuğunu aç" : "Kenar çubuğunu daralt"}
          aria-expanded={!collapsed}
          aria-controls="kenar-cubugu"
          className={cn(
            "ml-auto hidden size-9 place-items-center rounded-lg border border-navy-line text-on-navy-soft transition-colors hover:bg-navy-raised hover:text-on-navy focus-visible:outline-on-navy lg:grid",
            collapsed && "lg:absolute lg:top-[72px] lg:left-1/2 lg:-translate-x-1/2",
          )}
        >
          <IconSidebar className="size-[18px]" />
        </button>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Menüyü kapat"
          className="ml-auto grid size-11 place-items-center rounded-lg text-on-navy-soft hover:bg-navy-raised hover:text-on-navy focus-visible:outline-on-navy lg:hidden"
        >
          <IconClose />
        </button>
      </div>

      <p className={cn("mt-4 px-6 font-mono text-[12px] leading-4 font-medium tracking-[0.16em] text-on-navy-muted uppercase", collapsed && "lg:mt-14 lg:sr-only")}>Masa</p>

      <nav aria-label="Ana gezinme" className={cn("mt-3 pl-3", collapsed && "lg:mt-0 lg:pl-3")}>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const on = active === item.href;
            const Icon = NAV_ICON[item.key];
            const badge = item.key === "bugun" && count > 0 ? count : null;
            const alarm = item.key === "portfoy" && stopped;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex h-11 items-center gap-3 rounded-l-xl pr-5 pl-3 text-ui transition-colors duration-[var(--dur-quick)]",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-navy",
                    on
                      ? "bg-paper font-semibold text-navy before:absolute before:-top-3 before:right-0 before:size-3 before:bg-[radial-gradient(circle_at_0_0,transparent_11.5px,var(--paper)_12px)] after:absolute after:right-0 after:-bottom-3 after:size-3 after:bg-[radial-gradient(circle_at_0_100%,transparent_11.5px,var(--paper)_12px)]"
                      : "mr-3 rounded-xl font-medium text-on-navy-soft hover:bg-navy-raised hover:text-on-navy",
                    collapsed && "lg:justify-center lg:pr-3",
                  )}
                >
                  <Icon className={on ? "text-navy" : undefined} />
                  <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:sr-only")}>{item.label}</span>
                  {badge !== null ? (
                    <span
                      className={cn(
                        "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-meta leading-none font-semibold tabular-nums",
                        on ? "bg-navy text-on-navy" : "bg-on-navy text-navy",
                        collapsed && "lg:absolute lg:top-0.5 lg:right-1.5 lg:h-5 lg:min-w-5 lg:text-[12px]",
                      )}
                    >
                      {badge}
                      <span className="sr-only"> bekleyen öneri</span>
                    </span>
                  ) : null}
                  {alarm ? (
                    <span className={cn("inline-flex items-center gap-1.5 text-meta font-semibold", on ? "text-north" : "text-on-navy")}>
                      <span aria-hidden className="size-2 rounded-full bg-north ring-2 ring-on-navy/70" />
                      <span className={cn(collapsed && "lg:sr-only")}>durdu</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("mt-6 px-4", collapsed && "lg:px-3")}>
        <RoleAction collapsed={collapsed} />
      </div>

      <div className="mt-auto space-y-3 p-4">
        <RegimeLine collapsed={collapsed} />
        <AccountMenu variant="sidebar" collapsed={collapsed} />
      </div>
    </aside>
  );
}

/**
 * The one action that fits the role: the Risk Sorumlusu (and the others who prepare it) jump
 * to the next open proposal; the Denetçi goes to the ledger. Nothing when there is nothing to do.
 */
function RoleAction({ collapsed }: { collapsed: boolean }) {
  const { role } = useRole();
  const { pending, risk } = useDesk();
  const now = useNow(30_000);
  const next = risk?.kill_switch === "on" ? undefined : pending.find((c) => effectiveStatus(c, now) === "pending");
  const target = role === "auditor" ? { to: ROUTES.denetim, label: "Defteri doğrula" } : next ? { to: href.proposal(next.proposal_id), label: "Sıradaki öneri" } : null;
  if (!target) return null;
  return (
    <Link
      href={target.to}
      title={collapsed ? target.label : undefined}
      className={cn(
        "flex h-11 items-center justify-center gap-2 rounded-xl bg-navy-action px-4 text-ui font-semibold text-navy transition-colors duration-[var(--dur-quick)] hover:bg-on-navy",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-navy",
        collapsed && "lg:px-0",
      )}
    >
      <span className={cn(collapsed && "lg:sr-only")}>{target.label}</span>
      <IconArrow className="size-[18px]" />
    </Link>
  );
}

/** The day's market regime in one quiet line over the account card. */
function RegimeLine({ collapsed }: { collapsed: boolean }) {
  const { risk } = useDesk();
  if (!risk) return null;
  const crisis = risk.regime === "crisis";
  return (
    <p className={cn("flex items-center gap-2 px-2 text-meta text-on-navy-soft", collapsed && "lg:justify-center lg:px-0")}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", crisis ? "bg-ochre" : "bg-signal-ok")} />
      <span className={cn(collapsed && "lg:sr-only")}>
        Piyasa: <span className="font-semibold text-on-navy">{crisis ? "Kriz" : "Normal"}</span>
      </span>
    </p>
  );
}

/** The compass alone, for the folded rail. */
function CompassMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 64" aria-hidden className={className}>
      <ellipse cx="30" cy="32" rx="26.5" ry="27.5" fill="none" stroke="currentColor" strokeWidth="5.5" />
      <path d="M30 10.6 32.7 32H27.3Z" fill="currentColor" />
      <path d="M27.3 32 30 53.4 32.7 32" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
