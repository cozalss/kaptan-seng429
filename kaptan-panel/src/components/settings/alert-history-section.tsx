"use client";

import type { AlertHistoryItem } from "@/lib/domain/price-alerts";
import { useApiQuery } from "@/lib/api/react";
import { fmtDateTime } from "@/lib/format";
import "./price-alerts.css";

export const CHANNEL_WORDS = { ntfy: "Telefon", email: "E-posta" } as const;

export function historySentence(
  items: readonly AlertHistoryItem[] | null,
): string {
  if (items === null) return "Gönderilenlere bakıyorum…";
  if (items.length === 0)
    return "Henüz telefonuna ya da e-postana bir şey gönderilmedi.";
  const failed = items.filter((i) => !i.ok).length;
  const base = `Son ${items.length} bildirim burada.`;
  return failed > 0 ? `${base} ${failed} tanesi gitmedi.` : base;
}

/** Ayarlar · Bildirim geçmişi: every message that left this computer, when, where, and whether it arrived. */
export function AlertHistorySection() {
  const q = useApiQuery((a) => a.alertHistory(), []);
  const items = q.data ?? null;
  return (
    <section
      aria-labelledby="bildirim-gecmis-baslik"
      id="bildirim-gecmisi"
      className="ay-block"
    >
      <h2 id="bildirim-gecmis-baslik">
        <span className="pf-name">
          Bildirim geçmişi<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">
          {historySentence(items)}
        </span>
      </h2>
      <p className="ay-block-lead">
        Telefonuna ve e-postana ne zaman, hangi yoldan ne gönderildiği. Mesajlar
        hep aynı kısa cümlelerdir; hisse adı, tutar ve konu adı burada da
        yazmaz. Bu bilgisayardaki bildirimler listede yok.
      </p>
      {items && items.length > 0 ? (
        <ul aria-label="Gönderilen bildirimler" className="ay-channels">
          {items.map((i, n) => (
            <li key={`${i.at}-${i.channel}-${n}`} className="pa-hist">
              <time dateTime={i.at}>{fmtDateTime(i.at)}</time>
              <span>{CHANNEL_WORDS[i.channel]}</span>
              <span>
                {i.text}
                {i.ok ? "" : " "}
                {i.ok ? null : <strong className="pa-bad">Gitmedi.</strong>}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p
        role="status"
        className="ay-result"
        data-ok={q.error ? "false" : "true"}
      >
        {q.error ?? ""}
      </p>
    </section>
  );
}
