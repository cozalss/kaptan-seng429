import Link from "next/link";
import type { Position } from "@/lib/domain";
import { fmtInt, fmtSignedPct, NBSP } from "@/lib/format";
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

function signedTry(n: number): string {
  if (n === 0) return `0${NBSP}TL`;
  return `${n > 0 ? "+" : "−"}${fmtInt(Math.abs(Math.round(n)))}${NBSP}TL`;
}

/**
 * What you hold, as a table: company, lots, gain or loss in TL and in %, sessions left until
 * the planned exit. Figures are tabular and right-aligned; each company opens its öneri. On a
 * phone the lot sits under the name and the % under the TL figure.
 */
export function Holdings({ positions, today }: { positions: readonly Position[]; today: string }) {
  if (!positions.length) return <p className="px-4 py-8 text-center text-ui text-ink-soft sm:px-6">Şu an elinde hisse yok. İmzalanan bir öneri buraya düşer.</p>;
  return (
    <table aria-label="Elindekiler" className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b-2 border-hairline">
          <th scope="col" className={cn(TH, "py-2.5 pr-3 pl-4 sm:pl-6")}>
            Şirket
          </th>
          <th scope="col" className={cn(TH, "hidden px-3 py-2.5 text-right sm:table-cell")}>
            Lot
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
            <tr key={`${p.ticker}-${p.book}-${p.opened_at}`} className="border-b border-hairline last:border-b-0 hover:bg-wash-tint">
              <th scope="row" className="py-3 pr-3 pl-4 text-left font-normal sm:pl-6">
                <Link
                  href={href.proposal(p.source_proposal)}
                  className="text-ui font-semibold text-ink underline decoration-transparent underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {titleTr(shortName(p.company_name))}
                </Link>
                <span className="mt-0.5 block text-dense text-muted tabular-nums sm:hidden">{fmtInt(p.qty)} lot</span>
              </th>
              <td className="hidden px-3 py-3 text-right text-ui text-ink tabular-nums sm:table-cell">{fmtInt(p.qty)}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                <span className={cn("block text-ui font-semibold", signTone(p.unrealized_pnl))}>{signedTry(p.unrealized_pnl)}</span>
                <span className={cn("mt-0.5 block text-dense sm:hidden", signTone(r))}>{fmtSignedPct(r)}</span>
              </td>
              <td className={cn("hidden px-3 py-3 text-right text-ui tabular-nums sm:table-cell", signTone(r))}>{fmtSignedPct(r)}</td>
              <td className={cn("py-3 pr-4 pl-3 text-right text-ui whitespace-nowrap tabular-nums sm:pr-6", h.dueToday || h.overdue ? "font-semibold text-ink" : "text-ink-soft")}>
                {exitLine(p, today)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
