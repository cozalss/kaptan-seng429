"use client";

import { useState, type FormEvent } from "react";
import type { AlertPrefs } from "@/lib/domain";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { defaultAlertPrefs } from "@/lib/prefs/alert-defaults";
import { rememberAlertPrefs } from "@/lib/prefs/desktop-gate";
import { Button } from "@/components/ui/button";
import { PlainField } from "@/components/solo/plain-field";
import "./price-alerts.css";

const MAX_MUTED = 50;
const CODE = /^[A-Z0-9]{3,6}$/;

export function mutedSentence(muted: readonly string[] | null): string {
  if (muted === null) return "Susturduğun şirketlere bakıyorum…";
  if (muted.length === 0) return "Hiçbir şirketi susturmadın.";
  return `${muted.length} şirketten telefona ve bu bilgisayara haber gitmez.`;
}

/** The list after one more company is muted (a new array; the code is upper-cased, a repeat changes nothing). */
export function withMuted(muted: readonly string[], code: string): string[] {
  const c = code.trim().toUpperCase();
  return muted.includes(c) ? [...muted] : [...muted, c];
}

/**
 * Ayarlar · Şirket bazında sustur: a company you muted tells nobody outside the app (no phone, e-mail or desktop
 * message) when KAPtan has a suggestion for it or it files a disclosure you follow. It still shows up in the app, and
 * a price alert you set yourself still goes out. The companies you follow are the watchlist (İzlediklerim).
 */
export function MutedSection() {
  const api = useApi();
  const q = useApiQuery((a) => a.preferences(), []);
  const watch = useApiQuery((a) => a.watchlist(), []);
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [code, setCode] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const base = prefs ?? q.data?.alerts ?? null;
  const muted = base?.muted ?? null;

  const save = async (next: string[]) => {
    const doc: AlertPrefs = { ...(base ?? defaultAlertPrefs()), muted: next };
    setBusy(true);
    setFailure(null);
    try {
      const done = await api.saveAlertPrefs(doc);
      setPrefs(done.alerts);
      rememberAlertPrefs(done.alerts);
      setCode("");
      setTried(false);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const c = code.trim().toUpperCase();
    if (CODE.test(c) && muted !== null && muted.length < MAX_MUTED)
      void save(withMuted(muted, c));
  };

  const suggestions = (watch.data ?? []).filter(
    (w) => muted !== null && !muted.includes(w.ticker),
  );
  const bad =
    tried && !CODE.test(code.trim().toUpperCase())
      ? "Hisse kodunu yaz (ör. THYAO)."
      : null;

  return (
    <section
      aria-labelledby="sustur-baslik"
      id="sirket-sustur"
      className="ay-block"
    >
      <h2 id="sustur-baslik">
        <span className="pf-name">
          Şirket bazında sustur<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">{mutedSentence(muted)}</span>
      </h2>
      <p className="ay-block-lead">
        Susturduğun şirket için telefonuna, e-postana ve bu bilgisayara bildirim
        gitmez: ne öneri ne de izlediğin şirketin yeni bildirimi. Öneriyi yine
        ana sayfanda görürsün. Kendi kurduğun fiyat uyarıları susturmadan
        etkilenmez.
      </p>
      {muted && muted.length > 0 ? (
        <ul aria-label="Susturduğun şirketler" className="pa-chips">
          {muted.map((t) => (
            <li key={t} className="pa-chip">
              {t}
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={`${t} şirketinin sesini aç`}
                onClick={() => void save(muted.filter((x) => x !== t))}
              >
                Sesini aç
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        onSubmit={add}
        noValidate
        aria-label="Şirket sustur"
        className="pa-form"
      >
        <PlainField
          label="Hangi şirket?"
          hint="Hisse kodunu yaz, örneğin THYAO."
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={bad}
          autoComplete="off"
          maxLength={6}
        />
        <div className="cf-actions">
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || muted === null}
            pending={busy}
          >
            Sustur
          </Button>
          {suggestions.slice(0, 4).map((w) => (
            <Button
              key={w.ticker}
              variant="ghost"
              disabled={busy}
              onClick={() => void save(withMuted(muted ?? [], w.ticker))}
            >
              {w.ticker} sustur
            </Button>
          ))}
        </div>
      </form>
      <p
        role="status"
        className="ay-result"
        data-ok={failure || q.error ? "false" : "true"}
      >
        {failure ?? q.error ?? ""}
      </p>
    </section>
  );
}
