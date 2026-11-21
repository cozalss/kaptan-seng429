"use client";

import "../reports/reports.css";

import Link from "next/link";
import { useState } from "react";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { ROUTES } from "@/lib/nav";
import { istanbulDay } from "@/lib/session-day";
import { addDays } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import {
  alertsSentence,
  doneSentence,
  weekRows,
  weeklySentence,
} from "./weekly-words";

/**
 * /gecmis/hafta: one week (Monday to Sunday) in plain words: what your money did, what KAPtan read and suggested,
 * and your result against BIST 100 when there is one. The phone only gets "haftalık özetin hazır"; this is the page.
 */
export function WeeklyScreen() {
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDay(now);
  const [picked, setPicked] = useState<string | null>(null);
  const at = picked ?? today;
  const q = useApiQuery(
    (api) => (at ? api.weekly(at) : Promise.resolve(null)),
    [at],
  );
  const w = q.data ?? null;
  const canNext = w !== null && today !== null && w.end < today;

  return (
    <div className="rp-screen">
      <PageHeader
        name="Haftalık özet"
        title={
          w
            ? weeklySentence(w)
            : q.error
              ? "Haftalık özeti şu an açamadım."
              : "Haftanı hazırlıyorum…"
        }
        lead="Haftanın paran ve KAPtan açısından özeti. Hesaplar yalnızca senin kaydettiğin paradan ve bankada girdiğin işlemlerden gelir."
        actions={
          <div className="rp-actions no-print">
            <Button
              variant="secondary"
              size="md"
              aria-label="Önceki hafta"
              disabled={w === null}
              onClick={() => w && setPicked(addDays(w.start, -7))}
            >
              ← Önceki
            </Button>
            <Button
              variant="secondary"
              size="md"
              aria-label="Sonraki hafta"
              disabled={!canNext}
              onClick={() => w && setPicked(addDays(w.start, 7))}
            >
              Sonraki →
            </Button>
          </div>
        }
      />
      {q.error && !w ? (
        <ScreenState
          kind="error"
          title="Haftalık özeti getiremedim."
          onRetry={() => void q.refetch()}
        >
          {q.error}
        </ScreenState>
      ) : null}
      {w ? (
        <article
          aria-label={`${w.label_tr} haftalık özeti`}
          className="rp-body"
        >
          {w.notes_tr.map((n) => (
            <p key={n} className="rp-note">
              {n}
            </p>
          ))}
          <section aria-labelledby="hf-para" className="rp-section">
            <h2 id="hf-para" className="u-chapter text-ink">
              Paran
            </h2>
            <p className="mt-2 text-body text-ink-soft">{w.label_tr}</p>
            <dl className="rp-money" data-testid="hafta-para">
              {weekRows(w).map((r) => (
                <div key={r.key} className="rp-money-row">
                  <dt>
                    <span className="text-body font-medium text-ink">
                      {r.label}
                    </span>
                    <span className="block text-dense text-ink-soft">
                      {r.meaning}
                    </span>
                  </dt>
                  <dd
                    className={cn(
                      "rp-fig",
                      r.tone === "gain" && "text-gain",
                      r.tone === "loss" && "text-loss",
                    )}
                  >
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
            {w.benchmark.available && w.benchmark.sentence_tr ? (
              <p className="mt-4 text-body text-ink" data-testid="hafta-bist">
                {w.benchmark.sentence_tr}
              </p>
            ) : null}
          </section>
          <section aria-labelledby="hf-kaptan" className="rp-section">
            <h2 id="hf-kaptan" className="u-chapter text-ink">
              KAPtan ne yaptı?
            </h2>
            <p
              className="mt-2 max-w-[66ch] text-body text-ink-soft"
              data-testid="hafta-kaptan"
            >
              {doneSentence(w)}
            </p>
            <p className="mt-2 max-w-[66ch] text-body text-ink-soft">
              {alertsSentence(w)}
            </p>
          </section>
          <p className="mt-8 text-body text-ink-soft">
            Bu sayfa yalnızca geçmişi anlatır; geleceği söylemez. KAPtan hiçbir
            zaman senin yerine işlem yapmaz.{" "}
            <Link href={ROUTES.karne} className="rp-link no-print">
              Aylık karneye git
            </Link>
          </p>
        </article>
      ) : !q.error ? (
        <ScreenState kind="loading" title="Rakamları topluyorum…" />
      ) : null}
    </div>
  );
}
