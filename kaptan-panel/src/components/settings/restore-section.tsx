"use client";

import type { BackupList } from "@/lib/domain/restore";
import { useApiQuery } from "@/lib/api/react";
import { fmtDateTime, fmtDec } from "@/lib/format";
import "./price-alerts.css";

export function restoreSentence(list: BackupList | null): string {
  if (list === null) return "Yedeklerine bakıyorum…";
  if (!list.available) return "Yedek klasörünü buradan göremiyorum.";
  if (list.age_days === null) return "Henüz yedek görünmüyor.";
  if (list.age_days === 0) return "Son yedeğin bugün alındı.";
  return `Son yedeğin ${list.age_days} gün önce alındı.`;
}

export const ageText = (days: number) =>
  days === 0 ? "bugün" : `${days} gün önce`;

const MB = 1_000_000;
export const sizeText = (bytes: number) => `${fmtDec(bytes / MB, 1)} MB`;

/**
 * Ayarlar · Yedekten dön: the backups in the folder with how old each is, a warning when the newest is old, and the
 * exact steps to go back to one. The app never restores by itself: that is geri-yukle.ps1 on this computer, which
 * checks the records first and keeps today's data aside.
 */
export function RestoreSection() {
  const q = useApiQuery((a) => a.backupList(), []);
  const list = q.data ?? null;
  return (
    <section
      aria-labelledby="yedekten-don-baslik"
      id="yedekten-don"
      className="ay-block"
    >
      <h2 id="yedekten-don-baslik">
        <span className="pf-name">
          Yedekten dön<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">
          {restoreSentence(list)}
        </span>
      </h2>
      {list?.warning_tr ? (
        <p role="alert" className="pa-warn">
          {list.warning_tr}
        </p>
      ) : null}
      {list && !list.available ? (
        <p className="ay-block-lead">
          Yedekleri bu sayfa listeleyemedi; klasör KAPtan’a bağlı değil.
          KAPtan’ı .\baslat.ps1 ile yeniden başlatmak çoğu zaman düzeltir.
          Yedeklerin kendisi klasörde durur.
        </p>
      ) : null}
      {list && list.available && list.files.length === 0 ? (
        <p className="ay-block-lead">Klasörde yedek yok.</p>
      ) : null}
      {list && list.files.length > 0 ? (
        <ul aria-label="Yedekler" className="pa-files">
          {list.files.map((f) => (
            <li key={f.name} className="pa-file">
              <span className="pa-file-name">
                {fmtDateTime(f.at)} <span className="pa-code">({f.name})</span>
              </span>
              <span className="pa-file-age">{ageText(f.age_days)}</span>
              <span className="pa-file-age">{sizeText(f.size_bytes)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {list ? (
        <details className="ay-more">
          <summary className="ay-more-sum">Yedekten nasıl dönerim?</summary>
          <p className="ay-block-lead">
            Dönmek uygulamadan yapılmaz; bilgisayarda şu adımlarla yapılır:
          </p>
          <ol className="pa-steps">
            {list.steps_tr.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
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
