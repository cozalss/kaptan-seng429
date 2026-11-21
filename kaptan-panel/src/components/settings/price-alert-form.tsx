"use client";

import { useState, type FormEvent } from "react";
import type { PriceAlert } from "@/lib/domain/price-alerts";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { PlainField } from "@/components/solo/plain-field";
import {
  buildInput,
  isTyped,
  MODES,
  type AlertMode,
} from "./price-alerts-words";
import "./price-alerts.css";

/**
 * The form that makes a price alert: which share (fixed when it is opened from a company page), when to tell
 * you (a percent away from the price now, or a typed price) and one button. Used by Ayarlar and by the company
 * page's "Fiyat uyarısı" button. `onMade` gets the new list.
 */
export function PriceAlertForm({
  ticker,
  onMade,
}: {
  ticker?: string;
  onMade: (list: PriceAlert[]) => void;
}) {
  const api = useApi();
  const [code, setCode] = useState(ticker ?? "");
  const [mode, setMode] = useState<AlertMode>("up5");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const built = buildInput(ticker ?? code, mode, typed);
  const needsCode =
    ticker === undefined && !/^[A-Za-z0-9]{3,6}$/.test(code.trim());
  const fieldError = !tried || built.ok ? null : built.error;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!built.ok) return;
    setBusy(true);
    setFailure(null);
    try {
      onMade(await api.addPriceAlert(built.input));
      setTried(false);
      setTyped("");
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Yeni fiyat uyarısı"
      className="pa-form"
    >
      {ticker === undefined ? (
        <PlainField
          label="Hangi hisse?"
          hint="Hisse kodunu yaz, örneğin THYAO."
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={tried && needsCode ? "Hisse kodunu yaz (ör. THYAO)." : null}
          autoComplete="off"
          maxLength={6}
        />
      ) : null}
      <fieldset className="pa-modes">
        <legend className="cf-label">Ne zaman haber vereyim?</legend>
        <div className="pa-mode-grid">
          {MODES.map((m) => (
            <label key={m.mode} className="cf-check">
              <input
                type="radio"
                name="uyari-turu"
                checked={mode === m.mode}
                onChange={() => setMode(m.mode)}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {isTyped(mode) ? (
        <PlainField
          label="Fiyat (TL)"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          error={fieldError}
          inputMode="decimal"
          autoComplete="off"
          className="tabular-nums"
        />
      ) : (
        <p className="ay-channel-detail">
          Yüzde, şimdiki fiyata göre hesaplanır ve uyarı kurulurken bir fiyata
          çevrilir.
        </p>
      )}
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="cf-actions">
        <Button type="submit" variant="primary" pending={busy} disabled={busy}>
          {busy ? "Kuruluyor…" : "Uyarı kur"}
        </Button>
      </div>
    </form>
  );
}
