import type { ReactNode } from "react";
import type { NavKey } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The shell's line icons: 20px, 1.6 stroke, round joins, drawn on a 20 grid so they sit with
 * Inter at 15px. Decorative only (aria-hidden): every icon stands next to its words.
 */
function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

/** Bugün: the desk's four panes. */
export function IconToday({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </Icon>
  );
}

/** Bildirimler: a page with its lines (a KAP notice). */
export function IconNotices({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5.5 2.75h6.25l3 3v11.5h-9.25z" />
      <path d="M11.5 2.75v3.25h3.25M8 10h5M8 13h5" />
    </Icon>
  );
}

/** Portföy: a line that climbs. */
export function IconPortfolio({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 16.5h14" />
      <path d="M4 13l4-4.5 3 2.5 5-6" />
      <path d="M12.5 5H16v3.5" />
    </Icon>
  );
}

/** Denetim kaydı: a ledger with a check. */
export function IconLedger({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10 2.75l6 2.25v4.5c0 3.6-2.5 6.4-6 7.75-3.5-1.35-6-4.15-6-7.75V5z" />
      <path d="M7.25 10l2 2 3.5-3.75" />
    </Icon>
  );
}

/** Ayarlar: two sliders. */
export function IconSettings({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3.5 6.5h13M3.5 13.5h13" />
      <circle cx="7.5" cy="6.5" r="2" fill="var(--icon-fill, transparent)" />
      <circle cx="12.5" cy="13.5" r="2" fill="var(--icon-fill, transparent)" />
    </Icon>
  );
}

export const NAV_ICON: Readonly<Record<NavKey, (p: { className?: string }) => ReactNode>> = {
  bugun: IconToday,
  bildirimler: IconNotices,
  portfoy: IconPortfolio,
  denetim: IconLedger,
  ayarlar: IconSettings,
};

export function IconMenu({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
    </Icon>
  );
}

export function IconClose({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 5l10 10M15 5L5 15" />
    </Icon>
  );
}

/** The sidebar's fold: a panel with its left column. */
export function IconSidebar({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="3.5" width="14" height="13" rx="2.5" />
      <path d="M8 3.5v13" />
    </Icon>
  );
}

export function IconArrow({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4 10h11.5M11 5.5l4.5 4.5-4.5 4.5" />
    </Icon>
  );
}
