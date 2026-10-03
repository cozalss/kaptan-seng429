import type { ApprovalCard, Explain } from "@/lib/domain";
import { NODE_LABELS, RISK_RULES } from "@/lib/domain";
import { fmtLatency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Tüm ayrıntılar" — for the curious, closed by default: every rule with its threshold, the
 * risk gate's checks and the crew's trace (model, time). Plain lists, no tables.
 */
export function Details({ card, explain }: { card: ApprovalCard; explain: Explain }) {
  return (
    <details className="group border-t border-hairline pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] text-muted select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        Tüm ayrıntılar
        <span aria-hidden className="transition-transform duration-[var(--dur-base)] group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-6 space-y-8 text-[14px] leading-[21px]">
        <Block title="Kurallar">
          {card.rule_trace_summary.map((r) => (
            <Row key={r.rule} ok={r.passed} code={r.rule} text={r.detail_tr} aside={[r.observed, r.threshold].filter(Boolean).join(" · ")} />
          ))}
        </Block>
        {explain.risk_checks.length ? (
          <Block title="Risk kapısı">
            {explain.risk_checks.map((c) => (
              <Row key={`${c.phase}-${c.rule_code}`} ok={c.outcome !== "reject"} code={c.rule_code} text={`${RISK_RULES[c.rule_code].label_tr}: ${c.detail_tr}`} aside={c.outcome === "resize" ? "küçültüldü" : ""} />
            ))}
          </Block>
        ) : null}
        <Block title="Tayfanın izi">
          {explain.trace.nodes
            .filter((n) => n.status !== "skipped")
            .map((n) => (
              <Row
                key={n.node}
                ok={n.status === "done"}
                code={NODE_LABELS[n.node].tr}
                text={n.note_tr ?? ""}
                aside={[n.model_id, n.latency_ms !== null ? fmtLatency(n.latency_ms) : null].filter(Boolean).join(" · ")}
              />
            ))}
        </Block>
      </div>
    </details>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-medium tracking-[0.06em] text-ink uppercase">{title}</h3>
      <ul className="divide-y divide-hairline border-y border-hairline">{children}</ul>
    </section>
  );
}

function Row({ ok, code, text, aside }: { ok: boolean; code: string; text: string; aside: string }) {
  return (
    <li className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2.5 py-2">
      <span aria-label={ok ? "geçti" : "geçmedi"} className={cn("pt-px", ok ? "text-ink" : "text-north")}>
        {ok ? "✓" : "✗"}
      </span>
      <span className="min-w-0">
        <span className="code text-ink">{code}</span>
        {text ? <span className="text-ink-soft"> — {text}</span> : null}
        {aside ? <span className="block text-[12px] text-muted tabular-nums">{aside}</span> : null}
      </span>
    </li>
  );
}
