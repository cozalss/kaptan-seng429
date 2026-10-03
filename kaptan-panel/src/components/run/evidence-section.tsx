"use client";

import { useState } from "react";
import type { EvidenceEvent, Explain } from "@/lib/domain";
import { STRENGTH_LABEL } from "@/lib/domain";
import { fmtDate, fmtPct, fmtSignedPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/table";
import { LlmNote, Numeral, SampleNote } from "@/components/ui/primitives";
import { EvidenceChart } from "./evidence-chart";
import { pctOf } from "./evidence-stats";
import { NotRun, Section } from "./section";

/**
 * §5 Kanıt kartı (05 EvidenceCard, US-11, FR-15). The Kanıt agent picks similar past events
 * without seeing their returns; code computes the statistics from event_returns. Every number
 * here is a fixture → "örnek değer · gerçek sonuç değil".
 */
const signed = (v: number | null) => (v === null ? "—" : fmtSignedPct(v, 1));

const EVENT_COLS: Column<EvidenceEvent>[] = [
  { key: "date", header: "Tarih", cell: (r) => fmtDate(r.published_at), sortValue: (r) => r.published_at },
  { key: "ticker", header: "Hisse", cell: (r) => <span className="code">{r.ticker}</span>, sortValue: (r) => r.ticker },
  { key: "ref", header: "Kayıt", cell: (r) => <span className="code text-muted">{r.ref_id}</span>, className: "hidden md:table-cell", headerClassName: "hidden md:table-cell" },
  { key: "c1", header: "1 g", cell: (r) => signed(r.car_1d), sortValue: (r) => r.car_1d, align: "right" },
  { key: "c5", header: "5 g", cell: (r) => signed(r.car_5d), sortValue: (r) => r.car_5d, align: "right" },
  { key: "c20", header: "20 g", cell: (r) => signed(r.car_20d), sortValue: (r) => r.car_20d, align: "right" },
  { key: "c60", header: "60 g", cell: (r) => signed(r.car_60d), sortValue: (r) => r.car_60d ?? -9, align: "right" },
];

function CiBar({ lo, hi }: { lo: number; hi: number }) {
  const domain: [number, number] = [Math.min(lo, 0) - 0.01, Math.max(hi, 0) + 0.01];
  return (
    <div className="relative mt-2 h-4" aria-hidden>
      <span className="absolute top-1/2 h-[1.5px] w-full bg-hairline" />
      <span className="absolute top-0 bottom-0 border-l border-dashed border-ink-soft" style={{ left: `${pctOf(0, domain)}%` }} />
      <span className="absolute top-1 bottom-1 border-x-2 border-ink bg-wash-tint-strong" style={{ left: `${pctOf(lo, domain)}%`, width: `${pctOf(hi, domain) - pctOf(lo, domain)}%` }} />
    </div>
  );
}

export function EvidenceSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const card = e.evidence_card;
  const [showTable, setShowTable] = useState(false);
  if (!card) {
    return (
      <Section id="kanit" num="5" title="Kanıt kartı" meta="Benzer geçmiş olaylar ve kodla hesaplanan anormal getiri" pending={pending}>
        <NotRun>{e.run.outcome === "PREGATE_VETO" || e.run.outcome === "QUARANTINED" ? "Kanıt düğümü çalışmadı." : "Bu koşu için kanıt kartı yok (karar kanıt aşamasından önce verildi)."}</NotRun>
      </Section>
    );
  }
  const s = card.stats;
  const sel = card.selection;
  const strong = card.strength === "strong" || card.strength === "moderate";
  return (
    <Section
      id="kanit"
      num="5"
      title="Kanıt kartı"
      meta={`${card.card_id} · ${sel.candidates_considered} aday tarandı · ${sel.selected.length} seçildi · getiriler seçim sırasında görülmedi`}
      pending={pending}
      stamp={
        <>
          <Badge tone={strong ? "ink" : "muted"}>Güç: {STRENGTH_LABEL[card.strength]}</Badge>
          <SampleNote />
        </>
      }
    >
      <div className="space-y-6">
        <p className="max-w-[70ch] text-ui text-ink">
          Benzer <strong className="font-medium">{s.n} olay</strong> · ortalama 5 günlük anormal getiri <strong className="font-medium">{fmtSignedPct(s.mean_car_5d, 1)}</strong> · isabet{" "}
          <strong className="font-medium">{fmtPct(s.hit_rate_5d, 0)}</strong> · <span className="whitespace-nowrap">20 günde %95 GA [{fmtSignedPct(s.ci95_car_20d[0], 1)}; {fmtSignedPct(s.ci95_car_20d[1], 1)}]</span>
        </p>
        <dl className="grid grid-cols-2 border-[1.5px] border-ink md:grid-cols-4">
          {[
            { k: "Benzer olay (n)", v: String(s.n), hint: `${s.n_same_ticker} aynı hisse · n ≥ 15 güçlü` },
            { k: "Ort. CAR 5 gün", v: fmtSignedPct(s.mean_car_5d, 1), hint: `medyan ${fmtSignedPct(s.median_car_5d, 1)}` },
            { k: "İsabet 5 gün", v: fmtPct(s.hit_rate_5d, 0), hint: `20 gün ${fmtPct(s.hit_rate_20d, 0)}` },
            { k: "Ort. CAR 20 gün", v: fmtSignedPct(s.mean_car_20d, 1), hint: `IQR ${fmtPct(s.dispersion_iqr_20d, 1)}` },
          ].map((x, i) => (
            <div key={x.k} className={`min-w-0 px-4 py-3 ${i % 2 === 1 ? "border-l border-hairline" : ""} ${i >= 2 ? "border-t border-hairline md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
              <dt className="text-meta text-muted">{x.k}</dt>
              <dd className="mt-1 font-display text-[30px] leading-none tracking-[-0.02em] tabular-nums text-ink">
                <Numeral text={x.v} />
              </dd>
              <dd className="mt-1 text-meta text-muted">{x.hint}</dd>
              {i === 3 ? <CiBar lo={s.ci95_car_20d[0]} hi={s.ci95_car_20d[1]} /> : null}
            </div>
          ))}
        </dl>

        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-dense font-medium text-ink">Anormal getiri dağılımı · 1 / 5 / 20 / 60 gün</h3>
            <span className="text-meta text-muted">
              gösterilen {e.evidence_events.length} / {s.n} olay · piyasaya göre düzeltilmiş (CAR) · kod hesabı
            </span>
          </div>
          <EvidenceChart events={e.evidence_events} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-dense font-medium text-ink">Seçim</h3>
            <ul className="space-y-1 text-dense text-ink-soft">
              <li>Sorgular: {sel.search_queries.map((q) => `“${q}”`).join(", ")}</li>
              <li>
                Getirilen kayıt {card.retrieved_ids.length} · seçilen {sel.selected.length} (R05: seçilenler getirilenlerin alt kümesi ✓)
              </li>
              {sel.exclusion_reasons.map((x) => (
                <li key={x}>— {x}</li>
              ))}
              <li>Daha önce duyurulmuş: {sel.already_announced_before ? "evet" : "hayır"}</li>
            </ul>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-dense font-medium text-ink">Kanıt ajanının özeti</h3>
              <LlmNote />
            </div>
            <p className="text-dense text-ink-soft">{sel.summary_tr}</p>
          </div>
        </div>

        <div>
          <button
            type="button"
            aria-expanded={showTable}
            aria-controls="kanit-tablo"
            onClick={() => setShowTable((v) => !v)}
            className="text-dense font-medium text-ink underline underline-offset-4 hover:text-wash"
          >
            {showTable ? "Olay tablosunu gizle" : `Olay tablosunu göster (${e.evidence_events.length} satır)`}
          </button>
          {showTable ? (
            <div id="kanit-tablo" className="mt-3 border-[1.5px] border-ink">
              <DataTable caption="Kanıt kartındaki benzer geçmiş olaylar ve anormal getirileri" columns={EVENT_COLS} rows={e.evidence_events} getRowId={(r) => r.ref_id} initialSort={{ key: "date", dir: "desc" }} />
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
