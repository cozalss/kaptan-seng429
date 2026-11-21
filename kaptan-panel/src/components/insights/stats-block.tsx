"use client";

import "@/components/ufuk/ufuk.css";
import "@/components/portfolio/own-money.css";
import "./insights.css";

import type { ReturnStats, Versus } from "@/lib/domain/insights";
import { fmtFigurePct, fmtSignedFigurePct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dateWords } from "@/components/portfolio/param-words";
import { signTone } from "@/components/story/sign-tone";

/** Items that are missing for the same reason share one line. */
function groupByReason(items: ReadonlyArray<{ label: string; hidden_reason_tr: string | null }>): Array<[string, string[]]> {
  const out = new Map<string, string[]>();
  for (const i of items) if (i.hidden_reason_tr) out.set(i.hidden_reason_tr, [...(out.get(i.hidden_reason_tr) ?? []), i.label]);
  return [...out.entries()];
}

/** The figures here sit side by side and many are under one percent: all of them carry two decimals. */
const pct = (n: number) => fmtSignedFigurePct(n / 100, 2);

function title(s: ReturnStats): string {
  const move = s.twr_pct ?? 0;
  const verb = move > 0 ? "arttı" : move < 0 ? "azaldı" : "değişmedi";
  return `Para eklemeyi ve çekmeyi çıkarınca paran ${move === 0 ? "" : `${fmtFigurePct(Math.abs(move) / 100)} `}${verb}.`;
}

/**
 * Return and risk of the money line, every figure free of deposits and withdrawals: what the money did, the best and the
 * worst day, the biggest fall from its highest point. Closes only. Under it, the same days against the dollar; inflation
 * and deposit say why they are missing instead of showing a guess.
 */
export function StatsBlock({ stats, versus }: { stats: ReturnStats | undefined; versus: Versus | undefined }) {
  if (!stats || !stats.available || stats.twr_pct === null) return null;
  const shown = (versus?.items ?? []).filter((i) => i.pct !== null);
  const hidden = (versus?.items ?? []).filter((i) => i.pct === null);

  return (
    <section aria-labelledby="getiri" className="om">
      <div className="om-head">
        <h2 id="getiri" className="u-chapter text-ink">
          {title(stats)}
        </h2>
        <p className="ins-lead">
          {stats.from && stats.to ? `${dateWords(stats.from)} – ${dateWords(stats.to)} arası ${stats.days} borsa günü kapanışına bakıyorum. ` : ""}Bugünün bitmemiş hareketi burada yok.
        </p>
        {stats.caveat_tr ? <p className="ins-sub">{stats.caveat_tr}</p> : null}
      </div>

      <dl className="ins-figures" aria-label="Getiri ve risk">
        <div>
          <dt>Para eklemeden getirin</dt>
          <dd className={cn(signTone(stats.twr_pct))}>{pct(stats.twr_pct)}</dd>
        </div>
        {stats.best_day ? (
          <div>
            <dt>En iyi gün</dt>
            <dd className={cn(signTone(stats.best_day.pct))}>
              {pct(stats.best_day.pct)}
              <small>{dateWords(stats.best_day.d)}</small>
            </dd>
          </div>
        ) : null}
        {stats.worst_day ? (
          <div>
            <dt>En kötü gün</dt>
            <dd className={cn(signTone(stats.worst_day.pct))}>
              {pct(stats.worst_day.pct)}
              <small>{dateWords(stats.worst_day.d)}</small>
            </dd>
          </div>
        ) : null}
        {stats.max_fall_pct !== null ? (
          <div>
            <dt>Zirveden en büyük düşüş</dt>
            <dd className={cn(signTone(stats.max_fall_pct))}>
              {stats.max_fall_pct === 0 ? "Hiç düşmedi" : pct(stats.max_fall_pct)}
              {stats.fall_from && stats.fall_to ? <small>{`${dateWords(stats.fall_from)} – ${dateWords(stats.fall_to)}`}</small> : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {versus?.available && shown.length > 1 ? (
        <div className="mt-8">
          <h3 className="text-ui font-semibold text-ink">Aynı günlerde</h3>
          <dl className="ins-figures" aria-label="Paran başkalarına karşı">
            {shown.map((i) => (
              <div key={i.key}>
                <dt>{i.label}</dt>
                <dd className={cn(signTone(i.pct))}>
                  {pct(i.pct ?? 0)}
                  {i.source_tr ? <small>{i.source_tr}</small> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {versus?.available && hidden.length > 0 ? (
        <ul className="ins-sub mt-4" style={{ listStyle: "none", padding: 0 }} aria-label="Karşılaştırılamayanlar">
          {groupByReason(hidden.filter((i) => i.key !== "you")).map(([reason, labels]) => (
            <li key={reason}>
              {labels.map((l, i) => (i === 0 ? l : l.toLocaleLowerCase("tr"))).join(" ve ")}: {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
