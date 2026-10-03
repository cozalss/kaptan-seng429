"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IS_MOCK } from "@/lib/api/config";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtInt, fmtShortDate } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ErrorState, PageHeader, SampleNote, Skeleton } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { useDesk } from "@/components/shell/desk-state";
import { DrawdownChart, EquityChart } from "@/components/charts/lazy";
import { cumulativeReturns, drawdownRows, FWD_STRATEGIES, withLivePoint } from "@/components/charts/series";
import { OrderTicketsView } from "./order-ticket";
import { OrdersView } from "./orders";
import { PositionsView } from "./positions";
import { RiskLog } from "./risk-log";
import { RiskPanel } from "./risk-panel";
import { istanbulDate, riskLimits } from "./risk-math";
import { parseTab, type PortfolioTab } from "./tabs";


const V11_START = "2026-11-23";

/** /portfolio — FRONTEND-SPEC §2.5–2.6, 08 §8.1 panels 2–4, demo steps 4 and 6. */
export function PortfolioScreen({ initialTab }: { initialTab: PortfolioTab }) {
  const router = useRouter();
  const { risk: liveRisk } = useDesk();
  const [tab, setTab] = useState<PortfolioTab>(initialTab);
  // A link to ?sekme=… while the screen is mounted (⌘K, demo step 6) moves the tab too.
  const [linkedTab, setLinkedTab] = useState<PortfolioTab>(initialTab);
  if (linkedTab !== initialTab) {
    setLinkedTab(initialTab);
    setTab(initialTab);
  }
  const tabsRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<"all" | "common">("all");
  const now = useNow(30_000);
  const today = now === null ? null : istanbulDate(now);

  // Kill switch / halt / reset changes positions (managed by exit rule) and cancels orders.
  const riskKey = liveRisk ? `${liveRisk.kill_switch}|${liveRisk.halted_today}|${liveRisk.reset_request?.id ?? ""}` : "";
  const q = useApiQuery((api) => Promise.all([api.positions(), api.listOrders(), api.pnl(), api.limits(), api.riskStatus()]), [riskKey]);
  // The desk stream is the live source; the screen's own read covers a shell that failed to load it.
  const risk = liveRisk ?? q.data?.[4] ?? null;
  const tickets = useApiQuery((api) => api.listTickets());
  useEventStream("desk", { fill: () => void q.refetch(), order: () => void q.refetch() });

  const limits = useMemo(() => riskLimits(q.data?.[3].values), [q.data]);
  const pnl = q.data?.[2];

  const returnRows = useMemo(() => {
    if (!pnl) return [];
    const base = cumulativeReturns(pnl, FWD_STRATEGIES, range === "common" ? V11_START : undefined);
    return risk && today ? withLivePoint(base, "kaptan:v1.1-fwd", today, risk.daily_pnl_pct) : base;
  }, [pnl, range, risk, today]);
  const ddRows = useMemo(
    () => (pnl ? drawdownRows(pnl, "kaptan:v1.1-fwd", risk && today ? { today, drawdown: risk.drawdown_pct, daily: risk.daily_pnl_pct } : undefined) : []),
    [pnl, risk, today],
  );

  const onTab = (v: string) => {
    const next = parseTab(v);
    setTab(next);
    router.replace(next === "pozisyonlar" ? "/portfolio" : `/portfolio?sekme=${next}`, { scroll: false });
  };

  // Deep links to a tab (/portfolio?sekme=fis — demo step 6) land on the tab, not on the risk panel.
  const ready = Boolean(risk && q.data);
  useEffect(() => {
    if (!ready || initialTab === "pozisyonlar") return;
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [ready, initialTab]);

  const positions = q.data?.[0] ?? [];
  const orders = q.data?.[1] ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Paper · SimBIST sanal para · yalnızca alım"
        title="Portföy"
        meta={
          q.data && risk ? (
            <>
              {fmtInt(positions.length)} açık pozisyon · {fmtInt(orders.length)} emir · v1.1-fwd 23 Kas&apos;tan, v1.0-fwd 9 Kas&apos;tan beri ileri dönük test.
            </>
          ) : (
            "Açık pozisyonlar, P&L, düşüş ve kill switch."
          )
        }
        actions={IS_MOCK ? <SampleNote /> : null}
      />

      {q.error ? <ErrorState message={q.error} onRetry={q.refetch} /> : null}

      {!risk || q.loading ? (
        <PortfolioSkeleton />
      ) : (
        <>
          <RiskPanel risk={risk} positions={positions} limits={limits} sample={IS_MOCK} />

          <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Panel className="p-4">
              <EquityChart
                rows={returnRows}
                strategies={FWD_STRATEGIES}
                title="Kümülatif getiri: KAPtan vs karşılaştırmalar"
                meta={range === "common" ? "Ortak dönem: hepsi 23 Kas'ta sıfırlandı" : "Her seri kendi başlangıç sermayesine göre (1.000.000 TL sanal)"}
                sample={IS_MOCK}
                markers={range === "all" ? [{ d: V11_START, label: "v1.1 başlar" }] : []}
                caption={`Son kapanış ${pnl?.length ? fmtShortDate(pnl[pnl.length - 1]?.d ?? "") : "—"}. Kısa dönem, az kapanmış işlem: destekleyici kanıttır, ana kanıt holdout testidir (Değerlendirme).`}
                actions={<RangeToggle value={range} onChange={setRange} />}
              />
            </Panel>
            <Panel className="p-4">
              <DrawdownChart rows={ddRows} killAt={limits.killDrawdown} haltAt={limits.dailyHalt} killed={risk.kill_switch === "on"} sample={IS_MOCK} />
            </Panel>
          </div>

          <div ref={tabsRef} className="scroll-mt-[calc(var(--ribbon-h)+var(--topbar-h)+16px)]">
            <Panel aria-label="Pozisyonlar, emirler ve emir fişleri">
              <Tabs value={tab} onValueChange={onTab}>
                <TabsList className="px-3">
                  <TabsTrigger value="pozisyonlar">
                    Açık pozisyonlar <span className="ml-1 text-muted tabular-nums">{positions.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="emirler">
                    Emirler ve dolumlar <span className="ml-1 text-muted tabular-nums">{orders.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="fis">Emir fişleri (kişisel mod)</TabsTrigger>
                </TabsList>
                <TabsContent value="pozisyonlar" className="outline-none">
                  {today ? <PositionsView positions={positions} today={today} /> : null}
                </TabsContent>
                <TabsContent value="emirler" className="outline-none">
                  <OrdersView orders={orders} killOn={risk.kill_switch === "on"} />
                </TabsContent>
                <TabsContent value="fis" className="bg-paper p-4 outline-none sm:p-6">
                  {tickets.error ? (
                    <ErrorState message={tickets.error} onRetry={tickets.refetch} />
                  ) : tickets.loading ? (
                    <Skeleton className="mx-auto h-[520px] max-w-[760px]" />
                  ) : (
                    <OrderTicketsView tickets={tickets.data ?? []} />
                  )}
                </TabsContent>
              </Tabs>
            </Panel>
          </div>

          <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Panel>
              <PanelHeader title="Risk olayları" meta="Audit zincirinden: durdurma, kill switch, sıfırlama" code="§7" />
              <RiskLog refreshKey={`${riskKey}|${risk.drawdown_pct}`} />
            </Panel>
            <RulesCard />
          </div>
        </>
      )}
    </div>
  );
}

function RangeToggle({ value, onChange }: { value: "all" | "common"; onChange: (v: "all" | "common") => void }) {
  const opts = [
    { v: "all", label: "Tümü" },
    { v: "common", label: "Ortak dönem" },
  ] as const;
  return (
    <div role="group" aria-label="Dönem" className="inline-flex border border-rule-soft">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn("h-8 px-2.5 text-dense", value === o.v ? "bg-ink text-on-dark" : "bg-panel text-ink-soft hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RulesCard() {
  const rows = [
    { code: "R02", title: "Günlük −%1", body: "Yeni emir durur. Kimse elle kaldıramaz; ertesi seans otomatik kalkar. Açık pozisyonlara dokunulmaz." },
    { code: "R01", title: "Zirveden −%5", body: "Kill switch otomatik açılır: yeni emir yok, açık emirler iptal. Pozisyonlar satılmaz, çıkış kuralıyla yönetilir." },
    { code: "4 göz", title: "Sıfırlama", body: "Admin başlatır (1/2), başlatandan farklı bir Risk Officer onaylar (2/2). İkisi de audit zincirine yazılır." },
  ];
  return (
    <Panel tone="paper">
      <PanelHeader title="Bu ekranda geçerli kurallar" meta="06 §9–§11 · 09 §5" />
      <dl className="divide-y divide-hairline">
        {rows.map((r) => (
          <div key={r.code} className="grid grid-cols-[64px_1fr] gap-x-3 px-4 py-3">
            <dt className="code pt-0.5 text-muted">{r.code}</dt>
            <dd>
              <p className="text-dense font-medium text-ink">{r.title}</p>
              <p className="mt-0.5 text-dense text-ink-soft">{r.body}</p>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Portföy yükleniyor">
      <Skeleton className="h-[300px] border-[1.5px] border-hairline" />
      <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[1.45fr_1fr]">
        <Skeleton className="h-[360px]" />
        <Skeleton className="h-[360px]" />
      </div>
      <Skeleton className="h-[320px]" />
    </div>
  );
}
