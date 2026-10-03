"use client";

import Link from "next/link";
import { fmtPct, fmtTime } from "@/lib/format";
import { useNow } from "@/lib/clock";
import { useDesk } from "./desk-state";

/**
 * Global risk bands (11 Adım 4, 06 §11): north red when the kill switch is on, ochre for
 * the daily −1% halt. Shown on every screen, under the top bar, announced politely.
 */
export function RiskBanner() {
  const { risk } = useDesk();
  if (!risk) return null;
  if (risk.kill_switch === "on") {
    const step = risk.reset_request ? "Sıfırlama başlatıldı (1/2) — Risk Officer onayı bekleniyor." : "Sıfırlama: Admin başlatır, Risk Officer onaylar (iki farklı kişi).";
    return (
      <div role="status" aria-live="polite" className="border-b-[1.5px] border-ink bg-north text-on-dark">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 sm:px-5">
          <span className="font-display text-[22px] leading-none tracking-[-0.01em]">KILL SWITCH AÇIK</span>
          <span className="text-dense">
            Yeni emir yok · açık emirler iptal edildi · pozisyonlar satılmadı, çıkış kuralıyla yönetiliyor.
            {risk.kill_reason ? ` Sebep: ${risk.kill_reason}.` : ""}
          </span>
          <span className="text-dense opacity-90">{step}</span>
          <Link href="/portfolio" className="ml-auto text-dense font-medium underline underline-offset-4">
            Risk durumuna git
          </Link>
        </div>
      </div>
    );
  }
  if (risk.halted_today) {
    return (
      <div role="status" aria-live="polite" className="border-b-[1.5px] border-ink bg-ochre text-ink">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 sm:px-5">
          <span className="font-display text-[22px] leading-none">YENİ EMİR DURDU</span>
          <span className="text-dense">
            Günlük K/Z {fmtPct(risk.daily_pnl_pct, 1)} (sınır −%1, R02). Gün içinde kaldırılamaz; ertesi seans otomatik kalkar.
          </span>
        </div>
      </div>
    );
  }
  return null;
}

/** Mock-mode ribbon: nobody may mistake fixtures for live data (11 §4). */
export function DemoRibbon() {
  const now = useNow(30_000);
  return (
    <div className="sticky top-0 z-40 flex h-[var(--ribbon-h)] items-center gap-3 overflow-hidden bg-wash px-3 text-meta whitespace-nowrap text-on-dark sm:px-5">
      <span className="border border-on-dark/70 px-1.5 leading-[16px] font-medium tracking-[0.02em]">DEMO VERİSİ</span>
      <span className="truncate">
        Tüm şirketler kurgusaldır (Temsili) · sayılar örnek değerdir, gerçek sonuç değildir · sanal para
      </span>
      <span className="ml-auto hidden tabular-nums opacity-85 sm:inline">
        Demo saati {now === null ? "—" : `11.01.2027 ${fmtTime(new Date(now).toISOString())}`}
      </span>
    </div>
  );
}
