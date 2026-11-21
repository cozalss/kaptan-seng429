"use client";

import { useApiQuery } from "@/lib/api/react";
import { fmtTime } from "@/lib/format";

/**
 * "Bu sabah": the morning brief in its own plain sentences, calm and short. When none was built yet
 * (the API answers 404 and the client turns it into null) or the request fails, nothing shows.
 */
export function MorningBrief() {
  const q = useApiQuery((api) => api.briefToday(), []);
  const brief = q.data;
  if (!brief || brief.summary_tr.trim() === "") return null;
  return (
    <section aria-labelledby="bu-sabah" className="home-band u-page !pb-0" data-testid="bu-sabah">
      <h2 id="bu-sabah" className="u-caption text-ink-soft">
        Bu sabah
      </h2>
      <p className="mt-1 max-w-[72ch] text-body text-ink">{brief.summary_tr}</p>
      <p className="mt-1 text-dense text-ink-soft">Sabah özeti, saat {fmtTime(brief.generated_at)}</p>
    </section>
  );
}
