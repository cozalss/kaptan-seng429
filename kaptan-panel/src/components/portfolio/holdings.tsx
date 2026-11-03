import Link from "next/link";
import type { Position } from "@/lib/domain";
import { fmtInt, fmtSignedPct } from "@/lib/format";
import { href, ROUTES } from "@/lib/nav";
import { fmtLira, fmtSignedLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { signTone } from "@/components/story/sign-tone";
import { titleTr } from "@/components/story/turkish";
import { Boat } from "@/components/ufuk/boat";
import { ScreenState } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { dateWords, exitSentence, waterSplit } from "./param-words";
import { holdingProgress, istanbulDate, positionReturn } from "./risk-math";

/**
 * What you own, as things to read: the company first, then in one sentence how many, what you paid
 * and what it is worth; when KAPtan will suggest selling; the voyage so far. The ledger is cut by the
 * water: what is up sits above the line, what is down under it.
 */
export function Holdings({ positions, today }: { positions: readonly Position[]; today: string }) {
  if (!positions.length) {
    return (
      <ScreenState
        kind="empty"
        title="Henüz hisse almadın."
        action={
          <Button asChild variant="secondary">
            <Link href={ROUTES.benim}>Ana sayfaya dön</Link>
          </Button>
        }
      >
        KAPtan bir şey önerdiğinde Ana sayfa’da görürsün. Onaylayıp bankana girersen burada yerini alır.
      </ScreenState>
    );
  }
  const { above, below } = waterSplit(positions);
  return (
    <section aria-labelledby="elindekiler" className="pm-ledger">
      <div className="pm-ledger-head">
        <h2 id="elindekiler" className="u-chapter text-ink">
          Elindekiler
        </h2>
        <p className="text-body text-ink-soft">Kötü bir haber gelirse KAPtan satmayı daha erken de önerebilir.</p>
      </div>
      <ol aria-label="Elindekiler" className="pm-rows">
        {above.map((p) => (
          <Holding key={`${p.ticker}-${p.book}-${p.opened_at}`} p={p} today={today} />
        ))}
        <li aria-hidden={below.length === 0 ? true : undefined} className="pm-waterline">
          <Boat className="pm-waterline-boat" />
          <span className="pm-waterline-text">
            {below.length === 0 ? "Su seviyesi: aldığın fiyat. Hepsi üstünde." : above.length === 0 ? "Su seviyesi: aldığın fiyat. Hepsi altında." : "Su seviyesi: aldığın fiyat"}
          </span>
        </li>
        {below.map((p) => (
          <Holding key={`${p.ticker}-${p.book}-${p.opened_at}`} p={p} today={today} />
        ))}
      </ol>
    </section>
  );
}

function Holding({ p, today }: { p: Position; today: string }) {
  const r = positionReturn(p);
  const worth = p.qty * p.last_price;
  const paid = p.qty * p.avg_cost;
  return (
    <li id={`elinde-${p.ticker}`} className="pm-row">
      <div className="min-w-0">
        <p className="pm-row-ticker">
          {p.ticker}
        </p>
        <h3 className="pm-row-name">
          <Link href={href.proposal(p.source_proposal)} className="pm-row-link">
            {titleTr(shortName(p.company_name))}
          </Link>
        </h3>
        <p className="pm-row-line">
          {fmtInt(p.qty)} adet aldın, {fmtLira(paid)} ödedin.
        </p>
      </div>
      <Voyage p={p} today={today} />
      <div className="pm-row-money">
        <p className="pm-row-worth">{fmtLira(worth)}</p>
        <p className="u-caption">şimdi ediyor</p>
        <p className={cn("pm-row-gain", signTone(r))}>
          <span aria-hidden>{r >= 0 ? "▲" : "▼"}</span> {fmtSignedLira(p.unrealized_pnl)} <span className="font-medium">{fmtSignedPct(r)}</span>
        </p>
      </div>
    </li>
  );
}

/** The holding's way from the day you bought to the day KAPtan plans to suggest selling: the boat is today. */
function Voyage({ p, today }: { p: Position; today: string }) {
  const h = holdingProgress(p, today);
  const sentence = exitSentence(p, today);
  return (
    <div className="pm-voyage">
      <p className={cn("pm-voyage-text", (h.dueToday || h.overdue) && "font-semibold")}>
        {sentence}
        {p.managed_by_exit_rule ? " Durdurma bu hisseyi satmaz." : ""}
      </p>
      <div aria-hidden className="pm-voyage-track">
        <span className="pm-voyage-from">{dateWords(istanbulDate(Date.parse(p.opened_at)))}</span>
        <span className="pm-voyage-line" style={{ "--pm-at": h.fraction } as React.CSSProperties}>
          <Boat className="pm-voyage-boat" />
        </span>
        <span className="pm-voyage-to">{dateWords(p.planned_exit_date)}</span>
      </div>
    </div>
  );
}
