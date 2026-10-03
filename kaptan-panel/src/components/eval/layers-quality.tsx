"use client";

import type { ClassificationEval, EvalClass, RagEval } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtInt } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Stat } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { MetricTrendChart } from "@/components/charts/lazy";
import { fmtRatio, heatCell, rowShares, TARGETS } from "./eval-math";
import { Bullet, LayerHead, MetricRow } from "./parts";

const CLASSES: readonly EvalClass[] = ["E1", "E2", "E3", "E4", "X", "O"];
const CLASS_TR: Readonly<Record<EvalClass, string>> = {
  E1: "Pay geri alım",
  E2: "Yönetici / ana ortak alımı",
  E3: "Yeni iş ilişkisi",
  E4: "Finansal sonuç",
  X: "Filtre / kaçınma",
  O: "Diğer",
};

type PerClass = ClassificationEval["per_class"][number];

/** Layer 1 — classification on the locked 200-item gold test (08 §1). */
export function ClassificationLayer({ l1, sample }: { l1: ClassificationEval; sample: boolean }) {
  const cols: Column<PerClass>[] = [
    {
      key: "c",
      header: "Sınıf",
      cell: (r) => (
        <span className="whitespace-nowrap">
          <span className="code font-medium text-ink">{r.cls}</span> <span className="text-ink-soft">{CLASS_TR[r.cls]}</span>
        </span>
      ),
    },
    { key: "p", header: "Precision", align: "right", cell: (r) => fmtRatio(r.precision), sortValue: (r) => r.precision },
    { key: "r", header: "Recall", align: "right", cell: (r) => fmtRatio(r.recall), sortValue: (r) => r.recall },
    {
      key: "f",
      header: "F1",
      sortValue: (r) => r.f1,
      cell: (r) => (
        <span className="flex min-w-[140px] items-center gap-2">
          <span className="w-9 text-right font-medium tabular-nums">{fmtRatio(r.f1)}</span>
          <Bullet value={r.f1} max={1} target={TARGETS.macroF1} label={`${r.cls} F1`} valueText={fmtRatio(r.f1)} targetText={fmtRatio(TARGETS.macroF1)} className="flex-1 [&>p]:hidden" />
        </span>
      ),
    },
    { key: "n", header: "n", align: "right", cell: (r) => fmtInt(r.support), sortValue: (r) => r.support },
  ];
  type ModelRow = ClassificationEval["models"][number];
  const modelCols: Column<ModelRow>[] = [
    { key: "m", header: "Model", cell: (r) => <span className="whitespace-nowrap">{r.model_id}</span> },
    { key: "f", header: "Macro-F1", align: "right", cell: (r) => fmtRatio(r.macro_f1), sortValue: (r) => r.macro_f1 },
    { key: "e3", header: "E3 F1", align: "right", cell: (r) => fmtRatio(r.e3_f1), sortValue: (r) => r.e3_f1 },
    { key: "x", header: "X recall", align: "right", cell: (r) => fmtRatio(r.x_recall), sortValue: (r) => r.x_recall },
  ];
  return (
    <section aria-labelledby="l1" id="katman-1" className="scroll-mt-40 space-y-4">
      <LayerHead id="l1" n="1" title="Sınıflandırma" question="LLM bildirimi doğru olay sınıfına koyuyor mu?" source="08 §1 · kilitli 200 bildirim" />
      <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Sınıf bazında P / R / F1" meta="Mavi çentik: macro-F1 hedefi 0,85 (tek tek sınıflar için referans)" />
          <div className="grid gap-x-8 gap-y-4 border-b border-hairline px-4 py-4 sm:grid-cols-3">
            <div>
              <Stat size="sm" label="Macro-F1" value={fmtRatio(l1.macro_f1)} />
              <Bullet value={l1.macro_f1} max={1} target={TARGETS.macroF1} label="Macro-F1" valueText={fmtRatio(l1.macro_f1)} targetText={fmtRatio(TARGETS.macroF1)} className="mt-2" />
            </div>
            <div>
              <Stat size="sm" label="Cohen κ (etiketleyiciler)" value={fmtRatio(l1.kappa)} />
              <Bullet value={l1.kappa} max={1} target={TARGETS.kappa} label="Cohen kappa" valueText={fmtRatio(l1.kappa)} targetText={fmtRatio(TARGETS.kappa)} className="mt-2" />
            </div>
            <div>
              <Stat size="sm" label="Kalibrasyon (ECE)" value={fmtRatio(l1.ece)} />
              <Bullet value={l1.ece} max={0.3} target={TARGETS.ece} label="ECE" valueText={fmtRatio(l1.ece)} targetText={fmtRatio(TARGETS.ece)} lowerIsBetter className="mt-2" />
            </div>
          </div>
          <DataTable caption="Sınıf bazında precision, recall, F1" columns={cols} rows={l1.per_class} getRowId={(r) => r.cls} />
        </Panel>
        <Panel>
          <PanelHeader title="Karışıklık matrisi" meta="Satır = altın etiket, sütun = tahmin · hücre rengi satır payı, sayı adet" />
          <ConfusionMatrix m={l1.confusion} sample={sample} />
        </Panel>
      </div>
      <Panel>
        <PanelHeader title="Model × E-kodu" meta="Karar kuralı: GA'sı en iyiyle örtüşen modeller arasında en ucuz ve en hızlı olan (08 §1.6)" />
        <DataTable caption="Model karşılaştırması" columns={modelCols} rows={l1.models} getRowId={(r) => r.model_id} />
      </Panel>
    </section>
  );
}

