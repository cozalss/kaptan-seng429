import type { ReactNode } from "react";
import type { ApprovalCard, Explain } from "@/lib/domain";
import { NODE_LABELS, RISK_RULES } from "@/lib/domain";
import { fmtLatency } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The summary line of "Ayrıntılar": what is inside, in counts. */
export function detailsMeta(card: ApprovalCard, explain: Explain | null): string {
  const checks = explain?.risk_checks.length ?? 0;
  return `${card.rule_trace_summary.length} kural${checks ? ` · ${checks} risk kontrolü` : ""} · tayfanın izi`;
}

/**
 * "Ayrıntılar", for the curious: every rule with what was seen and its threshold, the risk
 * gate's checks and the crew's trace (model, time). Plain lists.
 */
export function Details({ card, explain }: { card: ApprovalCard; explain: Explain | null }) {
  return (
    <div className="space-y-6">
      <Block title="Kurallar">
        {card.rule_trace_summary.map((r) => (
          <Row key={r.rule} ok={r.passed} code={r.rule} text={r.detail_tr} aside={[r.observed, r.threshold].filter(Boolean).join(" · ")} />
        ))}
      </Block>
      {explain?.risk_checks.length ? (
        <Block title="Risk kapısı">
          {explain.risk_checks.map((c) => (
            <Row
              key={`${c.phase}-${c.rule_code}`}
              ok={c.outcome !== "reject"}
              code={c.rule_code}
              text={`${RISK_RULES[c.rule_code].label_tr}: ${c.detail_tr}`}
              aside={c.outcome === "resize" ? "küçültüldü" : ""}
            />
          ))}
        </Block>
      ) : null}
      {explain ? (
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
      ) : null}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[16px] leading-6 font-semibold text-ink">{title}</h3>
      <ul className="divide-y divide-hairline border-y border-hairline">{children}</ul>
    </section>
  );
}

function Row({ ok, code, text, aside }: { ok: boolean; code: string; text: string; aside: string }) {
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 py-2.5 text-dense">
      <span aria-label={ok ? "geçti" : "geçmedi"} className={cn("pt-px font-semibold", ok ? "text-gain" : "text-north")}>
        {ok ? "✓" : "✗"}
      </span>
      <span className="min-w-0">
        <span className="code text-ink">{code}</span>
        {text ? <span className="text-ink-soft"> — {text}</span> : null}
        {aside ? <span className="block text-muted tabular-nums">{aside}</span> : null}
      </span>
    </li>
  );
}
