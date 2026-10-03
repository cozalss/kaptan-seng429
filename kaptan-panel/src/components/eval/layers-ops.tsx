"use client";

import type { EvalSummary } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtDec, fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { EmptyState, Stat } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { codeShares, TARGETS } from "./eval-math";
import { Bullet, LayerHead } from "./parts";

const CODE_TEXT: Readonly<Record<"Q" | "N" | "H" | "F", { label: string; fill: string }>> = {
  Q: { label: "Karantina (graf çalışmadı)", fill: "bg-ink-soft" },
  N: { label: "Nötr (ikiziyle aynı çıktı)", fill: "bg-wash" },
  H: { label: "HOLD / ret (risk kapısı, uyum)", fill: "bg-[#8c8a84]" },
  F: { label: "İşaretlendi (bayrak + audit)", fill: "bg-[repeating-linear-gradient(45deg,var(--ink)_0_2px,transparent_2px_5px)]" },
};

/** Red-team (08 §7): orders from malicious cases must be 0 — a hard gate, not a score. */
export function RedTeamPanel({ rt }: { rt: EvalSummary["redteam"] }) {
  const shares = codeShares(rt.by_code);
  return (
    <section aria-labelledby="rt" id="red-team" className="scroll-mt-40 space-y-4">
      <LayerHead id="rt" n="§7" title="Red-team" question="Kötü niyetli bildirim bir emir üretebiliyor mu?" source={`08 §7 · ${rt.malicious} kötü niyetli + ${rt.benign} zararsız ikiz`} />
      <Panel>
        <div className="grid gap-x-8 gap-y-6 p-4 md:grid-cols-3">
          <div>
            <Stat label="Kötü niyetliden çıkan emir" value={String(rt.orders_from_malicious)} hint="sert kapı: 0 — tek bir emir CI'ı düşürür" />
          </div>
          <div>
            <Stat label="Engelleme oranı" value={fmtPct(rt.block_rate, 1)} />
            <Bullet value={rt.block_rate} max={1} target={TARGETS.blockRate} label="Engelleme oranı" valueText={fmtPct(rt.block_rate, 1)} targetText={fmtPct(TARGETS.blockRate, 0)} className="mt-2" />
          </div>
          <div>
            <Stat label="Zararsızda yanlış alarm" value={fmtPct(rt.false_alarm_rate, 1)} />
            <Bullet value={rt.false_alarm_rate} max={0.2} target={TARGETS.falseAlarmInfo} label="Yanlış alarm" valueText={fmtPct(rt.false_alarm_rate, 1)} targetText={`${fmtPct(TARGETS.falseAlarmInfo, 0)} (bilgi amaçlı)`} lowerIsBetter className="mt-2" />
          </div>
        </div>
        <div className="border-t border-hairline px-4 py-4">
          <p className="text-dense font-medium text-ink">Kötü niyetli vakaların davranışı</p>
          <div className="mt-2 flex h-3 gap-[2px]" role="img" aria-label={shares.map((s) => `${s.code} ${CODE_TEXT[s.code].label}: ${s.n}`).join(", ")}>
            {shares
              .filter((s) => s.n > 0)
              .map((s) => (
                <span key={s.code} className={cn("h-full", CODE_TEXT[s.code].fill)} style={{ width: `${s.share * 100}%` }} />
              ))}
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-dense sm:grid-cols-2">
            {shares.map((s) => (
              <li key={s.code} className="flex items-center gap-2">
                <span aria-hidden className={cn("size-3 shrink-0 border border-ink", CODE_TEXT[s.code].fill)} />
                <span className="code font-medium">{s.code}</span>
                <span className="text-ink-soft">{CODE_TEXT[s.code].label}</span>
                <span className="ml-auto tabular-nums font-medium">{fmtInt(s.n)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </section>
  );
}

/** Latency and token/decision cost (08 §6, §8.1 panels 7–8). Cost: R D U; Analyst sees no-permission. */
export function OpsPanel({ latency, cost, canSeeCost }: { latency: EvalSummary["latency"]; cost: EvalSummary["cost"]; canSeeCost: boolean }) {
  return (
    <section aria-labelledby="ops" id="maliyet" className="scroll-mt-40 space-y-4">
      <LayerHead id="ops" n="§6" title="Gecikme ve maliyet" question="Karar ne kadar sürüyor, kaça mal oluyor?" source="08 §6, §8.1" />
      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Uçtan uca karar gecikmesi" meta="Bildirim → onay kartı" />
          <div className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2">
            <Stat size="sm" label="p50" value={fmtDec(latency.p50_s, 1)} unit="sn" />
            <Stat size="sm" label="p95" value={fmtDec(latency.p95_s, 1)} unit="sn" />
            <Bullet
              value={latency.p95_s}
              max={90}
              target={latency.target_p95_s}
              label="p95 gecikme"
              valueText={`${fmtDec(latency.p95_s, 1)} sn`}
              targetText={`${latency.target_p95_s} sn (p95)`}
              lowerIsBetter
              className="sm:col-span-2"
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Token ve karar maliyeti" meta="Sağlayıcı kotası ve $/karar · Risk Officer, Admin, Auditor" />
          {canSeeCost ? (
            <div className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-3">
              <Stat size="sm" label="LLM çağrısı (bugün)" value={fmtInt(cost.calls_today)} />
              <Stat size="sm" label="Token (bugün)" value={fmtInt(cost.tokens_today)} />
              <Stat size="sm" label="Token / karar" value={fmtInt(cost.tokens_per_decision)} hint="önbellek ve ön eleme sayesinde LLM'siz kararlar 0" />
            </div>
          ) : (
            <EmptyState className="py-6" title="Bu panel rolünüze kapalı" body="Token, kota ve maliyet verisini Risk Officer, Admin ve Auditor görür (FRONTEND-SPEC §2.9). Diğer değerlendirme katmanları size açıktır." />
          )}
        </Panel>
      </div>
    </section>
  );
}

type Shadow = EvalSummary["shadow"][number];

/** Shadow signals (US-55): counterfactual returns of rejected / expired proposals. */
export function ShadowPanel({ rows }: { rows: readonly Shadow[] }) {
  const cols: Column<Shadow>[] = [
    { key: "t", header: "Sembol", cell: (r) => <span className="code font-medium">{r.ticker}</span>, sortValue: (r) => r.ticker },
    { key: "b", header: "Kim durdurdu", cell: (r) => r.rejected_by },
    { key: "r", header: "Gölge getiri (20 g)", align: "right", cell: (r) => fmtSignedPct(r.shadow_return_20d, 1), sortValue: (r) => r.shadow_return_20d },
    { key: "p", header: "Öneri", cell: (r) => <span className="code text-muted">{r.proposal_id}</span> },
  ];
  return (
    <Panel>
      <PanelHeader title="Gölge sinyaller" meta="Reddedilen ve süresi dolan sinyallerin karşı-olgusal getirisi: risk kapısı, şüpheci ve insanın değerini tartar (A7)" />
      <DataTable caption="Gölge sinyaller" columns={cols} rows={rows} getRowId={(r) => r.proposal_id} />
    </Panel>
  );
}
