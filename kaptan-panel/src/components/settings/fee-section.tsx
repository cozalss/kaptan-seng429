"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { MAX_COMMISSION_RATE, type BrokerFee } from "@/lib/solo/money";
import { parseMoney } from "@/lib/solo/money-input";
import { Button } from "@/components/ui/button";
import { PlainField } from "@/components/solo/plain-field";

const MAX_PERMILLE = MAX_COMMISSION_RATE * 1000;
const permille = (rate: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(Math.round(rate * 1e6) / 1000);

/** The typed "binde" figure as a fraction; null = not a usable number (0 to 10). */
export function ratePerMilleToFraction(raw: string): number | null {
  const n = parseMoney(raw.trim().replace(/\.(?=\d{3}\b)/g, ""), 3);
  return n === null || n < 0 || n > MAX_PERMILLE ? null : Math.round(n * 1e3) / 1e6;
}

/**
 * "Bankamın komisyon oranı": what your bank takes on each trade, written once. When you record a fill
 * without typing the commission, KAPtan estimates it with this rate (the bank's tax on it comes on top)
 * and says which rate it used. Until you write yours it uses its own default, and says so here.
 */
export function FeeSection() {
  const api = useApi();
  const [fee, setFee] = useState<BrokerFee | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .brokerFee()
      .then((f) => {
        if (!alive) return;
        setFee(f);
        if (f.own) setDraft(permille(f.commission_rate));
      })
      .catch((e: unknown) => alive && setFailure(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [api]);

  const save = async (rate: number | null) => {
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      const next = await api.setBrokerFee({ commission_rate: rate });
      setFee(next);
      setDraft(next.own ? permille(next.commission_rate) : "");
      setMessage(next.own ? `Kaydettin: binde ${permille(next.commission_rate)}.` : "Kendi oranını kaldırdın; KAPtan’ın hazır oranı geçerli.");
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const rate = ratePerMilleToFraction(draft);
    if (rate !== null) void save(rate);
  };

  const error = tried && ratePerMilleToFraction(draft) === null ? `Binde 0 ile ${MAX_PERMILLE} arasında bir sayı yaz (ör. 2 ya da 1,5).` : null;

  return (
    <section aria-labelledby="komisyon-baslik" id="komisyon" className="ay-block">
      <h2 id="komisyon-baslik">
        <span className="pf-name">
          Bankamın komisyonu<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">{fee === null ? "Komisyon oranına bakıyorum…" : fee.own ? `Komisyon oranın: binde ${permille(fee.commission_rate)}.` : "Komisyon için KAPtan’ın hazır oranı geçerli."}</span>
      </h2>
      <p className="ay-block-lead">
        Bankan her alım ve satışta tutarın küçük bir kısmını komisyon olarak keser. Bankanın oranını bir kez yaz; bir işlemi kaydederken komisyonu boş bırakırsan KAPtan bu orana göre tahmin eder ve bunu sana söyler. Bankanın vergisi (BSMV) bunun üstüne eklenir.
        {fee && !fee.own ? ` Şu an hazır oran: binde ${permille(fee.default_rate)}.` : ""}
      </p>
      <form onSubmit={submit} noValidate aria-label="Bankamın komisyon oranı" className="mf-form">
        <PlainField label="Binde kaç?" hint="Örneğin bankan yüzde 0,2 alıyorsa binde 2 yaz." value={draft} onChange={(e) => { setDraft(e.target.value); setFailure(null); }} error={error} inputMode="decimal" autoComplete="off" className="tabular-nums" />
        {failure ? (
          <p role="alert" className="mf-error mf-error--form">
            {failure}
          </p>
        ) : null}
        <div className="mf-actions">
          <Button type="submit" variant="primary" disabled={busy} pending={busy}>
            {busy ? "Kaydediliyor…" : "Oranımı kaydet"}
          </Button>
          {fee?.own ? (
            <Button variant="ghost" disabled={busy} onClick={() => void save(null)}>
              Kendi oranımı kaldır
            </Button>
          ) : null}
        </div>
        <p role="status" className="ay-channel-detail">
          {message}
        </p>
      </form>
    </section>
  );
}
