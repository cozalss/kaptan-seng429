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
import { cn } from "@/lib/utils";
import { CARD, CARD_PAD, Pill, SectionTitle } from "@/components/portfolio/kit";

/** The four demo scenarios (11 §2), each in one plain line. */
export const SCENARIOS: ReadonlyArray<{ id: DemoScenario; title: string; what: string }> = [
  { id: "e3_contract", title: "Yeni iş", what: "ÖRNEK ENERJİ büyük bir sözleşme imzalar; birkaç saniye içinde Bugün’e bir öneri düşer." },
  { id: "redteam_injection", title: "Gizli talimat", what: "Bildirime saklanmış bir komut; tayfa yakalar, öneri çıkmaz." },
  { id: "restricted_r04", title: "Tedbirli hisse", what: "SPK tedbiri olan bir hisse; kural hemen reddeder." },
  { id: "loss_simulation", title: "Zarar simülasyonu", what: "Portföy adım adım düşer; −⁠%1’de yeni emir durur, −⁠%5’te her şey durur." },
];

/**
 * Senaryolar — the scenario buttons, the tamper test and a fresh start. Everything that
 * changes the data is the Yönetici's; any other role sees the same controls closed, with the
 * reason said once at the top (never hidden: the Denetçi sees everything).
 */
export function DemoSection() {
  const { can } = useRole();
  return (
    <section aria-labelledby="demo-baslik" id="senaryolar" className="space-y-4">
      <SectionTitle id="demo-baslik" title="Senaryolar">
        Her senaryo sisteme bir olay verir; sonucu Bugün’de ve Denetim’de izlersin.
      </SectionTitle>
      <Denied action="demo.run" />
      <Controls allowed={can("demo.run")} />
    </section>
  );
}

/** The Yönetici's controls: add a scenario, tamper with one record, start the day again. */
function Controls({ allowed }: { allowed: boolean }) {
  const api = useApi();
  const desk = useDesk();
  const tamper = useApiQuery((a) => a.auditList({ scope: "today", limit: 1 }), []);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
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
  const toggleTamper = () =>
    act(
      "tamper",
      async () => {
        await api.setTamper(!tamperOn);
        await tamper.refetch();
      },
      tamperOn ? "Kurcalama geri alındı." : "Kayıt değiştirildi. Denetim’de doğrula.",
    );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <ul aria-label="Senaryolar" className={cn(CARD, "divide-y divide-hairline")}>
          {SCENARIOS.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-5 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-ui font-semibold text-ink">{s.title}</p>
                <p className="mt-0.5 text-dense text-muted">{s.what}</p>
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                aria-label={`Senaryo ekle: ${s.title}`}
                locked={!allowed}
                pending={busy === s.id}
                disabled={!allowed || busy !== null}
                onClick={() => void act(s.id, () => api.injectDemo(s.id), s.id === "e3_contract" ? "Eklendi. Öneri birkaç saniye içinde Bugün’de." : `Eklendi: ${s.title}.`)}
              >
                {busy === s.id ? "Ekleniyor…" : "Ekle"}
              </Button>
            </li>
          ))}
        </ul>
        <p role="status" aria-live="polite" className="text-ui text-ink empty:hidden">
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

      <div className={cn(CARD, CARD_PAD, "space-y-3")} data-testid="tamper">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-ui font-semibold text-ink">Kurcalama testi</h3>
          {tamperOn ? <Pill tone="north">Şu an: kayıt değişik</Pill> : <Pill tone="gain">Şu an: defter temiz</Pill>}
        </div>
        <p className="max-w-[560px] text-dense text-ink-soft">
          Kayıt #{fmtInt(AUDIT_TAMPER_POS)} arkadan değiştirilir; Denetim’de “Defteri doğrula” zinciri tam orada kırık bulur.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant={tamperOn ? "danger-outline" : "secondary"}
            locked={!allowed}
            pending={busy === "tamper"}
            disabled={!allowed || busy !== null || tamper.loading}
            onClick={() => void toggleTamper()}
          >
            {tamperOn ? "Kurcalamayı geri al" : "Bir kaydı kurcala"}
          </Button>
          <Link href={ROUTES.denetim} className="inline-flex min-h-11 items-center text-dense text-ink underline decoration-rule-ui underline-offset-4 hover:decoration-ink">
            Denetim’e git →
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-5 border-t-2 border-hairline pt-3">
        <p className="text-dense text-muted">Her şeyi günün başına döndürür.</p>
        <Button variant="link" className="shrink-0" locked={!allowed} pending={busy === "reset"} disabled={!allowed || busy !== null} onClick={() => setConfirmReset(true)}>
          Verileri sıfırla
        </Button>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent title="Verileri sıfırla" description="Eklenen senaryolar, imzalar, fişler ve sınır değişiklikleri silinir; gün baştan başlar." size="sm">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Vazgeç
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                setConfirmReset(false);
                await act("reset", () => api.resetDemo(), "Veriler sıfırlandı.");
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
