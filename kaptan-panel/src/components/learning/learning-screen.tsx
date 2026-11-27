"use client";

import "./learning.css";

import { useState } from "react";
import type { LearningChange, LearningKindRow, LearningReport } from "@/lib/domain/learning";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtDate, fmtInt, fmtSignedFigurePct } from "@/lib/format";
import { calibrationWords, foldResultWords, foldWords, learningSentence, shareWords, thresholdWords } from "@/lib/learning/words";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { ChangeItem } from "./change-item";

const LEAD =
  "Geçmiş duyurulardan ve kendi kararlarımdan çıkardıklarım. Her getiri, alım satım masrafı düşülmüş hâlidir. 2025 başından 2026 Ekim sonuna kadarki dönem son sınav için kapalı; oraya hiç bakmıyorum.";

/**
 * /ogrendiklerim ("Ne öğrendim"): the weekly learning report. One sentence first, then each kind of news with its
 * net result and how well KAPtan's own guesses held, the rule changes (with Geri al), what was looked at and left
 * alone, and how the estimate was chosen. Every figure is the report's own; nothing is computed here.
 */
export function LearningScreen() {
  const q = useApiQuery((api) => api.getLearning(), []);
  const [fresh, setFresh] = useState<LearningReport | null>(null);
  const report = fresh ?? q.data ?? null;
  return (
    <div className="ln-screen">
      <PageHeader name="Ne öğrendim" title={learningSentence(report ?? (q.error ? emptyReport : null))} lead={LEAD} />
      {q.error && !report ? (
        <ScreenState kind="error" title="Öğrendiklerimi şu an açamadım." onRetry={q.refetch}>
          {q.error}
        </ScreenState>
      ) : null}
      {report ? <Body report={report} onReport={setFresh} /> : null}
    </div>
  );
}

const emptyReport: LearningReport = { generated_at: null, auto_apply: true, takeaway_tr: null, estimator_tr: "", kinds: [], changes: [], rejected: [], folds: [] };

function Body({ report, onReport }: { report: LearningReport; onReport: (r: LearningReport) => void }) {
  return (
    <>
      <p className="ln-when">
        {report.generated_at ? `Son haftalık bakış: ${fmtDate(report.generated_at)}.` : "Haftalık bakış henüz bir kez bile yapılmadı."}{" "}
        {report.auto_apply ? "Kendi kendine öğrenme açık." : "Kendi kendine öğrenme kapalı: değişiklikleri yalnızca öneriyorum."}
      </p>
      <Kinds kinds={report.kinds} />
      <Changes changes={report.changes} onReport={onReport} />
      <Rejected report={report} />
      <HowMeasured report={report} />
    </>
  );
}

function Kinds({ kinds }: { kinds: readonly LearningKindRow[] }) {
  return (
    <section aria-labelledby="ln-turler" className="ln-section">
      <h2 id="ln-turler" className="u-chapter text-ink">Duyuru türlerine göre</h2>
      <p className="ln-note">Net getiri: duyurudan sonraki borsa günlerinde hissenin piyasadan farkı, masraf düşülmüş. Ortanca, sıraya dizince ortadaki sonuçtur; birkaç aşırı sonuç onu bozmaz.</p>
      {kinds.length === 0 ? <p className="ln-empty">Henüz olay yok.</p> : null}
      <ul className="ln-kinds">
        {kinds.map((k) => (
          <li key={k.kind} className="ln-kind" data-testid={`tur-${k.kind}`}>
            <div className="ln-kind-head">
              <h3 className="ln-kind-name">{k.label_tr}</h3>
              <p className="ln-kind-sub">{fmtInt(k.n)} olay · {fmtInt(k.horizon_days)} borsa günü sonra</p>
            </div>
            <dl className="ln-figs">
              <Fig label="Ortalama net getiri" value={k.mean_net} />
              <Fig label="Ortanca net getiri" value={k.median_net} />
              <div>
                <dt>Kazandıran oran</dt>
                <dd>{shareWords(k.hit_rate)}</dd>
              </div>
            </dl>
            <p className="ln-calib">
              <span className="ln-mini">Tahminim ne kadar tuttu?</span> {calibrationWords(k.calibration)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Fig({ label, value }: { label: string; value: number | null }) {
  const tone = value === null || value === 0 ? undefined : value > 0 ? "gain" : "loss";
  return (
    <div>
      <dt>{label}</dt>
      <dd data-tone={tone}>{value === null ? "—" : fmtSignedFigurePct(value, 2)}</dd>
    </div>
  );
}

function Changes({ changes, onReport }: { changes: readonly LearningChange[]; onReport: (r: LearningReport) => void }) {
  const undo = useApiMutation((api, version: number) => api.revertLearningChange(version));
  const revert = async (version: number) => {
    const r = await undo.run(version);
    if (r) onReport(r);
  };
  return (
    <section aria-labelledby="ln-degisen" className="ln-section">
      <h2 id="ln-degisen" className="u-chapter text-ink">Bu hafta değişenler</h2>
      <p className="ln-note">Puan: her kararda net getirideki fark. +0,4 puan, karar başına %0,4 daha fazla net getiri demek.</p>
      {undo.error ? (
        <p role="alert" className="ln-error">
          {undo.error}
        </p>
      ) : null}
      {changes.length === 0 ? <p className="ln-empty">Bu hafta hiçbir kural değişmedi.</p> : null}
      <ul className="ln-list">
        {changes.map((c) => (
          <ChangeItem key={c.version} change={c} pending={undo.pending} onRevert={revert} />
        ))}
      </ul>
    </section>
  );
}

function Rejected({ report }: { report: LearningReport }) {
  return (
    <section aria-labelledby="ln-red" className="ln-section">
      <h2 id="ln-red" className="u-chapter text-ink">Bakıp değiştirmediklerim</h2>
      {report.rejected.length === 0 ? <p className="ln-empty">Bu hafta bakıp bıraktığım bir kural yok.</p> : null}
      <ul className="ln-list">
        {report.rejected.map((r) => (
          <li key={r.rule} className="ln-item">
            <p className="ln-item-name">
              {r.label_tr}
              <span className="ln-step">
                {" "}
                {thresholdWords(r.current, r.unit)}
                {r.candidate !== null ? ` · denenen ${thresholdWords(r.candidate, r.unit)}` : ""}
              </span>
            </p>
            <p className="ln-item-why">{r.reason_tr}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowMeasured({ report }: { report: LearningReport }) {
  const label = new Map(report.kinds.map((k) => [k.kind, k.label_tr]));
  return (
    <section aria-labelledby="ln-nasil" className="ln-section ln-how">
      <h2 id="ln-nasil" className="u-chapter text-ink">Nasıl ölçtüm</h2>
      {report.estimator_tr ? <p className="ln-note">{report.estimator_tr}</p> : null}
      {[...new Set(report.folds.map((f) => f.fold))].map((fold) => (
        <div key={fold} className="ln-fold">
          <h3 className="ln-fold-head">{foldWords(fold)}</h3>
          <ul className="ln-folds">
            {report.folds
              .filter((f) => f.fold === fold)
              .map((f) => (
                <li key={f.kind}>
                  <span className="ln-fold-kind">{label.get(f.kind) ?? f.kind}</span> <span>{foldResultWords(f)}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
