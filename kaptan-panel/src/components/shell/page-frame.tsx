"use client";

import "@/components/ufuk/ufuk.css";
import "./page-frame.css";

import type { ReactNode } from "react";
import { Boat } from "@/components/ufuk/boat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A screen's opening: the screen's name, then its one big sentence (data-driven, where focus lands
 * after a route change). The name is part of the heading, so a screen reader hears "Param. Paran
 * 8 yerde duruyor."
 */
export function PageHeader({
  name,
  title,
  lead,
  actions,
  className,
}: {
  name: string;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("pf-header", className)}>
      <h1 tabIndex={-1} data-route-focus="" className="outline-none">
        <span className="pf-name">
          {name}
          <span className="sr-only">. </span>
        </span>
        <span className="u-sentence block text-ink">{title}</span>
      </h1>
      {lead || actions ? (
        <div className="pf-under">
          {lead ? <div className="pf-lead">{lead}</div> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/**
 * A full-bleed band. The paint reaches the window's edges (a border image, so it never adds
 * sideways scroll) while the content stays on the page's column.
 */
export function Band({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("pf-band", className)} {...props}>
      {children}
    </section>
  );
}

/**
 * Loading, empty and error, as a place in the same world: the small boat on its water, one sentence
 * that says what is going on, one line that says what to do next.
 */
export function ScreenState({
  kind,
  title,
  children,
  action,
  onRetry,
  className,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role={kind === "error" ? "alert" : kind === "loading" ? "status" : undefined} data-kind={kind} className={cn("pf-state", className)}>
      <div aria-hidden className="pf-state-boat">
        <Boat className="pf-state-mark size-14" />
      </div>
      <div className="pf-state-body">
        <p className="u-chapter text-ink">{title}</p>
        {children ? <div className="mt-2 max-w-[58ch] text-body text-ink-soft">{children}</div> : null}
        {onRetry || action ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {onRetry ? (
              <Button variant="secondary" onClick={onRetry}>
                Yeniden dene
              </Button>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
