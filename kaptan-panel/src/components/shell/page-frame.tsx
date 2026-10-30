"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNow } from "@/lib/clock";
import { fmtDate } from "@/lib/format";
import { HOME, sectionLabel } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { IconMenu } from "./icons";

/** Under 1024px: a slim bar with the menu button and the wordmark (the sidebar is a drawer). */
export function MobileBar({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-panel/95 px-2 backdrop-blur-sm lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Menüyü aç"
        aria-expanded={open}
        aria-controls="kenar-cubugu"
        className="grid size-11 place-items-center rounded-lg text-ink hover:bg-wash-tint"
      >
        <IconMenu />
      </button>
      <Link href={HOME} aria-label="KAPtan" tabIndex={-1} className="inline-flex h-11 items-center">
        <Wordmark className="h-6 w-auto" />
      </Link>
    </header>
  );
}

/**
 * The mono line over every screen: KAPTAN · where you are, a hairline, and the date on the
 * server's clock (never the browser's: in http mode it stays empty until the server answers).
 */
export function PageEyebrow() {
  const pathname = usePathname();
  const now = useNow(60_000);
  return (
    <div className="mb-3 flex items-center gap-3 font-mono text-[12px] leading-5 tracking-[0.14em] text-muted uppercase">
      <span className="whitespace-nowrap">
        KAPtan <span aria-hidden>·</span> {sectionLabel(pathname)}
      </span>
      <span aria-hidden className="h-px min-w-6 flex-1 bg-line-strong" />
      {now === null ? null : (
        <time dateTime={new Date(now).toISOString()} className="whitespace-nowrap tabular-nums">
          {fmtDate(new Date(now).toISOString())}
        </time>
      )}
    </div>
  );
}

/**
 * A screen's heading block: the big title (where focus lands after a route change), one line
 * under it, actions on the right, and the accountant's double rule that closes the header.
 */
export function PageHeader({
  title,
  lead,
  actions,
  titleId,
  className,
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  titleId?: string;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 border-b-[3px] border-double border-ink/80 pb-5 sm:mb-8", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 id={titleId} tabIndex={-1} data-route-focus="" className="text-[30px] leading-[36px] font-bold tracking-[-0.025em] text-balance text-ink outline-none sm:text-[38px] sm:leading-[44px]">
            {title}
          </h1>
          {lead ? <div className="mt-2 text-body text-ink-soft">{lead}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
