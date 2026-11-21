"use client";

import { useApiQuery } from "@/lib/api/react";
import { cn } from "@/lib/utils";

/**
 * "Aynı sürede BIST 100 %3,2 arttı." under the money: your result over the stored days beside the
 * market's, in one sentence. BIST 100 is the 100 biggest companies on the exchange, said once on hover.
 * Nothing at all while the API has no honest comparison (too few days, no index price): no guess,
 * and a failed request simply leaves the line out.
 */
export function BenchmarkLine({ className }: { className?: string }) {
  const q = useApiQuery((api) => api.benchmark(), []);
  const b = q.data;
  if (!b || !b.available || !b.sentence_tr) return null;
  return (
    <p className={cn("text-ui text-ink-soft", className)} data-testid="benchmark-line" title="BIST 100: Borsa İstanbul'daki en büyük 100 şirketin ortalama hareketi.">
      {b.sentence_tr}
    </p>
  );
}
