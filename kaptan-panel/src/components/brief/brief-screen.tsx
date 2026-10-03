"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import type { MorningBrief, RiskStatus } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { IS_MOCK } from "@/lib/api/config";
import { useNow } from "@/lib/clock";
import { fmtDateLong, fmtPct, fmtSignedPct, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DISCLAIMER_TR } from "@/components/brand/disclaimer";
import { Button } from "@/components/ui/button";
import { ErrorState, LlmNote, Skeleton } from "@/components/ui/primitives";
import { useDesk } from "@/components/shell/desk-state";
import { istanbulDate } from "@/components/portfolio/risk-math";
import { briefIndex, recentSessions } from "./brief-math";
import { BriefSection, Disclosures, OpenOrders, PendingApprovals, Positions, Restrictions, Warnings } from "./brief-sections";

/**
 * Print: only the sheet. The shell is hidden by visibility (its markup is not ours to edit),
 * the sheet is lifted to the page origin, and A4 margins are set. One page at normal volume.
 */
/** /brief — the 08:45 morning brief (FRONTEND-SPEC §2.10, §9 Ç-3), a one-page printed sheet. */
export function BriefScreen({ date }: { date: string | null }) {
  const router = useRouter();
  const now = useNow(60_000);
  const { risk } = useDesk();
  const today = now === null ? null : istanbulDate(now);
  const day = date ?? today;
  const q = useApiQuery((api) => (day ? api.brief(day) : new Promise<MorningBrief>(() => undefined)), [day]);
  const pickId = useId();
  const sessions = today ? recentSessions(today) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label htmlFor={pickId} className="text-dense text-ink-soft">
          Seans
        </label>
        <select
          id={pickId}
          value={day ?? ""}
          onChange={(e) => router.replace(e.target.value === today ? "/brief" : `/brief?tarih=${e.target.value}`, { scroll: false })}
          className="h-9 border-[1.5px] border-ink bg-panel px-2 text-ui text-ink"
        >
          {sessions.map((d) => (
            <option key={d} value={d}>
              {fmtDateLong(`${d}T09:00:00Z`)}
              {d === today ? " (bugün)" : ""}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="md" className="ml-auto" onClick={() => window.print()} disabled={!q.data}>
          Yazdır
        </Button>
      </div>

      {q.error ? <ErrorState message={q.error} onRetry={q.refetch} /> : null}
      {q.loading || !q.data ? (
        q.error ? null : <Skeleton className="mx-auto h-[900px] max-w-[980px]" />
      ) : (
        <BriefSheet b={q.data} risk={risk} isToday={q.data.date === today} />
      )}
    </div>
  );
}

function BriefSheet({ b, risk, isToday }: { b: MorningBrief; risk: RiskStatus | null; isToday: boolean }) {
  const index = briefIndex(b);
  return (
    <article id="ozet-sayfa" aria-labelledby="ozet-baslik" className="mx-auto max-w-[980px] border-[1.5px] border-ink bg-panel px-5 py-6 shadow-ink-lg sm:px-10 sm:py-8">
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink pb-1.5 text-meta text-ink-soft">
          <span>KAPtan · masa bülteni · dahili, paylaşmayın</span>
          <span>{IS_MOCK || b.is_sample ? "DEMO VERİSİ · şirketler kurgusal (Temsili)" : "canlı veri"}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-[3px] border-double border-ink py-4">
          <h1 id="ozet-baslik" className="title-display text-[44px] text-ink sm:text-[64px]">
            Sabah özeti
          </h1>
          <div className="text-right">
            <p className="font-display text-[22px] leading-tight text-ink">{fmtDateLong(`${b.date}T09:00:00Z`)}</p>
            <p className="text-dense text-ink-soft">
              {fmtTime(b.generated_at)} itibarıyla · dünkü seans kapanışından bu yana
            </p>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 border-b border-hairline py-2 text-dense text-ink-soft">
          {index.map((i) => (
            <li key={i.label}>
              <b className="font-semibold tabular-nums text-ink">{i.n}</b> {i.label}
            </li>
          ))}
        </ul>
        {risk && isToday ? <LiveDeskLine risk={risk} /> : null}
      </header>

      <section aria-label="Özet" className="border-b border-hairline py-5">
        <p className="font-display text-[22px] leading-[1.3] text-ink sm:text-[26px]">{b.summary_tr}</p>
        <LlmNote className="mt-2" />
      </section>

      <div className="grid gap-x-10 gap-y-7 pt-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] print:grid-cols-[1.35fr_1fr]">
        <div className="space-y-7">
          <BriefSection n="1" title="Dünden bu yana önemli bildirimler" count={b.important_disclosures.length} empty="Önemli bildirim yok.">
            <Disclosures items={b.important_disclosures} />
          </BriefSection>
          <BriefSection n="2" title="Açılışta girilecek onaylı emirler" count={b.orders_for_open.length} empty="Açılışa onaylı emir yok. Onaylanan öneriler açılış emir toplamada (09:40) girer.">
            <OpenOrders items={b.orders_for_open} />
          </BriefSection>
          <BriefSection n="3" title="Onay bekleyenler" count={b.pending_approvals.length} empty="Bekleyen onay yok.">
            <PendingApprovals items={b.pending_approvals} />
            <p className="pt-2 text-meta text-muted">Yanıtlanmayan öneri bir sonraki seansın 09:50&apos;sinde düşer (R15).</p>
          </BriefSection>
        </div>
        <div className="space-y-7">
          <BriefSection n="4" title="Açık pozisyonlar · bugün çıkış" count={b.open_positions.length} empty="Açık pozisyon yok.">
            <Positions open={b.open_positions} expiring={b.expiring_today} />
          </BriefSection>
          <BriefSection n="5" title="Risk uyarıları" count={b.risk_warnings.length} empty="Uyarı yok.">
            <Warnings items={b.risk_warnings} />
          </BriefSection>
          <BriefSection n="6" title="Tedbir değişiklikleri" count={b.restriction_changes.length} empty="Tedbir değişikliği yok.">
            <Restrictions items={b.restriction_changes} />
          </BriefSection>
        </div>
      </div>

      <footer className="mt-8 border-t-[1.5px] border-ink pt-3 text-meta leading-[17px] text-muted">
        <p>{DISCLAIMER_TR}</p>
        <p className="mt-1">Sayılar örnek değerdir, gerçek sonuç değildir · sanal para (SimBIST paper) · fiş ve sinyal paylaşılmaz.</p>
      </footer>
    </article>
  );
}

/** What changed since 08:45: the desk's live state (kill switch, halt), clearly marked as live. */
function LiveDeskLine({ risk }: { risk: RiskStatus }) {
  const tone = risk.kill_switch === "on" ? "kill" : risk.halted_today ? "halt" : "normal";
  return (
    <p
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-[1.5px] px-3 py-2 text-dense",
        tone === "kill" ? "border-north bg-north text-on-dark" : tone === "halt" ? "border-ink bg-ochre text-ink" : "border-hairline bg-paper text-ink-soft",
      )}
    >
      <span className="font-semibold">Şu an (canlı, {fmtTime(risk.as_of)}):</span>
      <span>{tone === "kill" ? "KILL SWITCH AÇIK — yeni emir yok" : tone === "halt" ? "YENİ EMİR DURDU (günlük −%1)" : "Kill switch kapalı"}</span>
      <span className={tone === "normal" ? "text-muted" : ""}>
        günlük K/Z {fmtSignedPct(risk.daily_pnl_pct, 2)} · zirveden {fmtPct(risk.drawdown_pct, 2)}
      </span>
    </p>
  );
}
