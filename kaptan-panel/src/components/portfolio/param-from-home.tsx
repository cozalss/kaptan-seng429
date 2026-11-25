"use client";

import { useMemo } from "react";
import type { Position } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { istanbulDay } from "@/lib/session-day";
import { recentActivity } from "@/lib/solo/activity";
import { homeSeries } from "@/lib/solo/flows";
import { useHolds } from "@/lib/solo/holds";
import type { Overview } from "@/lib/solo/overview";
import type { MoneyMovement } from "@/lib/solo/money";
import { Activity } from "@/components/solo/activity";
import { AllocationPanel } from "@/components/solo/allocation";
import { MoneyHero } from "@/components/solo/money-hero";
import { WatchStrip } from "@/components/watchlist/watch-strip";

/** The money's whole line on its sea (moved here from the home): full bleed under Param's figures. */
export function ParamHorizon({ overview, movements, todayPct, positions }: { overview: Overview; movements: readonly MoneyMovement[] | null; todayPct: number | null; positions: readonly Position[] }) {
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDay(now);
  const o = useMemo(() => ({ ...overview, equity_series: homeSeries(overview.equity_series, movements, today, overview.equity_now, overview.capital_start) }), [overview, movements, today]);
  return (
    <div className="u-bleed pm-horizon">
      <MoneyHero overview={o} todayPct={todayPct} positions={positions} name={null} bare />
    </div>
  );
}

/** "Param nerede?", "Son işlemler" and "İzlediklerim": they used to stack on the home; they belong to Param. */
export function ParamFromHome({ overview, positions }: { overview: Overview; positions: readonly Position[] }) {
  const approvals = useApiQuery((api) => api.listApprovals("all"), []);
  const { holds } = useHolds();
  const activity = useMemo(() => recentActivity(approvals.data ?? [], positions, holds), [approvals.data, positions, holds]);
  return (
    <>
      <div className="pm-from-home">
        <AllocationPanel allocations={overview.allocations} cash={overview.cash} total={overview.equity_now} />
      </div>
      <div className="pm-from-home">
        <Activity items={activity} />
      </div>
      <div className="pm-from-home">
        <WatchStrip />
      </div>
    </>
  );
}
