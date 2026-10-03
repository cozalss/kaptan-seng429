"use client";

import type { AblationRow, EvalSummary, HoldoutRow } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtDate, fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Stat } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { EquityChart } from "@/components/charts/lazy";
import { cumulativeReturns, FWD_STRATEGIES } from "@/components/charts/series";
import { fmtRatio, isPrimary } from "./eval-math";
import { LayerHead } from "./parts";

const COST_LABEL: Readonly<Record<HoldoutRow["cost_scenario"], string>> = {
  base_005: "%0,05 / taraf",
  stress_020: "%0,20 / taraf (stres)",
};

function CarCell({ row, k }: { row: HoldoutRow; k: "car_1" | "car_5" | "car_20" | "car_60" }) {
  const v = row[k];
  if (v === null) return <span className="text-muted">—</span>;
  const primary = isPrimary(row, k);
  return (
    <span className={cn("tabular-nums", primary && "border-b-2 border-ink font-medium")} title={primary ? "Ön kayıtlı birincil test" : undefined}>
      {fmtSignedPct(v, 1)}
      {primary ? <span className="sr-only"> (ön kayıtlı birincil test)</span> : null}
    </span>
  );
}

/** Layer 3 — event study / holdout backtest: the main evidence, run once (08 §3–4, 06 §12). */
export function HoldoutLayer({ l3 }: { l3: EvalSummary["l3"] }) {
  const cols: Column<HoldoutRow>[] = [
    {
      key: "e",
      header: "Olay",
      cell: (r) => (
        <span className="whitespace-nowrap">
          <span className="code font-medium">{r.event_type === "ALL" ? "Tümü" : r.event_type}</span>
          {r.cost_scenario === "stress_020" ? <Badge tone="outline" className="ml-2">stres</Badge> : null}
        </span>
      ),
    },
    { key: "n", header: "n", align: "right", cell: (r) => fmtInt(r.n) },
    { key: "c1", header: "CAR[1]", align: "right", cell: (r) => <CarCell row={r} k="car_1" /> },
    { key: "c5", header: "CAR[5]", align: "right", cell: (r) => <CarCell row={r} k="car_5" /> },
    { key: "c20", header: "CAR[20]", align: "right", cell: (r) => <CarCell row={r} k="car_20" /> },
    { key: "c60", header: "CAR[60]", align: "right", cell: (r) => <CarCell row={r} k="car_60" /> },
    { key: "t", header: "t", align: "right", cell: (r) => <span className={cn(Math.abs(r.t_stat) >= 2 ? "font-medium text-ink" : "text-ink-soft")}>{fmtRatio(r.t_stat, 1)}</span> },
    { key: "sh", header: "Sharpe", align: "right", cell: (r) => fmtRatio(r.sharpe, 1) },
    { key: "so", header: "Sortino", align: "right", cell: (r) => fmtRatio(r.sortino, 1) },
    { key: "dd", header: "MaxDD", align: "right", cell: (r) => fmtPct(r.max_dd, 1) },
    { key: "cost", header: "Maliyet", cell: (r) => <span className="whitespace-nowrap text-ink-soft">{COST_LABEL[r.cost_scenario]}</span> },
  ];
  return (
    <section aria-labelledby="l3" id="katman-3" className="scroll-mt-40 space-y-4">
      <LayerHead
        id="l3"
        n="3"
        title="Holdout olay çalışması"
        question="Kurallı sinyaller maliyet sonrası anormal getiri üretiyor mu?"
        source={`08 §3–4 · ${l3.window}`}
        aside={
          <span className="inline-flex h-7 items-center border-[1.5px] border-ink bg-ink px-2 text-dense font-medium text-on-dark">
            Ana kanıt · tek koşu
          </span>
        }
      />
      <Panel>
        <PanelHeader
          title="Olay tipi × pencere"
          meta="CAR[+1,+k], uygulanabilir giriş (ilk açılış) · altı çizili = ön kayıtlı birincil test (E1, E2 → CAR[20]; E3, E4 → CAR[5]); |t| ≥ 2 koyu"
        />
        <DataTable caption="Holdout olay çalışması sonuçları" columns={cols} rows={l3.rows} getRowId={(r) => `${r.event_type}-${r.cost_scenario}`} />
        <p className="border-t border-hairline px-4 py-3 text-meta text-muted">
          Kurallar 8 Kasım 2026&apos;da donduruldu (rules-v1.0-prereg); holdout yalnızca bir kez koşulur, sonuca bakıp kural değiştirilmez. Yalnızca dört ön kayıtlı test &quot;doğrulayıcı&quot; sayılır, gerisi keşif amaçlıdır (Holm düzeltmesi).
        </p>
      </Panel>
    </section>
  );
}

