"use client";

import type { EvalSummary } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useSession } from "@/lib/auth/session-context";
import { fmtDateTime, fmtPct, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorState, Numeral, PageHeader, Skeleton } from "@/components/ui/primitives";
import { canSeeCost, excessVsBist, fmtRatio, TARGETS } from "./eval-math";
import { ClassificationLayer, RagLayer } from "./layers-quality";
import { AblationTable, ForwardLayer, HoldoutLayer } from "./layers-returns";
import { OpsPanel, RedTeamPanel, ShadowPanel } from "./layers-ops";
import { Bullet } from "./parts";

const NAV = [
  { href: "#katman-1", label: "1 Sınıflandırma" },
  { href: "#katman-2", label: "2 RAG" },
  { href: "#katman-3", label: "3 Holdout" },
  { href: "#katman-4", label: "4 İleri dönük" },
  { href: "#ablation", label: "Ablation" },
  { href: "#red-team", label: "Red-team" },
  { href: "#maliyet", label: "Gecikme · maliyet" },
] as const;

/**
 * /eval — the four evaluation layers (FRONTEND-SPEC §2.9, 08 §8.1, demo step 5). Built for
 * GET /eval/summary: when `is_sample` is true every surface says so, permanently; when real
 * results arrive the same screen renders them without the sample chrome.
 */
export function EvalScreen() {
  const { role } = useSession();
  const q = useApiQuery((api) => api.evalSummary());
  const e = q.data;
  const sample = e?.is_sample ?? true;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="08 · dört katmanlı değerlendirme"
        title="Değerlendirme"
        meta={e ? <>Son güncelleme {fmtDateTime(e.as_of)} · başarı ölçütü dürüst, tekrarlanabilir ve bakış-ileri yanlılığından arınmış ölçümdür.</> : "Sınıflandırma, RAG, holdout ve ileri dönük test."}
      />
      <StickyStrip sample={sample} />
      {sample ? <SampleCharter /> : null}

      {q.error ? <ErrorState message={q.error} onRetry={q.refetch} /> : null}
      {q.loading ? <EvalSkeleton /> : null}
      {e ? (
        <>
          <Overview e={e} />
          <ClassificationLayer l1={e.l1} sample={sample} />
          <RagLayer l2={e.l2} sample={sample} />
          <HoldoutLayer l3={e.l3} />
          <ForwardLayer l4={e.l4} sample={sample} excess={excessVsBist(e)} />
          <AblationTable rows={e.ablations} />
          <RedTeamPanel rt={e.redteam} />
          <OpsPanel latency={e.latency} cost={e.cost} canSeeCost={canSeeCost(role)} />
          <ShadowPanel rows={e.shadow} />
        </>
      ) : null}
    </div>
  );
}

