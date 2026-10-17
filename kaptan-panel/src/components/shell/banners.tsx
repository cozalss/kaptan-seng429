"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { fmtPct } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useDesk } from "./desk-state";

/**
 * One quiet line under the top bar when the desk is not running normally: north red when you
 * (or the −5% rule) stopped everything, ochre for the daily −1% pause. The live region is
 * always mounted (a region that appears with its text is often not read out); it is an alert
 * only for Durdur. The band opens its own height once, never slides.
 */
export function RiskBanner() {
  const { risk } = useDesk();
  const stopped = risk?.kill_switch === "on";
  const paused = !stopped && Boolean(risk?.halted_today);
  return (
    <div role={stopped ? "alert" : "status"} data-testid="risk-banner">
      {stopped ? (
        <Band className="bg-north text-on-dark">
          <span className="font-medium">Durduruldu.</span>
          <span className="opacity-90">Yeni öneri gelmez; elindekiler kendi kurallarıyla kapanır.</span>
          <Link
            href={ROUTES.portfoy}
            className="ml-auto inline-flex min-h-6 items-center underline underline-offset-4 focus-visible:outline-[var(--on-dark)]"
          >
            Portföy
          </Link>
        </Band>
      ) : null}
      {paused && risk ? (
        <Band className="bg-ochre text-ink">
          <span>
            <span className="font-medium">Bugün yeni emir yok.</span> Gün içi zarar {fmtPct(risk.daily_pnl_pct, 1)}; sınır −%1. Yarın kendiliğinden
            kalkar.
          </span>
        </Band>
      ) : null}
    </div>
  );
}

function Band({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={cn("grid animate-[banner-open_280ms_var(--ease-out-expo)_both]", className)}>
      <div className="min-h-0 overflow-hidden">
        <p className="mx-auto flex max-w-[752px] flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-ui sm:px-6">{children}</p>
      </div>
    </div>
  );
}
