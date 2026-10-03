"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PersonalReset, RiskStatus } from "@/lib/domain";
import { DEMO_MODE } from "@/lib/api/config";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs } from "@/lib/clock";
import { ROUTES } from "@/lib/nav";
import type { DemoScenario } from "@/mocks/ids";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { useDesk } from "@/components/shell/desk-state";
import { logout } from "@/components/shell/session-actions";
import { resetClockMs } from "@/components/portfolio/reset-timeline";
import { BigSentence } from "@/components/story/ui";

/** The four demo scenarios (11 §2), each in one plain line. */
export const SCENARIOS: ReadonlyArray<{ id: DemoScenario; title: string; what: string }> = [
  { id: "e3_contract", title: "Yeni iş (E3)", what: "ÖRNEK ENERJİ büyük bir sözleşme imzalar; birkaç saniye içinde Bugün’e bir öneri düşer." },
  { id: "redteam_injection", title: "Gizli talimat", what: "Bildirime saklanmış bir komut; tayfa yakalar, öneri çıkmaz." },
  { id: "restricted_r04", title: "Tedbirli hisse", what: "SPK tedbiri olan bir hisse; kural hemen reddeder." },
  { id: "loss_simulation", title: "Zarar simülasyonu", what: "Portföy adım adım düşer; −⁠%1’de yeni emir durur, −⁠%5’te her şey durur." },
];

/** Hours to fast-forward so the personal reset wait is over (24 h gap and 5 sessions), capped at 14 days. */
export function hoursToFinishWait(reset: PersonalReset | null, clockMs: number): number | null {
  if (!reset?.first) return null;
  const target = Date.parse(reset.ready_at ?? reset.sessions_ready_at);
  const need = Math.ceil((target - clockMs) / 3_600_000) + 1;
  return Math.min(24 * 14, Math.max(1, need));
}

/**
 * /ayarlar — only what a demo needs: add a scenario, fast-forward the reset wait, start over,
 * and sign out. The limits are fixed and shown in one line.
 */
export function SettingsScreen() {
  const api = useApi();
  const router = useRouter();
  const desk = useDesk();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-14">
      <BigSentence>Ayarlar</BigSentence>

      {DEMO_MODE ? (
        <section aria-labelledby="demo" className="space-y-5">
          <div>
            <h2 id="demo" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
              Demo
            </h2>
            <p className="mt-2 text-[17px] text-ink-soft">Bir senaryo ekle; tayfa hemen çalışır. Hepsi kurgusaldır.</p>
          </div>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {SCENARIOS.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-5 py-4">
                <div className="min-w-0">
                  <p className="text-[16px] font-medium text-ink">{s.title}</p>
                  <p className="mt-0.5 text-[14px] leading-[21px] text-muted">{s.what}</p>
                </div>
                <Button
                  variant="secondary"
                  className="shrink-0"
                  aria-label={`Senaryo ekle: ${s.title}`}
                  disabled={busy !== null}
                  onClick={() => void act(s.id, () => api.injectDemo(s.id), s.id === "e3_contract" ? "Eklendi. Öneri birkaç saniye içinde Bugün’de." : `Eklendi: ${s.title}.`)}
                >
                  {busy === s.id ? "Ekleniyor…" : "Ekle"}
                </Button>
              </li>
            ))}
          </ul>
          <p role="status" aria-live="polite" className="text-[15px] text-ink empty:hidden">
            {msg}
            {msg?.includes("Bugün") ? (
              <>
                {" "}
                <Link href={ROUTES.bugun} className="font-medium underline underline-offset-4">
                  Bugün’e git →
                </Link>
              </>
            ) : null}
          </p>
          {desk.risk ? <ClockRow risk={desk.risk} busy={busy !== null} onAdvance={(h) => void act("clock", () => api.advanceDemoClock(h), "Zaman ileri sarıldı.")} /> : null}
          <div className="flex items-center justify-between gap-5 border-t border-hairline pt-5">
            <p className="text-[14px] leading-[21px] text-muted">Her şeyi demo gününün başına döndürür.</p>
            <button type="button" className="shrink-0 text-[15px] text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink" onClick={() => setConfirmReset(true)}>
              Demo verisini sıfırla
            </button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="sinirlar" className="space-y-2">
        <h2 id="sinirlar" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
          Sınırlar
        </h2>
        <p className="text-[17px] leading-[27px] text-ink-soft">
          İşlem başına en fazla %0,5 risk · günde <span className="whitespace-nowrap">−%1</span> zararda yeni emir durur · en yüksek noktadan <span className="whitespace-nowrap">−%5’te</span> her şey durur. Bu sınırlar sabittir.
        </p>
      </section>

      <div className="border-t border-hairline pt-6">
        <Button
          variant="outline"
          onClick={async () => {
            router.replace(await logout());
            router.refresh();
          }}
        >
          Çıkış
        </Button>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent title="Demo verisini sıfırla" description="Eklediğin senaryolar, kararların ve fişlerin silinir; gün baştan başlar." size="sm">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Vazgeç
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                setConfirmReset(false);
                await act("reset", () => api.resetDemo(), "Demo verisi sıfırlandı.");
                desk.resetView();
              }}
            >
              Sıfırla
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClockRow({ risk, busy, onAdvance }: { risk: RiskStatus; busy: boolean; onAdvance: (h: number) => void }) {
  const stopped = risk.kill_switch === "on";
  const finish = hoursToFinishWait(risk.reset, resetClockMs(currentTimeMs(), risk.demo_clock_offset_h));
  return (
    <div data-testid="reset-clock" className="flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-[16px] font-medium text-ink">Zamanı ileri sar</p>
        <p className="mt-0.5 text-[14px] leading-[21px] text-muted">
          {!stopped
            ? "Durdurduktan sonraki bekleme için. Şu an durdurulmuş değil."
            : risk.reset?.next_step === "second"
              ? "Bekleme doldu; Portföy’den yeniden başlatabilirsin."
              : `Bekleme: ${risk.reset?.sessions_since_kill ?? 0}/${risk.reset?.sessions_required ?? 5} seans.`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" disabled={!stopped || busy} onClick={() => onAdvance(24)}>
          +24 saat
        </Button>
        <Button variant="secondary" disabled={!stopped || busy || finish === null || risk.reset?.next_step === "second"} onClick={() => finish !== null && onAdvance(finish)}>
          Beklemeyi doldur
        </Button>
      </div>
    </div>
  );
}
