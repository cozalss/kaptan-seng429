"use client";

import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Boat } from "@/components/ufuk/boat";
import type { DisclosureFate } from "./disclosure-logic";
import { funnelPolygon, funnelStages, type FunnelCounts } from "./reading-words";

export type FunnelFilter = "all" | DisclosureFate | "useful";

/**
 * The day's reading as a hill of paper sliding into the sea: its height at each stage is how many
 * duyuru were still in play, drawn to scale, so the day's whole pile narrows to a thread and the
 * boat waits at its end with what might matter. The labels under the water are also the filter.
 */
export function Funnel({ counts, filter, onFilter }: { counts: FunnelCounts; filter: FunnelFilter; onFilter: (f: FunnelFilter) => void }) {
  const stages = funnelStages(counts);
  const steps: ReadonlyArray<{ key: FunnelFilter; count: number; label: string; note: string }> = [
    { key: "all", count: counts.total, label: "Hepsi", note: "Günün bütün duyuruları" },
    { key: "noise", count: counts.noise, label: "Otomatik mesaj", note: "Borsanın kendi mesajları. Geçtim." },
    { key: "archived", count: counts.archived, label: "Para kararı gerektirmeyen", note: "Toplantı, takvim, rapor. Dosyaladım." },
    { key: "processed", count: counts.processed, label: "Yakından baktım", note: "Kurallarla ve geçmişle karşılaştırdım." },
    { key: "useful", count: counts.useful, label: "İşine yarayabilir", note: "Karar senin." },
  ];
  return (
    <section aria-labelledby="gunun-okumasi" className="ok-funnel">
      <h2 id="gunun-okumasi" className="sr-only">
        Günün okuması
      </h2>
      <ol aria-label="Okumanın aşamaları" className="ok-stages">
        {stages.map((s) => (
          <li key={s.key} className="ok-stage">
            <span className="ok-stage-n">{fmtInt(s.value)}</span>
            <span className="ok-stage-label">{s.label}</span>
          </li>
        ))}
      </ol>
      <div aria-hidden className="ok-hill-wrap">
        <div className="ok-hill u-hatch" style={{ clipPath: funnelPolygon(stages.map((s) => s.value)) }} />
        <Boat className="ok-boat" />
      </div>
      <div aria-hidden className="pf-water" />
      <div role="group" aria-label="Hangilerini göstereyim?" className="ok-filters">
        {steps.map((s) => (
          <button key={s.key} type="button" aria-pressed={filter === s.key} onClick={() => onFilter(s.key)} className={cn("ok-filter", filter === s.key && "ok-filter-on")}>
            <span className="ok-filter-top">
              <span className="ok-filter-count">{fmtInt(s.count)}</span> {s.label}
            </span>
            <span className="ok-filter-note">{s.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
