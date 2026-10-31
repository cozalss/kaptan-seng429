import Link from "next/link";
import type { Position } from "@/lib/domain";
import { fmtInt, fmtPct, fmtSignedPct, NBSP } from "@/lib/format";
import { href } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { signTone } from "@/components/story/sign-tone";
import { TH } from "./kit";
import { holdingProgress, positionReturn } from "./risk-math";

/** "3 gün kaldı" / "bugün çıkılır" / "çıkış günü geçti" — sessions left until the planned exit. */
export function exitLine(p: Pick<Position, "opened_at" | "planned_exit_date">, today: string): string {
  const h = holdingProgress(p, today);
  if (h.overdue) return "çıkış günü geçti";
  if (h.dueToday) return "bugün çıkılır";
  return `${Math.max(1, h.planned - h.elapsed)} gün kaldı`;
}

/**
 * Whose position it is: the KAPtan account's paper fill, or the slip you entered at your own
 * broker ("Girdim"). One signed öneri can give both, so the same company may show twice.
 */
const BOOK_LABEL: Readonly<Record<Position["book"], string>> = { paper: "KAPtan hesabı", personal: "Kendi hesabın" };

function signedTry(n: number): string {
  if (n === 0) return `0${NBSP}TL`;
  return `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(Math.round(n)))}${NBSP}TL`;
}

/**
 * What you hold, as a table: company, lots, value now and its weight, gain or loss in TL and
 * in %, sessions left until the planned exit. Figures are tabular and right-aligned; each
 * company opens its öneri. The account is named once (above the table) unless both accounts
 * hold something, then per row. On a phone the lot sits under the name and the % under the TL.
 */
export function Holdings({ positions, today }: { positions: readonly Position[]; today: string }) {
  if (!positions.length) return <p className="px-4 py-8 text-center text-ui text-ink-soft sm:px-6">Şu an elinde hisse yok. İmzalanan bir öneri buraya düşer.</p>;
  const books = new Set(positions.map((p) => p.book));
  const oneBook = books.size === 1 ? (positions[0]?.book ?? null) : null;
  const total = positions.reduce((sum, p) => sum + p.qty * p.last_price, 0);
  return (
    <table aria-label="Elindekiler" className="w-full border-collapse text-left">
      {oneBook ? <caption className="px-4 pb-2 text-left text-dense text-muted sm:px-6">{oneBook === "paper" ? "Hepsi KAPtan hesabında" : "Hepsi kendi hesabında"}</caption> : null}
      <thead className="sticky top-14 z-10 bg-panel/95 backdrop-blur-sm lg:top-0">
        <tr className="shadow-[inset_0_-2px_0_var(--hairline)]">
          <th scope="col" className={cn(TH, "py-2.5 pr-3 pl-4 sm:pl-6")}>
            Şirket
          </th>
          <th scope="col" className={cn(TH, "hidden px-3 py-2.5 text-right sm:table-cell")}>
            Lot
          </th>
          <th scope="col" className={cn(TH, "hidden px-3 py-2.5 text-right md:table-cell")}>
            Değer (TL)
          </th>
          <th scope="col" className={cn(TH, "hidden px-3 py-2.5 text-right lg:table-cell")}>
            Ağırlık
          </th>
          <th scope="col" className={cn(TH, "px-3 py-2.5 text-right")}>
            K/Z (TL)
          </th>
          <th scope="col" className={cn(TH, "hidden px-3 py-2.5 text-right sm:table-cell")}>
            K/Z (%)
          </th>
          <th scope="col" className={cn(TH, "py-2.5 pr-4 pl-3 text-right sm:pr-6")}>
            Çıkış
          </th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const r = positionReturn(p);
          const h = holdingProgress(p, today);
          return (
            <tr key={`${p.ticker}-${p.book}-${p.opened_at}`} className="border-b border-hairline transition-colors duration-[var(--dur-instant)] last:border-b-0 hover:bg-wash-tint">
              <th scope="row" className="py-3 pr-3 pl-4 text-left font-normal sm:pl-6">
                <Link
                  href={href.proposal(p.source_proposal)}
                  className="text-ui font-semibold text-ink underline decoration-transparent underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {titleTr(shortName(p.company_name))}
                </Link>
                {oneBook ? (
                  <span className="mt-0.5 block text-dense text-muted tabular-nums sm:hidden">{fmtInt(p.qty)} lot</span>
                ) : (
                  <span className="mt-0.5 block text-dense text-muted tabular-nums">
                    <span className="sm:hidden">{fmtInt(p.qty)} lot · </span>
                    {BOOK_LABEL[p.book]}
                  </span>
                )}
              </th>
              <td className="hidden px-3 py-3 text-right text-ui text-ink tabular-nums sm:table-cell">{fmtInt(p.qty)}</td>
              <td className="hidden px-3 py-3 text-right text-ui text-ink tabular-nums md:table-cell">{fmtInt(Math.round(p.qty * p.last_price))}</td>
              <td className="hidden px-3 py-3 text-right text-ui text-ink-soft tabular-nums lg:table-cell">{total > 0 ? fmtPct((p.qty * p.last_price) / total, 1) : "—"}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                <span className={cn("block text-ui font-semibold", signTone(p.unrealized_pnl))}>{signedTry(p.unrealized_pnl)}</span>
                <span className={cn("mt-0.5 block text-dense sm:hidden", signTone(r))}>{fmtSignedPct(r)}</span>
              </td>
              <td className={cn("hidden px-3 py-3 text-right text-ui tabular-nums sm:table-cell", signTone(r))}>{fmtSignedPct(r)}</td>
              <td className={cn("py-3 pr-4 pl-3 text-right text-ui whitespace-nowrap tabular-nums sm:pr-6", h.dueToday || h.overdue ? "font-semibold text-ink" : "text-ink-soft")}>
                {exitLine(p, today)}
                <span aria-hidden className="mt-1.5 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-sunk">
                  <span
                    className={cn("block h-full rounded-full", h.dueToday || h.overdue || h.planned - h.elapsed <= 1 ? "bg-ochre" : "bg-[var(--flow-2)]")}
                    style={{ width: `${Math.round(h.fraction * 100)}%` }}
                  />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
