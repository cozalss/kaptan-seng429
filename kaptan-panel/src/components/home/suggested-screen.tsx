"use client";

import "./home.css";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { useSuggested } from "./home-suggested";
import { SuggestedEmpty, SuggestedList } from "./suggested-list";
import { emptyReason, filterRows, isSuggestedFilter, SUGGESTED_FILTERS, type SuggestedFilter } from "./suggested-words";

/**
 * /oneriler: every disclosure that became a suggestion, newest first, filtered by what happened to it. The
 * filter lives in the link (?durum=gectin), so Back and a kept link both work. A detail page of Ana sayfa.
 */
export function SuggestedScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params?.get("durum") ?? null;
  const filter: SuggestedFilter = isSuggestedFilter(asked) ? asked : "hepsi";
  const setFilter = (next: SuggestedFilter) => router.replace(next === "hepsi" ? pathname : `${pathname}?durum=${next}`, { scroll: false });
  const q = useSuggested();
  const quiet = useApiQuery((api) => api.quietDay(), []);
  const all = q.data ?? [];
  const rows = filterRows(all, filter);
  const label = SUGGESTED_FILTERS.find((f) => f.key === filter)?.label ?? "Hepsi";
  return (
    <div className="hm u-page hm-sg-screen">
      <PageHeader
        name="Öneriye düşenler"
        title={q.data ? (all.length ? `${fmtInt(all.length)} duyuru öneriye dönüştü.` : "Henüz öneri yok.") : "Öneriler"}
        lead="Her satır bir öneri: duyuru, KAPtan’ın ne dediği, senin ne yaptığın ve o günden beri nasıl gittiği. Satıra basınca önerinin sayfası açılır."
      />
      {q.error && !q.data ? (
        <ScreenState kind="error" title="Önerileri şu an açamadım." onRetry={q.refetch}>
          {q.error}
        </ScreenState>
      ) : null}
      {q.data && all.length > 0 ? (
        <div className="hm-sg-filters" role="group" aria-label="Duruma göre süz">
          {SUGGESTED_FILTERS.map((f) => {
            const n = filterRows(all, f.key).length;
            return (
              <button key={f.key} type="button" className="hm-sg-filter" aria-pressed={f.key === filter} onClick={() => setFilter(f.key)}>
                {f.label} <span className="hm-sg-count">{fmtInt(n)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {!q.data ? null : all.length === 0 ? (
        <SuggestedEmpty reason={emptyReason(quiet.data ?? null)} />
      ) : rows.length === 0 ? (
        <p className="hm-quiet">Bu durumda öneri yok.</p>
      ) : (
        <SuggestedList rows={rows} label={`Öneriler: ${label}`} />
      )}
    </div>
  );
}