/** Sticky under the top bar: the sample label never scrolls away, plus a jump list. */
function StickyStrip({ sample }: { sample: boolean }) {
  return (
    <div
      className={cn(
        "sticky z-20 -mx-4 flex items-center gap-3 overflow-x-auto border-y-[1.5px] border-ink px-4 py-1.5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        "top-[calc(var(--chrome-top,0px)+var(--topbar-h)+32px)] lg:top-[calc(var(--chrome-top,0px)+var(--topbar-h))]",
        sample ? "bg-paper" : "bg-panel",
      )}
    >
      {sample ? (
        <span className="shrink-0 border-[1.5px] border-ink bg-ink px-2 text-meta leading-[22px] font-medium whitespace-nowrap text-on-dark" data-testid="sample-stamp">
          örnek değer · gerçek sonuç değil
        </span>
      ) : null}
      <nav aria-label="Değerlendirme bölümleri" className="flex shrink-0 gap-1">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} className="h-7 px-2 text-dense leading-7 whitespace-nowrap text-ink-soft hover:bg-wash-tint hover:text-ink">
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** The honesty charter: what these numbers are, when the real ones come, what to expect. */
function SampleCharter() {
  return (
    <section aria-labelledby="charter" className="grid border-[1.5px] border-ink bg-panel md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="paper-grain border-b-[1.5px] border-ink p-5 md:border-r-[1.5px] md:border-b-0">
        <p className="text-meta text-muted">Bu ekrandaki her sayı</p>
        <h2 id="charter" className="title-display mt-2 text-[34px] text-ink sm:text-[40px]">
          Örnek değer.
          <br />
          Gerçek sonuç değil.
        </h2>
        <p className="mt-3 max-w-prose text-ui text-ink-soft">
          Sayılar fikstürdür ve ekranın düzenini göstermek içindir. Gerçek holdout kurallar 8 Kasım 2026&apos;da dondurulduktan sonra <b className="font-medium text-ink">bir kez</b> koşar; sonuçlar{" "}
          <span className="code">GET /eval/summary</span> ile aynı yerlere düşer ve bu etiket kalkar.
        </p>
      </div>
      <div className="p-5">
        <p className="text-meta text-muted">Dürüst beklenti (01, 06, 08)</p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">BIST-100&apos;e göre yılda 0 ile <span className="font-sans text-[22px] font-medium">+%5</span> fazla getiri.</p>
        <ul className="mt-3 space-y-1.5 text-dense text-ink-soft">
          <li>Maliyet sonrası kalıcı pozitif anormal getiri olasılığı kabaca %20–35.</li>
          <li>
            <b className="font-medium text-ink">Sıfır veya negatif sonuç geçerli bir bulgudur;</b> araştırma sorusu (kurallı LLM vs serbest LLM) her durumda cevaplanır.
          </li>
          <li>Ana kanıt Katman 3 holdout&apos;tur; ileri dönük paper test destekleyicidir.</li>
        </ul>
      </div>
    </section>
  );
}

/** One row of four: each layer's headline against its target, with no verdict. */
function Overview({ e }: { e: EvalSummary }) {
  const all = e.l3.rows.find((r) => r.event_type === "ALL" && r.cost_scenario === "base_005");
  const excess = excessVsBist(e);
  const tiles = [
    {
      n: "1",
      href: "#katman-1",
      title: "Macro-F1 · kilitli test",
      value: fmtRatio(e.l1.macro_f1),
      foot: <Bullet value={e.l1.macro_f1} max={1} target={TARGETS.macroF1} label="Macro-F1" valueText={fmtRatio(e.l1.macro_f1)} targetText={fmtRatio(TARGETS.macroF1)} />,
    },
    {
      n: "2",
      href: "#katman-2",
      title: "RAGAS faithfulness",
      value: fmtRatio(e.l2.faithfulness),
      foot: <Bullet value={e.l2.faithfulness} max={1} target={TARGETS.faithfulness} label="Faithfulness" valueText={fmtRatio(e.l2.faithfulness)} targetText={fmtRatio(TARGETS.faithfulness)} />,
    },
    {
      n: "3",
      href: "#katman-3",
      title: "Holdout CAR[20] · tümü",
      value: all ? fmtSignedPct(all.car_20, 1) : "—",
      foot: <p className="text-meta text-muted">{all ? `n = ${all.n} · t = ${fmtRatio(all.t_stat, 1)} · %0,05 maliyet` : "henüz koşulmadı"}</p>,
    },
    {
      n: "4",
      href: "#katman-4",
      title: "v1.1 − BIST-100 · ortak dönem",
      value: excess === null ? "—" : fmtSignedPct(excess, 1),
      foot: <p className="text-meta text-muted">{e.l4.closed_trades} kapanmış işlem · destekleyici kanıt</p>,
    },
  ];
  return (
    <section aria-label="Katmanlar bir bakışta" className="grid border-[1.5px] border-ink bg-panel sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t, i) => (
        <a
          key={t.n}
          href={t.href}
          className={cn(
            "group block p-4 hover:bg-wash-tint focus-visible:outline-offset-[-2px]",
            i > 0 && "border-t border-hairline sm:border-t-0",
            i % 2 === 1 && "sm:border-l sm:border-hairline",
            i >= 2 && "sm:border-t xl:border-t-0",
            i === 2 && "xl:border-l xl:border-hairline",
          )}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[22px] leading-none text-muted">{t.n}</span>
            <span className="text-dense text-ink-soft group-hover:text-ink">{t.title}</span>
          </div>
          <p className="mt-2 font-display text-[44px] leading-none tracking-[-0.02em] text-ink">
            <Numeral text={t.value} />
          </p>
          <div className="mt-3">{t.foot}</div>
        </a>
      ))}
      <p className="border-t border-hairline px-4 py-2 text-meta text-muted sm:col-span-2 xl:col-span-4">
        Hedefler kanonik (08): macro-F1 ≥ 0,85 · faithfulness ≥ 0,85 · zaman ihlali 0 · kötü niyetliden emir 0 · engelleme ≥ {fmtPct(TARGETS.blockRate, 0)} · p95 &lt; 60 sn. Çentik hedefi gösterir; bir örnek değerin hedefi geçmesi hiçbir şey kanıtlamaz.
      </p>
    </section>
  );
}

function EvalSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Değerlendirme yükleniyor">
      <Skeleton className="h-[150px]" />
      <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-2">
        <Skeleton className="h-[360px]" />
        <Skeleton className="h-[360px]" />
      </div>
    </div>
  );
}
