import Link from "next/link";
import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";
import { ROUTES } from "@/lib/nav";
import { reasonSentence } from "@/components/story/plain";

/** Where the proposal stands, in words. */
const STATUS_SAYS: Readonly<Record<ApprovalStatus, string>> = {
  pending: "Kararını bekliyor",
  claimed: "Kararını bekliyor",
  approved: "Onayladın",
  rejected: "Geçtin",
  expired: "Süresi doldu",
  cancelled: "İptal oldu",
};

/**
 * The top of "Neden?": the huge verb (the same one that was on the home: it flies over) and the
 * one sentence that says why. The focus lands here after a route change.
 */
export function ProposalHeader({ card, status }: { card: ApprovalCard; status: ApprovalStatus }) {
  const sell = card.side === "sell";
  return (
    <header className="oneri-hero" data-action={sell ? "sat" : "al"}>
      <div className="oneri-hero-top">
        <Link href={ROUTES.benim} className="oneri-hero-back">
          <span aria-hidden>←</span>
          Ana sayfa
        </Link>
        <p className="oneri-hero-state">{STATUS_SAYS[status]}</p>
      </div>
      <h1 id="oneri-baslik" tabIndex={-1} data-route-focus="" className="oneri-hero-title">
        <span className="oneri-verb oneri-verb-shared">{sell ? "SAT" : "AL"}</span>{" "}
        <span className="u-chapter oneri-hero-sentence block">{reasonSentence(card)}</span>
      </h1>
      {status === "pending" || status === "claimed" ? (
        <a href="#karar" className="oneri-hero-jump">
          Okumadan karar vermek istersen <span aria-hidden>↓</span>
        </a>
      ) : null}
    </header>
  );
}
