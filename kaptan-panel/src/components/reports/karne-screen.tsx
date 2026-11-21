"use client";

import "./reports.css";

import Link from "next/link";
import { useState } from "react";
import type { Karne, KarnePeriod } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { istanbulDay } from "@/lib/session-day";
import { cn } from "@/lib/utils";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { currentPeriod, karneSentence, moneyRows, shiftPeriod } from "./report-words";
import { TrackList, TrackSummaryBlock } from "./track-record";

const KINDS: ReadonlyArray<{ kind: KarnePeriod; label: string }> = [
  { kind: "month", label: "Ay" },
  { kind: "year", label: "Yıl" },
];

/**
 * /gecmis/karne: a month or a year of your money and of KAPtan's suggestions, on one page that prints
 * (A4, always in light colours) so it can be saved as a PDF from the browser's print window.
 */
export function KarneScreen() {
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDay(now);
  const [kind, setKind] = useState<KarnePeriod>("month");
  const [picked, setPicked] = useState<string | null>(null);
  const at = picked ?? (today ? currentPeriod(kind, today) : null);
  const q = useApiQuery((api) => (at ? api.karne(kind, at) : Promise.resolve(null)), [kind, at]);
  const k = q.data ?? null;
  const latest = today ? currentPeriod(kind, today) : null;

  const chooseKind = (next: KarnePeriod) => {
    setKind(next);
    setPicked(null);
  };

  return (
    <div className="rp-screen">
      <PageHeader
        name="Karne"
        title={k ? karneSentence(k) : q.error ? "Karneyi şu an açamadım." : "Karneyi hazırlıyorum…"}
        lead="Paran ve KAPtan'ın önerileri, ay ay ve yıl yıl. Hesaplar yalnızca senin kaydettiğin paradan ve bankada girdiğin işlemlerden gelir."
        actions={<ReportActions kind={kind} at={at} latest={latest} onKind={chooseKind} onShift={(d) => at && setPicked(shiftPeriod(kind, at, d))} />}
      />
      {q.error && !k ? (
        <ScreenState kind="error" title="Karneyi getiremedim." onRetry={() => void q.refetch()}>
          {q.error}
        </ScreenState>
      ) : null}
      {k ? <ReportBody k={k} /> : !q.error ? <ScreenState kind="loading" title="Rakamları topluyorum…" /> : null}
    </div>
  );
}

function ReportActions({ kind, at, latest, onKind, onShift }: { kind: KarnePeriod; at: string | null; latest: string | null; onKind: (k: KarnePeriod) => void; onShift: (d: number) => void }) {
  const canNext = at !== null && latest !== null && at < latest;
  return (
    <div className="rp-actions no-print">
      <div role="group" aria-label="Dönem türü" className="rp-seg">
        {KINDS.map((o) => (
          <button key={o.kind} type="button" aria-pressed={kind === o.kind} onClick={() => onKind(o.kind)} className="rp-seg-btn">
            {o.label}
          </button>
        ))}
      </div>
      <Button variant="secondary" size="md" onClick={() => onShift(-1)} aria-label={kind === "year" ? "Önceki yıl" : "Önceki ay"} disabled={at === null}>
        ← Önceki
      </Button>
      <Button variant="secondary" size="md" onClick={() => onShift(1)} aria-label={kind === "year" ? "Sonraki yıl" : "Sonraki ay"} disabled={!canNext}>
        Sonraki →
      </Button>
      <Button variant="primary" size="md" onClick={() => window.print()}>
        Yazdır / PDF olarak kaydet
      </Button>
    </div>
  );
}

function ReportBody({ k }: { k: Karne }) {
  const rows = moneyRows(k);
  const s = k.suggestions;
  return (
    <article aria-label={`${k.label_tr} karnesi`} className="rp-body">
      <p className="rp-printed-title">KAPtan karnesi · {k.label_tr}</p>
      {k.notes_tr.map((n) => (
        <p key={n} className="rp-note">
          {n}
        </p>
      ))}

      <section aria-labelledby="rp-para" className="rp-section">
        <h2 id="rp-para" className="u-chapter text-ink">
          Paran
        </h2>
        <dl className="rp-money" data-testid="karne-para">
          {rows.map((r) => (
            <div key={r.key} className="rp-money-row">
              <dt>
                <span className="text-body font-medium text-ink">{r.label}</span>
                <span className="block text-dense text-ink-soft">{r.meaning}</span>
              </dt>
              <dd className={cn("rp-fig", r.tone === "gain" && "text-gain", r.tone === "loss" && "text-loss")}>{r.value}</dd>
            </div>
          ))}
        </dl>
        {k.benchmark.available && k.benchmark.sentence_tr ? (
          <p className="mt-4 text-body text-ink" data-testid="karne-bist">
            {k.benchmark.sentence_tr}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="rp-oneri" className="rp-section">
        <h2 id="rp-oneri" className="u-chapter text-ink">
          KAPtan ne kadar tuttu?
        </h2>
        <p className="mt-2 max-w-[66ch] text-body text-ink-soft" data-testid="karne-oneri">
          {s.made === 0
            ? "Bu dönemde sana öneri gelmedi."
            : `${fmtInt(s.made)} öneri geldi, ${fmtInt(k.decisions)} tanesine karar verdin: ${fmtInt(s.took)} aldın, ${fmtInt(s.skipped)} geçtin, ${fmtInt(s.declined)} reddettin.${s.expired ? ` ${fmtInt(s.expired)} tanesinin süresi doldu.` : ""}${s.waiting ? ` ${fmtInt(s.waiting)} tanesi seni bekliyor.` : ""}`}
        </p>
        <div className="mt-5">
          <TrackSummaryBlock summary={k.track} />
        </div>
        <PeriodItems start={k.start} end={k.end} />
      </section>

      <p className="rp-foot">
        Bu sayfa yalnızca geçmişi anlatır; geleceği söylemez. KAPtan hiçbir zaman senin yerine işlem yapmaz.{" "}
        <Link href={ROUTES.gecmis} className="rp-link no-print">
          Geçmişe dön
        </Link>
      </p>
    </article>
  );
}

/** Every suggestion of the period with its own result (the summary above comes with the Karne itself). */
function PeriodItems({ start, end }: { start: string; end: string }) {
  const q = useApiQuery((api) => api.trackRecord({ from: start, to: end }), [start, end]);
  return q.data ? <TrackList items={q.data.items} /> : null;
}
