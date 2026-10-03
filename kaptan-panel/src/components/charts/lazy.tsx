"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";

/**
 * Recharts is the heaviest client dependency (~100 kB gzip). The charts sit below the fold
 * on /portfolio and /eval, so they load as their own chunk after the screen is interactive;
 * until then a ruled placeholder of the same height holds the layout (no shift).
 */
function ChartLoading({ height }: { height: number }) {
  return (
    <div role="status" aria-label="Grafik yükleniyor" className="min-w-0">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </div>
  );
}

export const EquityChart = dynamic(() => import("./equity-chart").then((m) => m.EquityChart), {
  ssr: false,
  loading: () => <ChartLoading height={300} />,
});

export const DrawdownChart = dynamic(() => import("./drawdown-chart").then((m) => m.DrawdownChart), {
  ssr: false,
  loading: () => <ChartLoading height={310} />,
});

export const MetricTrendChart = dynamic(() => import("./metric-trend-chart").then((m) => m.MetricTrendChart), {
  ssr: false,
  loading: () => <ChartLoading height={240} />,
});
