"use client";

import "./banners.css";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmtPct } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useDesk } from "./desk-state";
import { systemLine, type SystemLine } from "./system-words";

/** Where the banner's "more" leads: the Sistem block in Ayarlar. */
export const SYSTEM_HREF = `${ROUTES.ayarlar}#sistem`;

/**
 * One quiet line under the top bar when things are not running normally, the most important
 * first and never two at once: north red when you (or the −5% rule) stopped everything, ochre for
 * the daily −1% pause, and an inked logbook line when KAPtan itself is not working as it should.
 * Screens that show the stop themselves pass `showStopped={false}`. The live region is always
 * mounted (a region that appears with its text is often not read out); it is an alert only for
 * Durdur, polite for everything else. The band opens its own height once, never slides.
 */
export function ShellBanner({ showStopped = true }: { showStopped?: boolean }) {
  const { risk, system, systemDown } = useDesk();
  const stopped = risk?.kill_switch === "on";
  const paused = !stopped && Boolean(risk?.halted_today);
  // While stopped or paused nothing new would come anyway: the system line waits its turn.
  const line = stopped || paused ? null : systemLine(system, systemDown);
  return (
    <div role={stopped ? "alert" : "status"} data-testid="shell-banner">
      {stopped && showStopped ? (
        <Band className="bg-north text-on-dark">
          <span className="font-medium">Durduruldu.</span>
          <span className="opacity-90">Yeni öneri gelmez; elindekiler kendi kurallarıyla kapanır.</span>
          <Link
            href={ROUTES.portfoy}
            className="ml-auto inline-flex min-h-6 items-center underline underline-offset-4 focus-visible:outline-[var(--on-dark)]"
          >
            Param
          </Link>
        </Band>
      ) : null}
      {paused && risk ? (
        <Band className="bg-ochre text-ink">
          <span>
            <span className="font-medium">Bugün yeni işlem yok.</span> Paran bugün {fmtPct(risk.daily_pnl_pct, 1)} değişti; sınır −%1. Yarın kendiliğinden
            kalkar.
          </span>
        </Band>
      ) : null}
      {line ? <SystemBand line={line} /> : null}
    </div>
  );
}

function Band({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={cn("mb-4 grid animate-[banner-open_280ms_var(--ease-out-expo)_both] rounded-xl", className)}>
      <div className="min-h-0 overflow-hidden">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-ui sm:px-5">{children}</p>
      </div>
    </div>
  );
}

/**
 * KAPtan's own state, as a line in the ship's log: no fill, an ink rule above, a hairline below
 * and a strip of engraved fog at its head. What is wrong, what you can do, and the way to the rest.
 */
function SystemBand({ line }: { line: SystemLine }) {
  const onSettings = usePathname() === ROUTES.ayarlar;
  return (
    <div className="sb-log" data-testid="system-line">
      <span aria-hidden className="sb-log-fog u-hatch" />
      <p className="sb-log-text">
        <span className="sb-log-what">{line.message}</span> {line.advice}
      </p>
      {onSettings ? null : (
        <Link href={SYSTEM_HREF} className="sb-log-more">
          Ayrıntı
          <span className="sr-only">: KAPtan’ın durumu, Ayarlar’da</span>
          <span aria-hidden> →</span>
        </Link>
      )}
    </div>
  );
}
