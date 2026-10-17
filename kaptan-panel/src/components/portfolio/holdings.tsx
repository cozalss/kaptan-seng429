import Link from "next/link";
import type { Position } from "@/lib/domain";
import { fmtInt, fmtSignedPct, NBSP } from "@/lib/format";
import { href } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { holdingProgress, istanbulDate, positionReturn } from "./risk-math";

/** "3 gün kaldı" / "bugün çıkılır" / "çıkış günü geçti" — sessions left until the planned exit. */
export function exitLine(p: Pick<Position, "opened_at" | "planned_exit_date">, today: string): string {
  const h = holdingProgress(p, today);
  if (h.overdue) return "çıkış günü geçti";
  if (h.dueToday) return "bugün çıkılır";
  return `${Math.max(1, h.planned - h.elapsed)} gün kaldı`;
}

const dayMonthFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" });
const HARD = "çfhkpsşt";
const BACK_VOWELS = "aıou";

/** "11 Ocak’ta", "23 Kasım’da", "3 Eylül’de": a date with its locative, read as the month. */
export function onDateTr(iso: string): string {
  const printed = dayMonthFmt.format(new Date(iso));
  const vowels = printed.toLocaleLowerCase("tr-TR").match(/[aeıioöuü]/g) ?? ["e"];
  const lastVowel = vowels[vowels.length - 1] as string;
  const d = HARD.includes(printed.slice(-1).toLocaleLowerCase("tr-TR")) ? "t" : "d";
  return `${printed}’${d}${BACK_VOWELS.includes(lastVowel) ? "a" : "e"}`;
}

/** "bugün imzalandı" / "11 Ocak’ta imzalandı" — when the Risk Sorumlusu signed it. */
export function signedLine(signedAt: string, today: string): string {
  return istanbulDate(Date.parse(signedAt)) === today ? "bugün imzalandı" : `${onDateTr(signedAt)} imzalandı`;
}

function signedTry(n: number): string {
  if (n === 0) return `0${NBSP}TL`;
  return `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(Math.round(n)))}${NBSP}TL`;
}

/**
 * What you hold, one ruled row each: name, lots and when it was signed; the holding period as
 * a row of session ticks (inked = held, hairline = still to go) with "n gün kaldı"; then the
 * gain or loss in TL and % in two right-aligned tabular columns. Each row opens its öneri.
 */
export function Holdings({
  positions,
  today,
  signedAt,
}: {
  positions: readonly Position[];
  today: string;
  signedAt: Readonly<Record<string, string>>;
}) {
  if (!positions.length) return <p className="border-y border-hairline py-6 text-body text-ink-soft">Şu an elinde hisse yok. İmzalanan bir öneri buraya düşer.</p>;
  return (
    <ul aria-label="Elindekiler" className="divide-y divide-hairline border-y border-hairline">
      {positions.map((p) => {
        const r = positionReturn(p);
        const signed = signedAt[p.source_proposal];
        const meta = [`${fmtInt(p.qty)} lot`, p.book === "personal" ? "kendi hesabında" : null, signed ? signedLine(signed, today) : null].filter(
          (part): part is string => part !== null,
        );
        const loss = p.unrealized_pnl < 0;
        return (
          <li key={`${p.ticker}-${p.book}-${p.opened_at}`}>
            <Link
              href={href.proposal(p.source_proposal)}
              className={cn(
                "group -mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_12.5rem_7rem_4rem]",
                "transition-colors duration-[var(--dur-quick)] hover:bg-wash-tint active:bg-wash-tint-strong",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
              )}
            >
              <span className="min-w-0">
                <span className="flex items-baseline gap-2 text-ui font-medium text-ink">
                  <span className="truncate">{titleTr(shortName(p.company_name))}</span>
                  <span
                    aria-hidden
                    className="text-ink-soft opacity-0 transition-[opacity,translate] duration-[var(--dur-quick)] ease-[var(--ease-out-expo)] group-hover:translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100"
                  >
                    →
                  </span>
                </span>
                <span className="mt-0.5 block text-dense text-muted tabular-nums">
                  {meta.map((part, i) => (
                    <span key={part}>
                      {i > 0 ? " · " : null}
                      <span className="whitespace-nowrap">{part}</span>
                    </span>
                  ))}
                </span>
                <HoldingTicks p={p} today={today} className="mt-2 sm:hidden" />
              </span>
              <HoldingTicks p={p} today={today} className="hidden self-center sm:flex" />
              <span className="text-right tabular-nums">
                <span className={cn("block text-ui font-medium", loss ? "text-ink-soft" : "text-ink")}>{signedTry(p.unrealized_pnl)}</span>
                <span className="mt-0.5 block text-dense text-muted sm:hidden">{fmtSignedPct(r)}</span>
              </span>
              <span className="hidden text-right text-ui text-ink-soft tabular-nums sm:block">{fmtSignedPct(r)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Upper bound on drawn ticks: a longer plan is drawn to scale in this many. */
const MAX_TICKS = 24;

/** One tick per session of the plan: inked when held, a hairline when still to go. */
function HoldingTicks({ p, today, className }: { p: Pick<Position, "opened_at" | "planned_exit_date">; today: string; className: string }) {
  const h = holdingProgress(p, today);
  const count = Math.min(h.planned, MAX_TICKS);
  const inked = h.dueToday || h.overdue ? count : Math.round(h.fraction * count);
  return (
    <span className={cn("flex items-center gap-2.5 text-dense text-ink-soft tabular-nums", className)}>
      <span aria-hidden className="flex h-2.5 items-stretch gap-[2px]">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={cn("w-[3px]", i < inked ? "bg-ink" : "bg-hairline")} />
        ))}
      </span>
      <span className={cn("whitespace-nowrap", (h.dueToday || h.overdue) && "font-medium text-ink")}>{exitLine(p, today)}</span>
    </span>
  );
}
