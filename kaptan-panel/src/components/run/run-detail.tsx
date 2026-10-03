"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Explain, NodeName } from "@/lib/domain";
import { NODE_LABELS } from "@/lib/domain";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { can } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtDateTime } from "@/lib/format";
import { DEMO_E3_RUN, DEMO_INJ_RUN, DEMO_R04_RUN, type DemoScenario } from "@/mocks/ids";
import { Badge, EventBadge, FixtureBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageHeader, Skeleton, SkeletonLines } from "@/components/ui/primitives";
import { ClassificationSection } from "./classification-section";
import { ComplianceSection, RiskGateSection, RuleTraceSection, SkepticSection } from "./decision-sections";
import { DisclosureSection } from "./disclosure-section";
import { EvidenceSection } from "./evidence-section";
import { ApprovalSection, AuditSection, OpenInQueue, OrderSection, TicketSection } from "./execution-sections";
import { AgentTraceSection } from "./agent-trace";
import { MergeSection } from "./merge-section";
import { PreGateSection } from "./pregate-section";
import { JsonView, NotesSection, Toc, type TocItem } from "./run-extras";
import { STATUS_LABEL } from "./labels";
import { ToneBadge } from "./section";
import { nodeSettled } from "./trace-layout";
import { useRunExplain } from "./use-run-explain";
import { buildVerdict, keyFacts, type Stage } from "./verdict";
import { VerdictPanel } from "./verdict-panel";

/**
 * /runs/[id] — "Neden bu işlem?" (FRONTEND-SPEC §2.4, US-37, US-44, FR-31, 04 Q2/Q3).
 * The whole decision rebuilt from its records, verdict first, details on demand.
 */
const DEMO_SCENARIO_OF: Record<string, { scenario: DemoScenario; label: string; step: string; shows: readonly string[] }> = {
  [DEMO_E3_RUN]: {
    scenario: "e3_contract",
    label: "E3: Yeni iş ilişkisi",
    step: "Demo adımı 2",
    shows: [
      "Sınıflandırıcı konu alanı genel bir bildirimi E3 olarak tipler (güven 0,93).",
      "Okuyucu, Önemlilik ve Kanıt paralel çalışır; oranı (%18) Birleştirme düğümü hesaplar.",
      "Şüpheci pozisyonu yarıya indirir; öneri Risk Officer onayında bekler.",
    ],
  },
  [DEMO_INJ_RUN]: {
    scenario: "redteam_injection",
    label: "Red-team: gizli talimat",
    step: "Demo adımı 3",
    shows: [
      "Metne gizlenmiş “önceki talimatları yok say” kalıbı veri olarak işaretlenir.",
      "Prompt Guard 0,98 ve Uyum ajanı RET: kural motoruna hiç ulaşmaz.",
    ],
  },
  [DEMO_R04_RUN]: {
    scenario: "restricted_r04",
    label: "Tedbirli hisse",
    step: "Demo adımı 3",
    shows: ["Güçlü görünen bir yönetici alımı, tedbirli hissede ön elemede sert veto (R04) yer.", "LLM çağrısı 0: bildirim yapay zekaya hiç gitmez."],
  },
};

function pendingFor(e: Explain, node: NodeName): string | null {
  if (e.run.status !== "running") return null;
  return nodeSettled(e.trace.nodes, node) ? null : `${NODE_LABELS[node].tr} düğümü bekleniyor…`;
}

function markOf(stages: readonly Stage[], key: Stage["key"]): TocItem["mark"] {
  const s = stages.find((x) => x.key === key)?.state;
  if (s === "pass") return "ok";
  if (s === "veto") return "veto";
  if (s === "stop") return "stop";
  if (s === "wait" || s === "running") return "wait";
  return "none";
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Çalıştırma yükleniyor">
      <div className="border-[1.5px] border-ink bg-panel p-6">
        <SkeletonLines lines={4} />
        <Skeleton className="mt-6 h-10 w-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-[1.5px] border-hairline bg-panel p-5">
          <SkeletonLines lines={3} />
        </div>
      ))}
    </div>
  );
}

