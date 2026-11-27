"use client";

import Link from "next/link";
import { useState } from "react";
import type { LearningReport } from "@/lib/domain/learning";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { ROUTES } from "@/lib/nav";
import { ChangeItem } from "@/components/learning/change-item";
import "@/components/learning/learning.css";

const ON = "Açık: bir değişiklik bütün sınamalardan geçerse KAPtan onu kendisi uygular. İstediğin an geri alabilirsin.";
const OFF = "Kapalı: KAPtan değişiklikleri yalnızca önerir, kendisi uygulamaz.";

/**
 * Ayarlar · Kendi kendine öğrenme: the switch (on by default) and the changes KAPtan applied, each with "Geri al".
 * Off means a change that passes every check is only shown as a suggestion on /ogrendiklerim.
 */
export function LearningSection() {
  const q = useApiQuery((api) => api.getLearning(), []);
  const save = useApiMutation((api, on: boolean) => api.setLearningSettings({ auto_apply: on }));
  const undo = useApiMutation((api, version: number) => api.revertLearningChange(version));
  const [fresh, setFresh] = useState<LearningReport | null>(null);
  const report = fresh ?? q.data ?? null;
  const on = report?.auto_apply ?? true;
  const applied = (report?.changes ?? []).filter((c) => c.status === "applied");
  const error = save.error ?? undo.error ?? q.error;

  const flip = async () => {
    const r = await save.run(!on);
    if (r) setFresh(r);
  };
  const revert = async (version: number) => {
    const r = await undo.run(version);
    if (r) setFresh(r);
  };

  return (
    <section aria-labelledby="ogrenme-baslik" id="ogrenme" className="ay-block">
      <h2 id="ogrenme-baslik">
        <span className="pf-name">
          Kendi kendine öğrenme<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">{on ? "KAPtan kendi kurallarını güncelliyor." : "KAPtan yalnızca öneriyor."}</span>
      </h2>
      <p className="ay-block-lead">
        Her hafta KAPtan kurallarının eşiklerini geçmiş duyurularla sınar. Bir adım değişiklik ancak geçmiş testte net
        getiriyi açıkça artırırsa ve yeterince olay varsa yapılır; kural başına haftada en fazla bir değişiklik.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby="ogrenme-durum"
        className="ln-switch mt-3"
        disabled={report === null || save.pending}
        onClick={() => void flip()}
      >
        <span aria-hidden className="ln-switch-track">
          <span className="ln-switch-thumb" />
        </span>
        Kendi kendine öğrenme
      </button>
      <p id="ogrenme-durum" className="ln-note">
        {on ? ON : OFF}
      </p>
      {error ? (
        <p role="alert" className="ln-error">
          {error}
        </p>
      ) : null}
      <h3 className="ln-mini mt-6">Uygulanan değişiklikler</h3>
      {report && applied.length === 0 ? <p className="ln-empty">Şu an uygulanmış bir değişiklik yok.</p> : null}
      {applied.length ? (
        <ul className="ln-list">
          {applied.map((c) => (
            <ChangeItem key={c.version} change={c} pending={undo.pending} onRevert={(v) => void revert(v)} compact />
          ))}
        </ul>
      ) : null}
      <Link href={ROUTES.ogrendiklerim} className="ln-link mt-2">
        Ne öğrendiğini gör <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
