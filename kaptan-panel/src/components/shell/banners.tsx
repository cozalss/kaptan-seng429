"use client";

import Link from "next/link";
import { fmtPct } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { useDesk } from "./desk-state";

/**
 * One quiet line under the top bar when the desk is not running normally: north red when you
 * (or the −5% rule) stopped everything, ochre for the daily −1% pause. Announced politely.
 */
export function RiskBanner() {
  const { risk } = useDesk();
  if (!risk) return null;
  if (risk.kill_switch === "on") {
    return (
      <div role="status" aria-live="polite" className="bg-north text-on-dark">
        <p className="mx-auto flex max-w-[752px] flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-[14px] sm:px-6">
          <span className="font-medium">Durduruldu.</span>
          <span className="opacity-90">Yeni öneri gelmez; elindekiler kendi kurallarıyla kapanır.</span>
          <Link href={ROUTES.portfoy} className="ml-auto underline underline-offset-4">
            Portföy
          </Link>
        </p>
      </div>
    );
  }
  if (risk.halted_today) {
    return (
      <div role="status" aria-live="polite" className="bg-ochre text-ink">
        <p className="mx-auto max-w-[752px] px-4 py-2 text-[14px] sm:px-6">
          <span className="font-medium">Bugün yeni emir yok.</span> Gün içi zarar {fmtPct(risk.daily_pnl_pct, 1)}; sınır −%1. Yarın kendiliğinden kalkar.
        </p>
      </div>
    );
  }
  return null;
}
