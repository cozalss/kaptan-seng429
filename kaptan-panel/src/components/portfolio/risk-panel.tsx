"use client";

import type { Position, RiskStatus } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct, fmtTime, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Numeral, SampleNote, Stat } from "@/components/ui/primitives";
import { KillSwitchControl } from "./kill-switch-control";
import { LossMeter, SlotMeter, UsageBar } from "./meters";
import { deskTone, exposure, type RiskLimits } from "./risk-math";

const TONE_STAMP = {
  normal: { text: "Masa açık", cls: "border-ink text-ink" },
  halt: { text: "Yeni emir durdu", cls: "border-ink bg-ochre text-ink" },
  kill: { text: "Kill switch açık", cls: "border-north bg-north text-on-dark" },
} as const;

/**
 * Risk state (GET /risk/status, live via /stream/desk): daily P&L against −1 % (R02), drawdown
 * from peak against −5 % (R01), position slots against 8/10 (R08), exposure, quota — and the
 * kill switch beside them (FRONTEND-SPEC §2.5).
 */
export function RiskPanel({ risk, positions, limits, sample }: { risk: RiskStatus; positions: readonly Position[]; limits: RiskLimits; sample: boolean }) {
  const tone = deskTone(risk);
  const exp = exposure(positions, risk.equity);
  const stamp = TONE_STAMP[tone];
  const dailyBreached = risk.daily_pnl_pct <= limits.dailyHalt;
  const ddBreached = risk.drawdown_pct <= limits.killDrawdown;

  return (
    <Panel raised tone={tone === "kill" ? "critical" : "panel"} aria-labelledby="risk-title" className={cn(tone === "kill" && "border-[1.5px]")}>
      <PanelHeader
        id="risk-title"
        code={<span className="hidden sm:inline">R01 · R02 · R08</span>}
        title="Risk durumu"
        meta={
          <>
            {fmtTime(risk.as_of)} itibarıyla · masa akışıyla canlı · rejim {risk.regime === "normal" ? "normal" : "kriz (maruziyet ×0,5)"}
          </>
        }
        actions={
          <span role="status" aria-live="polite" className={cn("inline-flex h-7 items-center border-[1.5px] px-2 text-dense font-medium", stamp.cls)}>
            {stamp.text}
          </span>
        }
      />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid content-between gap-x-8 gap-y-6 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-3">
            <Stat label="Sanal özkaynak" value={fmtInt(risk.equity)} unit="TL" hint={sample ? <SampleNote /> : `zirve ${fmtTry(risk.peak_equity)}`} />
          </div>
          <div className="space-y-3">
            <Stat
              label="Günlük K/Z"
              value={fmtSignedPct(risk.daily_pnl_pct, 2)}
              hint={dailyBreached ? "Sınır aşıldı: bugün yeni emir yok (R02)" : `Sınır ${fmtPct(limits.dailyHalt, 0)} · aşılınca yeni emir durur`}
            />
            <LossMeter value={risk.daily_pnl_pct} limit={limits.dailyHalt} label="Günlük K/Z, durdurma sınırına göre" breachedTone="ochre" />
          </div>
          <div className="space-y-3">
            <Stat
              label="Zirveden düşüş"
              value={<span data-testid="drawdown-value"><Numeral text={fmtPct(risk.drawdown_pct, 2)} /></span>}
              tone={ddBreached ? "north" : "ink"}
              hint={ddBreached ? "Kill switch eşiği aşıldı (R01)" : `Kill switch ${fmtPct(limits.killDrawdown, 0)}`}
            />
            <LossMeter value={risk.drawdown_pct} limit={limits.killDrawdown} label="Zirveden düşüş, kill switch eşiğine göre" breachedTone="north" />
          </div>
          <div className="space-y-3">
            <Stat label="Açık pozisyon" value={String(positions.length)} unit={`/ ${limits.maxPositions}`} hint={`hedef ${limits.targetPositions} · tek pozisyon ≤ ${fmtPct(limits.maxPositionPct, 0)}`} />
            <SlotMeter used={positions.length} target={limits.targetPositions} max={limits.maxPositions} label="Eşzamanlı pozisyon" />
          </div>

          <dl className="grid gap-x-8 gap-y-2 border-t border-hairline pt-4 text-dense sm:col-span-2 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-4">
            <div>
              <dt className="text-meta text-muted">Brüt maruziyet</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {fmtPct(exp.pct, 1)} <span className="font-normal text-ink-soft">· {fmtTry(exp.gross)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-meta text-muted">En büyük pozisyon</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {exp.largest ? (
                  <>
                    <span className="code">{exp.largest.ticker}</span> {fmtPct(exp.largest.pct, 1)}
                    {exp.largest.pct > limits.maxPositionPct ? <Badge tone="north" className="ml-2">R07 üstü</Badge> : null}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-muted">Gerçekleşmemiş K/Z</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{exp.unrealized >= 0 ? "+" : "−"}{fmtTry(Math.abs(exp.unrealized))}</dd>
            </div>
            <div>
              <dt className="text-meta text-muted">LLM kotası (bugün)</dt>
              <dd className="mt-1 space-y-1.5">
                {risk.quota.map((q) => (
                  <div key={q.provider} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-meta">
                    <span className="truncate text-ink-soft">{q.provider}</span>
                    <span className="tabular-nums text-muted">
                      {fmtInt(q.used)}/{fmtInt(q.limit)}
                    </span>
                    <div className="col-span-2">
                      <UsageBar used={q.used} limit={q.limit} label={`${q.provider} kota kullanımı`} />
                    </div>
                  </div>
                ))}
              </dd>
            </div>
          </dl>
        </div>
        <div className="order-first border-b-[1.5px] border-ink p-3 lg:order-none lg:border-b-0 lg:border-l-[1.5px]">
          <KillSwitchControl risk={risk} />
        </div>
      </div>
    </Panel>
  );
}
