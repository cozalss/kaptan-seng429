import Link from "next/link";
import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { plainEvent, shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { BigSentence } from "@/components/story/ui";

/** The status as a plain pill: words first, colour only confirms. */
const STATUS_PILL: Readonly<Record<ApprovalStatus, { label: string; tone: string }>> = {
  pending: { label: "İmza bekliyor", tone: "border-wash text-wash" },
  claimed: { label: "İnceleniyor", tone: "border-wash text-wash" },
  approved: { label: "İmzalandı", tone: "border-gain text-gain" },
  rejected: { label: "Reddedildi", tone: "border-north text-north" },
  expired: { label: "Süresi doldu", tone: "border-rule-soft text-muted" },
  cancelled: { label: "İptal oldu", tone: "border-rule-soft text-muted" },
};

/**
 * The top of an Öneri: back to Bugün, whose news it is (company, ticker, event type), the
 * status, and what happened in one sentence (the page title, the only Bodoni on the screen).
 */
export function ProposalHeader({ card, status }: { card: ApprovalCard; status: ApprovalStatus }) {
  const pill = STATUS_PILL[status];
  return (
    <header className="space-y-3">
      <Link href={ROUTES.bugun} className="inline-flex min-h-11 items-center gap-1.5 text-dense font-medium text-muted hover:text-ink sm:min-h-0">
        <span aria-hidden>←</span>
        Bugün
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[16px] leading-6 font-semibold text-ink">{titleTr(shortName(card.company_name))}</p>
        <span className="code border border-rule-soft px-1.5 text-dense text-ink-soft">{card.ticker}</span>
        <span className="text-dense text-muted">{card.sub_type_tr}</span>
        <span className={cn("ml-auto border px-2 py-0.5 text-dense font-semibold", pill.tone)}>{pill.label}</span>
      </div>
      <BigSentence id="oneri-baslik" focusTarget className="text-[32px] leading-[38px] sm:text-[40px] sm:leading-[46px]">
        {plainEvent(card)}
      </BigSentence>
    </header>
  );
}
