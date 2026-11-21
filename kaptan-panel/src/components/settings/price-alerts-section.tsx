"use client";

import { useState } from "react";
import type { PriceAlert } from "@/lib/domain/price-alerts";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { href } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { PriceAlertForm } from "./price-alert-form";
import {
  nowLine,
  PRICE_ALERTS_LEAD,
  priceAlertsSentence,
  waitsFor,
} from "./price-alerts-words";
import "./price-alerts.css";

/** Ayarlar · Fiyat uyarıları: the alerts you made (waiting first, fired ones after), a form for a new one, "Kaldır". */
export function PriceAlertsSection() {
  const api = useApi();
  const q = useApiQuery((a) => a.priceAlerts(), []);
  const [list, setList] = useState<PriceAlert[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const shown = list ?? q.data ?? null;

  const remove = async (id: string) => {
    setBusyId(id);
    setFailure(null);
    try {
      setList(await api.removePriceAlert(id));
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby="fiyat-uyari-baslik"
      id="fiyat-uyarilari"
      className="ay-block"
    >
      <h2 id="fiyat-uyari-baslik">
        <span className="pf-name">
          Fiyat uyarıları<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">
          {priceAlertsSentence(shown)}
        </span>
      </h2>
      <p className="ay-block-lead">{PRICE_ALERTS_LEAD}</p>
      {shown && shown.length > 0 ? (
        <ul aria-label="Fiyat uyarıların" className="ay-channels">
          {shown.map((a) => (
            <li
              key={a.id}
              className="pa-row"
              data-done={a.triggered_at !== null ? "true" : undefined}
            >
              <div className="min-w-0">
                <h3 className="ay-channel-state">
                  <a href={href.company(a.ticker)} className="pa-link">
                    {a.name} ({a.ticker})
                  </a>
                  : {waitsFor(a)}
                </h3>
                <p className="ay-channel-detail">{nowLine(a)}</p>
              </div>
              <Button
                variant="ghost"
                disabled={busyId === a.id}
                pending={busyId === a.id}
                onClick={() => void remove(a.id)}
                aria-label={`${a.ticker} uyarısını kaldır`}
              >
                Kaldır
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <PriceAlertForm onMade={setList} />
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
