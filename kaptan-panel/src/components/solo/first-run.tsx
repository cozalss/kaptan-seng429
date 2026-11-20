"use client";

import "@/components/ufuk/ufuk.css";
import "./money.css";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Position } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { isApiError, errorMessage } from "@/lib/api/types";
import { fmtInt } from "@/lib/format";
import { moneyError, parseMoney } from "@/lib/solo/money-input";
import { Boat } from "@/components/ufuk/boat";
import { Sea } from "@/components/ufuk/sea";
import { markHowToSeen } from "@/components/onboarding/seen";
import { HoldingForm } from "@/components/portfolio/holding-form";
import { Button } from "@/components/ui/button";
import { MoneyField } from "./money-field";

/** What KAPtan does, in the three sentences the first visit used to read in a pop-up. */
const NEXT_STEPS = [
  "KAPtan her gün şirketlerin KAP duyurularını okur.",
  "Sana bir şey önerirse burada görürsün. Nedenini ve ne kadar emin olmadığını da söyler.",
  "Sen onaylarsan işlemi bankana kendin girersin. KAPtan hiçbir zaman kendi başına alıp satmaz.",
] as const;

type Step = "money" | "holdings";

/**
 * The first thing a new install shows at /benim: one question, how much money the person starts
 * with, then an optional second one, the shares they already hold. It asks nothing else, suggests
 * no amount and sets no limit. Finishing it also counts as having read "KAPtan nasıl çalışır": the
 * three sentences under the question say the same, so nobody reads them twice.
 */
export function FirstRun({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("money");
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    // After the first step the sentence changes: a screen reader starts reading there.
    if (!moved.current) return;
    heading.current?.focus({ preventScroll: false });
  }, [step]);

  const finish = () => {
    markHowToSeen(window.localStorage);
    onDone();
  };

  return (
    <section aria-labelledby="ilk-baslik" className="fr">
      <div className="fr-stage u-page">
        <p className="u-caption fr-eyebrow">{step === "money" ? "Başlamadan önce tek soru" : "Bir soru daha, istersen"}</p>
        <h1 id="ilk-baslik" ref={heading} tabIndex={-1} data-route-focus="" className="u-sentence u-sentence--hero fr-sentence outline-none">
          {step === "money" ? "Ne kadar parayla başlıyorsun?" : "Elinde zaten hisse var mı?"}
        </h1>
        {step === "money" ? (
          <StartMoney
            onStarted={() => {
              moved.current = true;
              setStep("holdings");
            }}
          />
        ) : (
          <OwnShares onFinish={finish} />
        )}
      </div>
      <div className="fr-sea">
        <Sea className="absolute inset-0" />
        <div className="u-page fr-sea-inner">
          <Boat className="fr-boat" />
          <div>
            <h2 className="fr-sea-title">Bundan sonra ne olur?</h2>
            <ol className="fr-steps">
              {NEXT_STEPS.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function StartMoney({ onStarted }: { onStarted: () => void }) {
  const api = useApi();
  const [draft, setDraft] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const error = tried ? moneyError(draft) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const amount = parseMoney(draft);
    if (moneyError(draft) !== null || amount === null) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.moveMoney({ kind: "start", amount_try: amount });
      onStarted();
    } catch (err) {
      // Entered already (another tab, a double press): the money is there, so go on to the next question.
      if (isApiError(err) && err.code === "already_started") onStarted();
      else setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="fr-form" aria-label="Başlangıç parası">
      <MoneyField label="Başlangıç paran" value={draft} onChange={setDraft} error={error} hint="Örneğin 25.000 ya da 1.250,50" large autoFocus />
      <p className="fr-plain">KAPtan önerilerin büyüklüğünü bu paraya göre hesaplar. Paran bankanda kalır; KAPtan paraya dokunmaz.</p>
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="fr-go" disabled={busy} pending={busy}>
        {busy ? "Kaydediliyor…" : "Bu parayla başla"}
      </Button>
    </form>
  );
}

function OwnShares({ onFinish }: { onFinish: () => void }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<readonly Position[]>([]);
  const add = useRef<HTMLButtonElement>(null);

  return (
    <div className="fr-form">
      <p className="fr-plain">
        Varsa ekle; KAPtan onları da paranın içinde sayar. Yoksa geç, bunu sonra Param’dan da yapabilirsin. KAPtan elle eklediğin hisseler için satış önerisi vermez.
      </p>
      {added.length ? (
        <ul className="fr-added" aria-label="Eklediğin hisseler">
          {added.map((p) => (
            <li key={p.id}>
              <strong>{p.ticker}</strong> eklendi: {fmtInt(p.qty)} adet.
            </li>
          ))}
        </ul>
      ) : null}
      {adding ? (
        <HoldingForm
          submitLabel="Hisseyi ekle"
          cancelLabel="Vazgeç"
          onAdded={(p) => {
            setAdded((prev) => [...prev, p]);
            setAdding(false);
            requestAnimationFrame(() => add.current?.focus());
          }}
          onCancel={() => {
            setAdding(false);
            requestAnimationFrame(() => add.current?.focus());
          }}
        />
      ) : (
        <div className="mf-actions">
          <Button ref={add} variant={added.length ? "secondary" : "primary"} size="lg" onClick={() => setAdding(true)}>
            {added.length ? "Başka bir hisse ekle" : "Evet, hisse ekleyeyim"}
          </Button>
          <Button variant={added.length ? "primary" : "secondary"} size="lg" onClick={onFinish}>
            {added.length ? "Tamam, ana sayfaya geç" : "Hayır, ana sayfaya geç"}
          </Button>
        </div>
      )}
    </div>
  );
}
