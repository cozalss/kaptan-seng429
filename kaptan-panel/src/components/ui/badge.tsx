import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { EVENT_LABEL, type EventType } from "@/lib/domain";

/**
 * Badges are stamps: square, 1px ink rule, Inter 12px. Mono only inside `code` slots.
 * Tone has a job: ink = neutral fact, wash = information/state, north = veto/critical,
 * ochre = the daily halt only, outline = secondary.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap border px-1.5 text-meta font-medium leading-[18px] [&_svg]:size-3",
  {
    variants: {
      tone: {
        ink: "border-ink bg-ink text-on-dark",
        outline: "border-rule-soft bg-panel text-ink",
        wash: "border-wash bg-wash-tint text-wash",
        "wash-solid": "border-wash bg-wash text-on-dark",
        north: "border-north bg-north-tint text-north",
        "north-solid": "border-north bg-north text-on-dark",
        ochre: "border-ink bg-ochre text-ink",
        muted: "border-hairline bg-sunk text-muted",
      },
    },
    defaultVariants: { tone: "outline" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** E-code badge: "E3 · Yeni iş ilişkisi / ihale" (or just the code when compact). */
export function EventBadge({ type, compact = false, className }: { type: EventType; compact?: boolean; className?: string }) {
  const l = EVENT_LABEL[type];
  const isEvent = type.startsWith("E");
  return (
    <Badge tone={isEvent ? "ink" : "muted"} className={className} title={`${l.code} · ${l.tr}`}>
      <span className="code">{l.code}</span>
      {compact ? null : <span className="font-normal">{l.tr}</span>}
    </Badge>
  );
}

/** Rule outcome mark: ✓ (ink) or ✗ (north only when it is a veto/critical). */
export function RuleMark({ passed, critical = false, label }: { passed: boolean; critical?: boolean; label?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-dense", passed ? "text-ink" : critical ? "text-north" : "text-ink-soft")}>
      <span aria-hidden className={cn("inline-grid size-[18px] place-items-center border text-[12px] leading-none", passed ? "border-ink" : critical ? "border-north bg-north-tint" : "border-rule-soft bg-sunk")}>
        {passed ? "✓" : "✗"}
      </span>
      <span className="sr-only">{passed ? "Geçti" : "Geçmedi"}</span>
      {label}
    </span>
  );
}

export type Severity = "info" | "reduce" | "veto" | "critical" | "warn";

const SEVERITY: Record<Severity, { tone: BadgeProps["tone"]; label: string }> = {
  info: { tone: "outline", label: "Bilgi" },
  warn: { tone: "wash", label: "Uyarı" },
  reduce: { tone: "wash", label: "Küçült" },
  veto: { tone: "north", label: "Veto" },
  critical: { tone: "north-solid", label: "Kritik" },
};

export function SeverityBadge({ severity, children }: { severity: Severity; children?: ReactNode }) {
  const s = SEVERITY[severity];
  return <Badge tone={s.tone}>{children ?? s.label}</Badge>;
}

/** "DEMO FİKSTÜRÜ" stamp — injected items must never pass as live (11 §4). */
export function FixtureBadge({ className }: { className?: string }) {
  return (
    <Badge tone="wash-solid" className={cn("tracking-[0.01em]", className)} title="Demo modunda enjekte edilmiş fikstür; canlı veri değil">
      DEMO FİKSTÜRÜ
    </Badge>
  );
}

/** "Temsili" marker for fictional issuers and documents. */
export function TemsiliBadge() {
  return (
    <Badge tone="muted" title="Kurgusal şirket ve belge; gerçek değil">
      Temsili
    </Badge>
  );
}
