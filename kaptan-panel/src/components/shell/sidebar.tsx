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
import { IconArrow, IconClose, IconPerson, IconSidebar, NAV_ICON } from "./icons";
import { SOLO_HOME } from "@/lib/solo/mode";
import { rememberView } from "@/lib/solo/view-pref";

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
            collapsed && "lg:absolute lg:top-[72px] lg:left-1/2 lg:z-10 lg:-translate-x-1/2",
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

      <nav aria-label="Ana gezinme" className={cn("mt-3 pl-3", collapsed && "lg:mt-16 lg:pl-3")}>
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
                    "relative mr-3 flex h-11 items-center gap-3 rounded-lg pr-3 pl-3 text-ui transition-colors duration-[var(--dur-quick)]",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-navy",
                    on
                      ? "bg-white/[0.11] font-semibold text-on-navy before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-navy-action"
                      : "font-medium text-on-navy-soft hover:bg-navy-raised hover:text-on-navy",
                    collapsed && "lg:justify-center lg:pr-3",
                  )}
                >
                  <Icon className={on ? "text-on-navy" : undefined} />
                  <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:sr-only")}>{item.label}</span>
                  {badge !== null ? (
                    <span
                      className={cn(
                        "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-meta leading-none font-semibold tabular-nums",
                        "bg-on-navy text-navy",
                        collapsed && "lg:absolute lg:top-0.5 lg:right-1.5 lg:h-5 lg:min-w-5 lg:text-[12px]",
                      )}
                    >
                      {badge}
                      <span className="sr-only"> bekleyen öneri</span>
                    </span>
                  ) : null}
                  {alarm ? (
                    <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-on-navy">
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

      <div className={cn("mt-auto px-4 pt-6", collapsed && "lg:px-3")}>
        <PersonalSwitch collapsed={collapsed} />
      </div>

      <div className="space-y-3 p-4">
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

/**
 * "Kişisel moda geç": the same desk as one person's simple home (/benim), with what this role may
 * press. The choice is remembered, so the next sign-in lands there too.
 */
function PersonalSwitch({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href={SOLO_HOME}
      onClick={() => rememberView("benim")}
      title={collapsed ? "Kişisel moda geç" : undefined}
      data-testid="kisisel-mod"
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-navy-line px-3 py-2.5 text-on-navy-soft transition-colors duration-[var(--dur-quick)] hover:bg-navy-raised hover:text-on-navy",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-navy",
        collapsed && "lg:justify-center lg:border-transparent lg:px-0",
      )}
    >
      <IconPerson className="text-on-navy" />
      <span className={cn("min-w-0 flex-1 leading-tight", collapsed && "lg:sr-only")}>
        <span className="block text-ui font-semibold text-on-navy">Kişisel moda geç</span>
        <span className="block text-meta text-on-navy-muted">Sade, tek ekran</span>
      </span>
      <IconArrow className={cn("size-4 transition-transform duration-[var(--dur-quick)] group-hover:translate-x-0.5", collapsed && "lg:hidden")} />
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