function NotFound({ runId, onStarted }: { runId: string; onStarted: () => void }) {
  const api = useApi();
  const { role } = useSession();
  const demo = DEMO_SCENARIO_OF[runId];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canInject = can(role, "demo_inject") && api.mode === "mock";
  if (!demo) {
    return (
      <EmptyState
        title="Çalıştırma bulunamadı"
        body={`“${runId}” kimlikli bir çalıştırma yok. Listeden seçin.`}
        action={
          <Button asChild variant="secondary">
            <Link href="/runs">Çalıştırmalara dön</Link>
          </Button>
        }
      />
    );
  }
  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.injectDemo(demo.scenario);
      // Same tab: the run's SSE stream is already subscribed, so the graph streams in live.
      onStarted();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="demo-bekliyor" className="border-[1.5px] border-ink bg-panel shadow-ink">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3">
        <FixtureBadge />
        <span className="text-meta text-muted">{demo.step} · senaryo “{demo.label}”</span>
      </div>
      <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h2 id="demo-bekliyor" className="font-display text-[26px] leading-tight text-ink">
            Bu demo çalıştırması henüz başlamadı
          </h2>
          <p className="mt-2 max-w-prose text-ui text-ink-soft">
            Demo bildirimleri canlı an için saklanır: senaryo enjekte edildiği anda bildirim akışa düşer ve bu sayfa ajan grafını canlı doldurur.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {canInject ? (
              <Button variant="primary" size="lg" disabled={busy} onClick={() => void start()}>
                {busy ? "Başlatılıyor…" : "Senaryoyu başlat"}
              </Button>
            ) : (
              <p className="border-l-[3px] border-wash bg-wash-tint px-3 py-2 text-dense text-ink">
                Senaryoyu Admin başlatır{api.mode === "mock" ? ": kenar çubuğundaki rol değiştiriciden D'ye geçin ya da ⌘K → Senaryo." : "."}
              </p>
            )}
            <Button asChild variant="secondary">
              <Link href="/runs">Çalıştırmalara dön</Link>
            </Button>
          </div>
          {err ? (
            <p role="alert" className="mt-3 text-dense text-north">
              {err}
            </p>
          ) : null}
        </div>
        <div className="border-t border-hairline pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <p className="text-meta text-muted">Başlayınca bu sayfada</p>
          <ol className="mt-2 space-y-2">
            {demo.shows.map((line, i) => (
              <li key={line} className="flex gap-3 text-ui text-ink">
                <span aria-hidden className="font-display text-[20px] leading-5 text-ink-soft">
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function RunDetail({ runId }: { runId: string }) {
  const s = useRunExplain(runId);
  const e = s.data;
  const verdict = useMemo(() => (e ? buildVerdict(e) : null), [e]);
  const facts = useMemo(() => (e && e.run.status !== "running" ? keyFacts(e) : []), [e]);
  const tickets = useApiQuery((api) => api.listTickets(), []);

  if (!e || !verdict) {
    const header = (
      <PageHeader
        kicker={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/runs" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
              Çalıştırmalar
            </Link>
            <span aria-hidden>/</span>
            <span className="code">{runId}</span>
          </span>
        }
        title="Neden bu işlem?"
      />
    );
    const body =
      s.loading ? (
        <DetailSkeleton />
      ) : s.error?.status === 404 ? (
        <NotFound runId={runId} onStarted={() => void s.refetch()} />
      ) : s.error?.status === 403 ? (
        <EmptyState title="Bu kayıt rolünüze kapalı" body="Çalıştırma ayrıntısını görme izniniz yok. Yetki için yöneticinize başvurun." />
      ) : (
        <ErrorState message={s.error?.message ?? "Çalıştırma yüklenemedi."} onRetry={() => void s.refetch()} />
      );
    return (
      <div className="space-y-6">
        {header}
        {body}
      </div>
    );
  }

  const run = e.run;
  const st = STATUS_LABEL[run.status];
  const ev = e.classifier?.event_type ?? run.event_type;
  const live = run.status === "running";
  const ticket = e.ticket ?? tickets.data?.find((t) => t.run_id === run.run_id) ?? null;
  const approved = e.approval?.status === "approved";

  const toc: TocItem[] = [
    { id: "bildirim", num: "1", label: "Bildirim", mark: "ok" },
    { id: "on-eleme", num: "2", label: "Ön eleme", mark: markOf(verdict.stages, "pregate") },
    { id: "siniflandirma", num: "3", label: "Sınıflandırma", mark: markOf(verdict.stages, "agents") },
    { id: "birlestirme", num: "4", label: "Birleştirme", mark: e.merged ? (e.merged.amount_in_text === false ? "stop" : "ok") : "none" },
    { id: "kanit", num: "5", label: "Kanıt", mark: e.evidence_card ? "ok" : "none" },
    { id: "supheci", num: "6", label: "Şüpheci", mark: e.skeptic ? (e.skeptic.veto ? "veto" : "ok") : "none" },
    { id: "kural", num: "7", label: "Kural izi", mark: markOf(verdict.stages, "rules") },
    { id: "uyum", num: "8", label: "Uyum", mark: e.compliance ? (e.compliance.decision === "veto" ? "veto" : e.compliance.decision === "escalate" ? "wait" : "ok") : "none" },
    { id: "risk", num: "9", label: "Risk kapısı", mark: markOf(verdict.stages, "risk") },
    { id: "onay", num: "10", label: "Onay", mark: markOf(verdict.stages, "approval") },
    { id: "emir", num: "11", label: "Emir · dolum", mark: markOf(verdict.stages, "fill") },
    ...(ticket ? [{ id: "emir-fisi", num: "12", label: "Emir fişi", mark: (approved ? "ok" : "wait") as TocItem["mark"] }] : []),
    { id: "audit", num: "13", label: "Audit", mark: e.audit_positions.length ? "ok" : "none" },
    { id: "iz", num: "14", label: "Ajan izi", mark: live ? "wait" : "ok" },
    { id: "notlar", num: "15", label: "Notlar", mark: "none" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/runs" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
              Çalıştırmalar
            </Link>
            <span aria-hidden>/</span>
            <span className="code">{run.run_id}</span>
            {run.is_fixture ? <FixtureBadge /> : null}
          </span>
        }
        title="Neden bu işlem?"
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="code font-medium text-ink">{run.ticker}</span>
            <span>{run.company_name}</span>
            {ev ? <EventBadge type={ev} compact /> : null}
            <ToneBadge tone={st.tone}>
              {live ? <span aria-hidden className="inline-block size-1.5 animate-pulse-dot bg-wash" /> : null}
              {st.tr}
            </ToneBadge>
            <span className="text-meta text-muted">
              {fmtDateTime(run.started_at)} · {run.mode} · {run.strategy_version}
            </span>
          </span>
        }
        actions={
          <>
            {e.approval?.status === "pending" ? <OpenInQueue size="md" proposalId={e.approval.proposal_id} /> : null}
            <JsonView e={e} />
          </>
        }
      />

      <VerdictPanel verdict={verdict} facts={facts} />

      <Toc items={toc} variant="strip" />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_208px]">
        <div className="min-w-0 space-y-5">
          <DisclosureSection e={e} />
          <PreGateSection e={e} pending={pendingFor(e, "guard")} />
          <ClassificationSection e={e} pending={pendingFor(e, "classifier")} />
          <MergeSection e={e} pending={pendingFor(e, "merge")} />
          <EvidenceSection e={e} pending={pendingFor(e, "evidence")} />
          <SkepticSection e={e} pending={pendingFor(e, "skeptic")} />
          <RuleTraceSection e={e} pending={pendingFor(e, "rule_engine")} />
          <ComplianceSection e={e} pending={pendingFor(e, "compliance")} />
          <RiskGateSection e={e} pending={pendingFor(e, "risk_gate")} />
          <ApprovalSection e={e} pending={pendingFor(e, "request_approval")} />
          <OrderSection e={e} />
          {ticket ? <TicketSection ticket={ticket} approved={approved} /> : null}
          <AuditSection e={e} />
          <AgentTraceSection trace={e.trace} live={live} stream={s.stream} log={s.log} />
          <NotesSection index={e.disclosure.disclosure_index} />
          <p className="text-meta text-muted">
            Bu sayfadaki her satır koşunun karar ve audit kayıtlarından yeniden kurulur. Şirketler kurgusaldır (Temsili); sayılar örnek değerdir; işlem önerisi yatırım tavsiyesi değildir.
            {run.is_fixture ? <Badge tone="muted" className="ml-2">fikstür</Badge> : null}
          </p>
        </div>
        <aside className="hidden xl:block">
          <Toc items={toc} variant="rail" />
        </aside>
      </div>
    </div>
  );
}
