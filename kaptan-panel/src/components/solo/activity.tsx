import type { ReactNode } from "react";
import Link from "next/link";
import { fmtTime } from "@/lib/format";
import { href, ROUTES } from "@/lib/nav";
import type { ActivityItem, ActivityKind } from "@/lib/solo/activity";
import { dayLabel, fmtLira } from "@/lib/solo/words";

/** One small ink mark per kind: a buy arrives (↙), a sell leaves (↗), a skip (×), a hold (=). */
const MARK: Readonly<Record<ActivityKind, ReactNode>> = {
  bought: <path d="M13 6 6 13M6 7.5V13h5.5" />,
  approved_buy: <path d="M13 6 6 13M6 7.5V13h5.5" />,
  approved_sell: <path d="M6 13l7-7M7.5 6H13v5.5" />,
  skipped: <path d="M6.5 6.5l6 6M12.5 6.5l-6 6" />,
  held: <path d="M5.5 8h8M5.5 11.5h8" />,
};

/**
 * "Son işlemler": a real log. The day is written once per day, then times, marks, words and the
 * money in fixed columns on hairlines. A row with a proposal behind it opens that proposal.
 */
export function Activity({ items }: { items: readonly ActivityItem[] }) {
  return (
    <section aria-labelledby="son-islemler" className="grid min-w-0 gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <header>
        <h2 id="son-islemler" className="u-sentence text-ink">
          Son işlemler
        </h2>
        <Link href={ROUTES.gecmis} className="mt-3 inline-flex min-h-11 items-center gap-2 text-ui font-semibold text-ink underline decoration-rule-ui underline-offset-4 hover:decoration-ink">
          Geçmişin tamamı <span aria-hidden>→</span>
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="log py-6 text-body text-ink-soft" data-testid="son-islemler">
          Henüz işlem yok. Bir öneriyi onayladığında burada görünür.
        </p>
      ) : (
        <ol className="log" data-testid="son-islemler">
          {items.map((it, i) => (
            <LogRow key={it.key} item={it} firstOfDay={dayLabel(it.at) !== dayLabel(items[i - 1]?.at ?? "1970-01-01")} />
          ))}
        </ol>
      )}
    </section>
  );
}

function LogRow({ item, firstOfDay }: { item: ActivityItem; firstOfDay: boolean }) {
  const body = (
    <>
      <span className="log-when text-dense text-ink-soft">
        <span className={firstOfDay ? "font-semibold text-ink" : "max-[519px]:font-normal sm:invisible"}>{dayLabel(item.at)}</span>
        <span>{fmtTime(item.at)}</span>
      </span>
      <span aria-hidden className="log-mark self-center text-ink">
        <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square">
          {MARK[item.kind]}
        </svg>
      </span>
      <span className="log-what min-w-0 truncate text-body font-medium text-ink">{item.title}</span>
      <span className="log-money pl-3 text-right text-body font-semibold whitespace-nowrap text-ink">{item.amount !== null ? fmtLira(item.amount) : null}</span>
      <span aria-hidden className="log-go text-ink">
        {item.proposalId ? "→" : null}
      </span>
    </>
  );
  return (
    <li className="log-row">
      {item.proposalId ? (
        <Link href={href.proposal(item.proposalId)} className="log-line">
          {body}
        </Link>
      ) : (
        <div className="log-line">{body}</div>
      )}
    </li>
  );
}
