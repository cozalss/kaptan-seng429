"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { AUDIT_TAMPER_POS, type DemoScenario } from "@/mocks/ids";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { useDesk } from "@/components/shell/desk-state";
import { startGuidedDemo } from "@/components/demo/demo-store";

/** The four demo scenarios (11 §2), each in one plain line. */
export const SCENARIOS: ReadonlyArray<{ id: DemoScenario; title: string; what: string }> = [
  { id: "e3_contract", title: "Yeni iş (E3)", what: "ÖRNEK ENERJİ büyük bir sözleşme imzalar; birkaç saniye içinde Bugün’e bir öneri düşer." },
  { id: "redteam_injection", title: "Gizli talimat", what: "Bildirime saklanmış bir komut; tayfa yakalar, öneri çıkmaz." },
  { id: "restricted_r04", title: "Tedbirli hisse", what: "SPK tedbiri olan bir hisse; kural hemen reddeder." },
  { id: "loss_simulation", title: "Zarar simülasyonu", what: "Portföy adım adım düşer; −⁠%1’de yeni emir durur, −⁠%5’te her şey durur." },
];

const sectionTitle = "text-[13px] font-medium tracking-[0.04em] text-ink uppercase";

/**
 * Demo — the guided walk through the six acts, the scenario buttons, the tamper test and a
 * fresh start. Everything that changes the demo data is the Yönetici's.
 */
export function DemoSection() {
  const api = useApi();
  const desk = useDesk();
  const { can } = useRole();
  const tamper = useApiQuery((a) => a.auditList({ scope: "today", limit: 1 }), []);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const mayRun = can("demo.run");
  const tamperOn = tamper.data?.tamper_on ?? false;

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
    <section aria-labelledby="demo-baslik" id="demo" className="scroll-mt-28 space-y-8">
      <div className="space-y-2">
        <h2 id="demo-baslik" className={sectionTitle}>
          Demo
        </h2>
        <p className="max-w-[600px] text-[16px] leading-[25px] text-ink-soft">Her şey kurgusal. Demo verisini değiştiren düğmeler Yönetici’nindir.</p>
      </div>

      <div className="space-y-3 border-[1.5px] border-ink bg-panel px-5 py-5 shadow-ink">
        <p className="font-display text-[26px] leading-tight text-ink">Rehberli demo</p>
        <p className="max-w-[560px] text-[15px] leading-[23px] text-ink-soft">
          Final sunumunun altı perdesini adım adım yürür: alttaki çubukta → ve ← ile ilerlersin, gerektiğinde rol kendiliğinden değişir, her adımda sunucuya bir cümle.
        </p>
        <Button variant="primary" size="lg" onClick={() => startGuidedDemo()}>
          Rehberli demoyu başlat
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-[16px] font-medium text-ink">Senaryolar</h3>
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
                disabled={!mayRun || busy !== null}
                onClick={() => void act(s.id, () => api.injectDemo(s.id), s.id === "e3_contract" ? "Eklendi. Öneri birkaç saniye içinde Bugün’de." : `Eklendi: ${s.title}.`)}
              >
                {busy === s.id ? "Ekleniyor…" : "Ekle"}
              </Button>
            </li>
          ))}
        </ul>
        <Denied action="demo.run" />
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
      </div>

      <div className="space-y-3" data-testid="tamper">
        <h3 className="text-[16px] font-medium text-ink">Kurcalama testi</h3>
        <p className="max-w-[560px] text-[15px] leading-[23px] text-ink-soft">
          Defterin gerçekten koruduğunu görmek için kayıt #{fmtInt(AUDIT_TAMPER_POS)}’i arkadan değiştirir. Sonra Denetim’de “Defteri doğrula”: zincir tam orada kırılır.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant={tamperOn ? "danger-outline" : "secondary"}
            disabled={!mayRun || busy !== null || tamper.loading}
            onClick={() => void act("tamper", async () => {
              await api.setTamper(!tamperOn);
              await tamper.refetch();
            }, tamperOn ? "Kurcalama geri alındı." : "Kayıt değiştirildi. Denetim’de doğrula.")}
          >
            {tamperOn ? "Kurcalamayı geri al" : "Bir kaydı kurcala"}
          </Button>
          <span className="text-[14px] text-muted">{tamperOn ? "Şu an: kayıt değişik" : "Şu an: defter temiz"}</span>
          <Link href={ROUTES.denetim} className="text-[14px] text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink">
            Denetim’e git →
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-5 border-t border-hairline pt-5">
        <p className="text-[14px] leading-[21px] text-muted">Her şeyi demo gününün başına döndürür.</p>
        <button
          type="button"
          disabled={!mayRun}
          className="shrink-0 text-[15px] text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink disabled:opacity-45"
          onClick={() => setConfirmReset(true)}
        >
          Demo verisini sıfırla
        </button>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent title="Demo verisini sıfırla" description="Eklenen senaryolar, imzalar, fişler ve sınır değişiklikleri silinir; gün baştan başlar." size="sm">
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
    </section>
  );
}
