import type { ReactNode } from "react";
import type { Signature } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain/user";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The few pieces Portföy, Denetim and Ayarlar share, so the three screens read as one product:
 * the page title (the only Bodoni on the screen), a card, a section title, a status pill and
 * the two-step signature status (1/2 → 2/2). Plain Tailwind on the global tokens.
 */

/** A white card on the page: one clear border, generous padding on the 8px grid. */
export const CARD = "border-2 border-hairline bg-panel";
export const CARD_PAD = "p-4 sm:p-6";

/** Column heads of the screens' tables. */
export const TH = "text-meta font-semibold text-muted";

/** The page title: Bodoni at 40px, where focus lands after a route change. */
export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <h1 tabIndex={-1} data-route-focus="" className="font-display text-[40px] leading-[44px] tracking-[-0.015em] text-ink outline-none">
        {children}
      </h1>
      {aside}
    </div>
  );
}

/** A section title: Inter 600 at 18px, with an optional one-line description. */
export function SectionTitle({ id, title, children, className }: { id?: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <h2 id={id} className="text-[18px] leading-7 font-semibold text-ink">
        {title}
      </h2>
      {children ? <p className="text-ui text-ink-soft">{children}</p> : null}
    </div>
  );
}

export type PillTone = "neutral" | "brand" | "gain" | "north" | "ochre";

const PILL: Readonly<Record<PillTone, string>> = {
  neutral: "bg-sunk text-ink",
  brand: "bg-wash-tint text-brand",
  gain: "bg-gain/10 text-gain",
  north: "bg-north-tint text-north",
  ochre: "bg-ochre-tint text-ink",
};

/** A status in plain words with one colour: "Çalışıyor", "Durduruldu", "1/2 imza". */
export function Pill({ tone = "neutral", children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-dense font-semibold whitespace-nowrap", PILL[tone], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export interface Step {
  /** Who signs at this step, e.g. "Yönetici başlatır". */
  label: string;
  sig: Signature | null;
  /** It is this step's turn (and not signed yet). */
  waiting: boolean;
  testId: string;
  /** Said under a waiting step, e.g. "imza bekleniyor · sıra sende". */
  waitingText?: string;
}

/**
 * Two signatures in order, as a plain status: each step says 1/2 or 2/2, who signs, and either
 * who signed when or that it is waiting. Used by the restart after Durdur and by limit changes.
 */
export function TwoStep({ steps, label, fresh = null }: { steps: readonly [Step, Step]; label: string; fresh?: number | null }) {
  return (
    <ol aria-label={label} className="grid gap-3 sm:grid-cols-2">
      {steps.map((s, i) => {
        const n = i + 1;
        return (
          <li
            key={s.testId}
            data-testid={s.testId}
            className={cn(
              "flex min-w-0 items-start gap-3 border-2 px-4 py-3",
              s.sig ? "border-gain/40 bg-gain/5" : s.waiting ? "border-brand bg-wash-tint" : "border-hairline",
              s.sig && fresh === n && "animate-stamp-in",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-meta font-semibold tabular-nums",
                s.sig ? "bg-gain text-on-dark" : s.waiting ? "bg-brand text-on-dark" : "border-2 border-rule-soft text-muted",
              )}
            >
              {s.sig ? "✓" : n}
            </span>
            <span className="min-w-0">
              <span className="block text-ui font-semibold text-ink">
                <span className="tabular-nums">{n}/2</span> · {s.label}
              </span>
              {s.sig ? (
                <>
                  <span className="mt-0.5 block text-dense text-ink-soft tabular-nums">
                    İmzalandı: {s.sig.name} · {ROLE_LABEL[s.sig.role]} · {fmtTime(s.sig.at)}
                  </span>
                  {s.sig.reason ? <span className="mt-0.5 block text-dense text-muted">“{s.sig.reason}”</span> : null}
                </>
              ) : (
                <span className="mt-0.5 block text-dense text-muted">{s.waiting ? (s.waitingText ?? "imza bekleniyor") : "henüz sırası gelmedi"}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
