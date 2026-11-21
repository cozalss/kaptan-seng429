"use client";

import { useApiQuery } from "@/lib/api/react";
import { fmtInt, fmtTime } from "@/lib/format";
import { keepFigures } from "@/components/story/num";

/**
 * Since the brief was built (08:45) the person may have answered some proposals: the brief stays a morning picture,
 * and this line says what is left now. Null while nothing has changed. Pure.
 */
export function sinceMorningSentence(morning: number, now: number): string | null {
  if (morning <= 0 || now >= morning) return null;
  const answered = morning - now;
  return `Sabahtan bu yana ${fmtInt(answered)} öneriye cevap verdin; ${now > 0 ? `${fmtInt(now)} öneri hâlâ bekliyor.` : "bekleyen öneri kalmadı."}`;
}

/**
 * "Bu sabah": the morning brief in its own plain sentences, calm and short. When none was built yet
 * (the API answers 404 and the client turns it into null) or the request fails, nothing shows.
 */
export function MorningBrief({ proposalsNow }: { proposalsNow?: number }) {
  const q = useApiQuery((api) => api.briefToday(), []);
  const brief = q.data;
  if (!brief || brief.summary_tr.trim() === "") return null;
  const since = proposalsNow === undefined ? null : sinceMorningSentence(brief.pending_approvals.length, proposalsNow);
  return (
    <section aria-labelledby="bu-sabah" className="home-band u-page !pt-10 !pb-0 sm:!pt-14" data-testid="bu-sabah">
      <h2 id="bu-sabah" className="u-caption text-ink-soft">
        Bu sabah
      </h2>
      <p className="mt-2 max-w-[60ch] text-lead text-ink text-pretty">{keepFigures(brief.summary_tr)}</p>
      {since ? <p className="mt-2 max-w-[60ch] text-ink text-pretty">{since}</p> : null}
      <p className="mt-2 text-dense text-ink-soft">Sabah özeti, saat {fmtTime(brief.generated_at)}</p>
    </section>
  );
}