/** Layer 4 — forward paper v1.0-fwd / v1.1-fwd against B0 and B1 (08 §4, supporting evidence). */
export function ForwardLayer({ l4, sample, excess }: { l4: EvalSummary["l4"]; sample: boolean; excess: number | null }) {
  const rows = cumulativeReturns(l4.series, FWD_STRATEGIES);
  return (
    <section aria-labelledby="l4" id="katman-4" className="scroll-mt-40 space-y-4">
      <LayerHead id="l4" n="4" title="İleri dönük paper test" question="Canlı akışta, sanal parayla, kurallar değişmeden ne oluyor?" source="08 §4 · SimBIST" />
      <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Panel className="p-4">
          <EquityChart
            rows={rows}
            strategies={FWD_STRATEGIES}
            title="v1.0-fwd ve v1.1-fwd vs BIST-100 ve eşit ağırlık"
            meta="Kümülatif getiri, her seri kendi başlangıcından · 1.000.000 TL sanal sermaye"
            sample={sample}
            markers={[{ d: l4.since.v1_1, label: "v1.1 başlar" }]}
          />
        </Panel>
        <Panel tone="paper">
          <div className="space-y-5 p-4">
            <Stat label="v1.1 − BIST-100 (ortak dönem)" value={excess === null ? "—" : fmtSignedPct(excess, 1)} hint={`${fmtDate(`${l4.since.v1_1}T09:00:00Z`)} → son kapanış`} />
            <Stat size="sm" label="Kapanmış işlem" value={fmtInt(l4.closed_trades)} hint="20–60 günlük tutmalarla az kapanır" />
            <p className="border-t border-hairline pt-3 text-dense text-ink-soft">
              8–10 haftalık paper test istatistiksel olarak zayıftır; <b className="font-medium text-ink">destekleyici kanıttır</b>. Ana kanıt Katman 3&apos;teki holdout testidir.
            </p>
            <p className="text-meta text-muted">
              v1.0-fwd {fmtDate(`${l4.since.v1_0}T09:00:00Z`)} · sınıflandırıcı + kurallar. v1.1-fwd {fmtDate(`${l4.since.v1_1}T09:00:00Z`)} · tüm ajanlar. v1.0 aynı zamanda A0 ablation&apos;ıdır.
            </p>
          </div>
        </Panel>
      </div>
    </section>
  );
}

/** Ablations B0–B3, A0–A7 (08 §5): the research claim is rule-bound LLM vs free LLM (B3). */
export function AblationTable({ rows }: { rows: readonly AblationRow[] }) {
  const max = Math.max(0.01, ...rows.map((r) => Math.abs(r.total_return)));
  const cols: Column<AblationRow>[] = [
    { key: "a", header: "Kol", cell: (r) => <span className="code font-medium">{r.arm}</span>, sortValue: (r) => r.arm },
    {
      key: "l",
      header: "Tanım",
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {r.label_tr}
          {r.arm === "B3" ? <Badge tone="wash">araştırma iddiası</Badge> : null}
        </span>
      ),
    },
    {
      key: "r",
      header: "Toplam getiri",
      sortValue: (r) => r.total_return,
      cell: (r) => <DivergingBar value={r.total_return} max={max} />,
    },
    { key: "s", header: "Sharpe", align: "right", cell: (r) => fmtRatio(r.sharpe, 1), sortValue: (r) => r.sharpe },
    { key: "d", header: "MaxDD", align: "right", cell: (r) => fmtPct(r.max_dd, 1), sortValue: (r) => r.max_dd },
    { key: "n", header: "İşlem", align: "right", cell: (r) => fmtInt(r.n_trades), sortValue: (r) => r.n_trades },
  ];
  return (
    <section aria-labelledby="abl" id="ablation" className="scroll-mt-40 space-y-4">
      <LayerHead id="abl" n="§5" title="Ablation ve baseline'lar" question="Hangi parça değer katıyor? Kurallı LLM, serbest LLM'den (B3) iyi mi?" source="08 §5" />
      <Panel>
        <DataTable caption="Ablation tablosu" columns={cols} rows={rows} getRowId={(r) => r.arm} />
        <p className="border-t border-hairline px-4 py-3 text-meta text-muted">Çubuk: toplam getiri, sıfır ekseninden. Sıfır veya negatif sonuç da geçerli bir bulgudur.</p>
      </Panel>
    </section>
  );
}

/** Horizontal bar from a zero axis (gains right, losses left), value printed beside it. */
export function DivergingBar({ value, max }: { value: number; max: number }) {
  const w = Math.min(50, (Math.abs(value) / max) * 50);
  return (
    <span className="flex min-w-[180px] items-center gap-2">
      <span aria-hidden className="relative h-3 flex-1">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink" />
        <span className={cn("absolute inset-y-0", value < 0 ? "bg-ink-soft" : "bg-ink")} style={value < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }} />
      </span>
      <span className="w-14 text-right tabular-nums">{fmtSignedPct(value, 1)}</span>
    </span>
  );
}