function ConfusionMatrix({ m, sample }: { m: readonly (readonly number[])[]; sample: boolean }) {
  const shares = rowShares(m);
  return (
    <div className="overflow-x-auto p-4">
      <table className="mx-auto border-collapse text-dense">
        <caption className="sr-only">Karışıklık matrisi: satırlar altın etiket, sütunlar tahmin{sample ? " (örnek değer)" : ""}</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 pb-2 text-left text-meta font-normal text-muted">
              altın ↓ · tahmin →
            </th>
            {CLASSES.map((c) => (
              <th key={c} scope="col" className="code w-12 pb-2 text-center font-medium text-ink">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CLASSES.map((gold, i) => (
            <tr key={gold}>
              <th scope="row" className="code pr-3 text-right font-medium text-ink">
                {gold}
              </th>
              {CLASSES.map((pred, j) => {
                const v = m[i]?.[j] ?? 0;
                const share = shares[i]?.[j] ?? 0;
                const cell = heatCell(share);
                return (
                  <td
                    key={pred}
                    title={`${gold} → ${pred}: ${v} (${Math.round(share * 100)}%)`}
                    className={cn("h-11 w-12 border-2 border-panel text-center tabular-nums", cell.dark ? "text-on-dark" : v === 0 ? "text-muted" : "text-ink", i === j && "font-semibold")}
                    style={{ background: cell.background }}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-center text-meta text-muted">Köşegen doğru sınıflama · X (kaçınma) yüksek recall ister: kaçırılan tedbirli hisse en pahalı hatadır.</p>
    </div>
  );
}

/** Layer 2 — retrieval and RAG faithfulness (08 §2). */
export function RagLayer({ l2, sample }: { l2: RagEval; sample: boolean }) {
  const rows = l2.trend.map((t) => ({ d: t.d, faithfulness: t.faithfulness, context_precision: t.context_precision, context_recall: t.context_recall }));
  return (
    <section aria-labelledby="l2" id="katman-2" className="scroll-mt-40 space-y-4">
      <LayerHead id="l2" n="2" title="RAG ve geri getirme" question="Doğru, zamanı geçmemiş ve sadık bağlam geliyor mu?" source={`08 §2 · ${l2.questions} soruluk altın set`} />
      <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel className="p-4">
          <MetricTrendChart
            title="RAGAS trendi"
            meta="Hakem üreticiden farklı model · her koşuda 10 hakem kararı elle kontrol"
            rows={rows}
            sample={sample}
            format={(v) => fmtRatio(v)}
            domain={[0.6, 1]}
            series={[
              { key: "faithfulness", label: "Faithfulness", color: "var(--ink)" },
              { key: "context_precision", label: "Context precision", color: "#3d6aa6" },
              { key: "context_recall", label: "Context recall", color: "#8c8a84", dash: "1.5 3.5" },
            ]}
            targets={[
              { y: TARGETS.faithfulness, label: "hedef 0,85 (faithfulness)" },
              { y: TARGETS.contextPrecision, label: "hedef 0,70 (precision)" },
            ]}
          />
        </Panel>
        <Panel>
          <PanelHeader title="Son koşu" meta="Deterministik geri getirme metrikleri kararları belirler" />
          <dl className="px-4 py-2">
            <MetricRow k="Faithfulness" v={fmtRatio(l2.faithfulness)} hint="hedef ≥ 0,85" />
            <MetricRow k="Context precision" v={fmtRatio(l2.context_precision)} hint="hedef ≥ 0,70" />
            <MetricRow k="Context recall" v={fmtRatio(l2.context_recall)} hint="hedef 0,75 / 0,85" />
            <MetricRow k="Recall@10" v={fmtRatio(l2.recall_at_10)} />
            <MetricRow k="MRR" v={fmtRatio(l2.mrr)} />
            <MetricRow k={<>Zaman ihlali <span className="text-muted">(published_at ≥ karar anı)</span></>} v={fmtInt(l2.time_violations)} hint="sert kapı: 0" />
          </dl>
          <div className="border-t border-hairline px-4 py-3">
            <p className="text-meta text-muted">Vektör deposu karşılaştırması</p>
            <dl className="mt-1">
              {l2.stores.map((s) => (
                <MetricRow key={s.store} k={<span className="code">{s.store}</span>} v={`${fmtRatio(s.faithfulness)} · ${fmtRatio(s.recall_at_10)}`} hint="faithfulness · R@10" />
              ))}
            </dl>
          </div>
        </Panel>
      </div>
    </section>
  );
}
