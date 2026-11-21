"use client";

import "@/components/ufuk/ufuk.css";
import "./own-money.css";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { ROUTES } from "@/lib/nav";
import { RESET_WORD } from "@/lib/solo/money";
import { Button } from "@/components/ui/button";
import { PlainField } from "@/components/solo/plain-field";

/** The word as the person types it: any case, Turkish rules ("BAŞTAN" and "baştan" both count). */
export const isResetWord = (typed: string): boolean => typed.trim().toLocaleLowerCase("tr-TR") === RESET_WORD;

/**
 * The two things Param offers about the whole record: take it with you ("Kayıtlarımı indir", a
 * spreadsheet file) and "Baştan başla" for someone who tried KAPtan with a pretend amount and now
 * wants their real money in it. Starting over asks twice (a button, then a word) and says what
 * stays: the old book is not deleted, it moves to Geçmiş as "önceki defter".
 */
export function BookTools() {
  return (
    <section aria-labelledby="kayit-araclari" className="om bt">
      <h2 id="kayit-araclari" className="u-chapter text-ink">
        Kayıtların senin.
      </h2>
      <ExportRecords />
      <StartOver />
    </section>
  );
}

function ExportRecords() {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      const { filename, blob } = await api.exportRecords();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage(`${filename} indirildi.`);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bt-block">
      <p className="om-lead">Paranın bütün hareketlerini ve bankana girdiğin işlemleri Excel’de açabileceğin bir dosya olarak indir. Düzelttiğin ya da geri aldığın kayıtlar da içinde, olduğu gibi.</p>
      <div className="om-actions">
        <Button variant="secondary" size="lg" onClick={() => void download()} disabled={busy} pending={busy}>
          {busy ? "Hazırlanıyor…" : "Kayıtlarımı indir"}
        </Button>
      </div>
      <p role="status" className="om-status">
        {message}
      </p>
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

type Step = "closed" | "explain" | "word";

function StartOver() {
  const api = useApi();
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [typed, setTyped] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!isResetWord(typed)) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.startOver({ confirm: typed.trim() });
      router.push(ROUTES.benim);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bt-block">
      <p className="om-lead">Önce sahte bir tutarla denedin, şimdi gerçek paranla başlamak mı istiyorsun? Tam da bunu öneririz: baştan başla.</p>
      {step === "closed" ? (
        <div className="om-actions">
          <Button variant="outline" size="lg" onClick={() => setStep("explain")}>
            Baştan başla
          </Button>
        </div>
      ) : null}
      {step === "explain" ? (
        <div className="om-panel" role="group" aria-label="Baştan başla">
          <h3 className="om-panel-title">Baştan başlarsan ne olur?</h3>
          <ul className="bt-list">
            <li>Bu defter kapanır: paran, hisselerin, hareketlerin ve kazanç çizgin sıfırlanır. Bankanda bekleyen işlemler geçersiz olur.</li>
            <li>Eski defter silinmez; Geçmiş’te “önceki defter” olarak okuyabilirsin.</li>
            <li>KAPtan’ın okuduğu bildirimler, sınırların ve kayıtların sağlamlığı olduğu gibi kalır.</li>
            <li>Sonra ana sayfa seni yeniden başlangıç parasını yazmaya götürür.</li>
          </ul>
          <div className="mf-actions">
            <Button variant="primary" size="lg" onClick={() => setStep("word")}>
              Devam et
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setStep("closed")}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}
      {step === "word" ? (
        <form onSubmit={submit} noValidate className="om-panel mf-form" aria-label="Baştan başlamayı onayla">
          <PlainField
            label={`Onaylamak için “${RESET_WORD}” yaz`}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setFailure(null);
            }}
            error={tried && !isResetWord(typed) ? `Onaylamak için “${RESET_WORD}” yazman gerekiyor.` : null}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
          {failure ? (
            <p role="alert" className="mf-error mf-error--form">
              {failure}
            </p>
          ) : null}
          <div className="mf-actions">
            <Button type="submit" variant="danger" size="lg" disabled={busy} pending={busy}>
              {busy ? "Kapatıyorum…" : "Defteri kapat ve baştan başla"}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setStep("closed")} disabled={busy}>
              Vazgeç
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
