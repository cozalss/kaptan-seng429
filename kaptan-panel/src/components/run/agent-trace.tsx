import type { RunTrace } from "@/lib/domain";
import { NODE_LABELS } from "@/lib/domain";
import { fmtCompact, fmtInt, fmtLatency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { StreamStatus } from "@/lib/sse/use-event-stream";
import { chainStep, isAgentNode, MODEL_CHAIN, PROVIDER_LABEL, NODE_KIND_LABEL, TRACE_STATUS_LABEL } from "./labels";
import { layoutBars, totals } from "./trace-layout";
import { logTime, type LogLine } from "./use-run-explain";
import { Section } from "./section";

/**
 * §14 Ajan izi (FR-36, US-44): every graph node in order with its duration on one shared time
 * axis, tokens, model, prompt version, cache, the fallback chain, and the LangSmith link when
 * the run was sampled. Live runs stream node by node and stop at interrupt() → "Onay bekliyor".
 */
const BAR_TONE = {
  llm: "bg-ink",
  code: "bg-wash",
  human: "bg-[repeating-linear-gradient(135deg,var(--wash)_0_4px,transparent_4px_8px)] border border-wash",
} as const;

export function AgentTraceSection({ trace, live, stream, log }: { trace: RunTrace; live: boolean; stream: StreamStatus; log: readonly LogLine[] }) {
  const bars = layoutBars(trace.nodes);
  const t = totals(trace.nodes);
  const agents = trace.nodes.filter((n) => isAgentNode(n.node) && n.model_id);
  return (
    <Section
      id="iz"
      num="14"
      title="Ajan izi"
      meta={`${trace.nodes.length} düğüm · duvar saati ${fmtLatency(t.wallMs)} · ${t.llmCalls} LLM çağrısı · ${fmtCompact(t.tokensIn)} giriş / ${fmtCompact(t.tokensOut)} çıkış token${t.cached ? ` · ${t.cached} önbellekten` : ""}`}
      stamp={
        live ? (
          <Badge tone="wash">
            <span aria-hidden className="inline-block size-1.5 animate-pulse-dot bg-wash" />
            canlı · SSE {stream === "open" ? "bağlı" : stream === "reconnecting" ? "yeniden bağlanıyor" : stream}
          </Badge>
        ) : null
      }
      actions={
        trace.langsmith_url ? (
          <a href={trace.langsmith_url} target="_blank" rel="noreferrer noopener" className="text-dense font-medium text-ink underline underline-offset-4">
            LangSmith izi ↗
          </a>
        ) : (
          <span className="border border-dashed border-rule-soft px-2 py-0.5 text-meta text-muted" title="Bu koşu LangSmith'e örneklenmedi (mock modunda bağlantı yok)">
            LangSmith · örneklenmedi
          </span>
        )
      }
    >
      <div className="space-y-5">
        <ol className="border-t-[1.5px] border-ink" aria-label="Düğüm sırası">
          {bars.map((b, i) => {
            const n = b.node;
            const kind = NODE_LABELS[n.node].kind;
            const waitingHuman = n.node === "approval" && n.status === "waiting" && !live;
            return (
              <li
                key={n.node}
                className={cn(
                  "grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-hairline py-2 md:grid-cols-[22px_150px_minmax(0,1fr)_200px]",
                  n.status === "running" && "bg-wash-tint",
                  n.status === "waiting" && !waitingHuman && "opacity-55",
                )}
              >
                <span className="text-right text-meta text-muted tabular-nums">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {b.group ? <span aria-hidden className={cn("w-1.5 self-stretch border-l-[1.5px] border-ink", b.group.first && "border-t-[1.5px]", b.group.last && "border-b-[1.5px]")} /> : null}
                  <span className="min-w-0">
                    <span className="block truncate text-dense font-medium text-ink">{NODE_LABELS[n.node].tr}</span>
                    <span className="block text-meta text-muted">
                      {NODE_KIND_LABEL[kind]}
                      {b.group ? " · paralel" : ""}
                      {n.status !== "done" ? ` · ${waitingHuman ? "onay bekliyor" : TRACE_STATUS_LABEL[n.status]}` : ""}
                    </span>
                  </span>
                </span>
                <span className="col-span-3 col-start-2 row-start-2 md:col-span-1 md:col-start-auto md:row-start-auto">
                  <span className="relative block h-4 bg-sunk" aria-hidden>
                    {n.status === "waiting" && !waitingHuman ? null : (
                      <span
                        className={cn("absolute top-0 bottom-0", n.status === "skipped" ? "border border-dashed border-rule-soft" : BAR_TONE[kind], n.status === "running" && "animate-pulse-dot")}
                        style={waitingHuman ? { right: 0, width: 36 } : { left: `${b.left}%`, width: `${b.width}%` }}
                      />
                    )}
                  </span>
                </span>
                <span className="col-start-3 row-start-1 text-right text-meta md:col-start-auto md:row-start-auto">
                  <span className="text-dense font-medium text-ink tabular-nums">{n.latency_ms !== null && n.status === "done" ? fmtLatency(n.latency_ms) : waitingHuman ? "interrupt()" : "—"}</span>
                  {n.tokens_in || n.tokens_out ? (
                    <span className="block text-muted tabular-nums">
                      {fmtInt(n.tokens_in)} / {fmtInt(n.tokens_out)} tok{n.cached ? " · önbellek" : ""}
                    </span>
                  ) : null}
                  {n.model_id ? (
                    <span className="code block truncate text-muted" title={`${n.model_id} · ${n.prompt_version ?? ""}`}>
                      {n.model_id}
                    </span>
                  ) : null}
                  {n.note_tr ? <span className="block text-ink-soft">{n.note_tr}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-muted" aria-hidden>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 bg-ink" />LLM ajanı</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 bg-wash" />kod düğümü</span>
          <span className="inline-flex items-center gap-1.5"><span className={cn("inline-block h-2.5 w-4", BAR_TONE.human)} />insan</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-1.5 border-y-[1.5px] border-l-[1.5px] border-ink" />paralel (Send)</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="min-w-0">
            <h3 className="mb-2 text-dense font-medium text-ink">Model zinciri (yedekleme)</h3>
            {agents.length ? (
              <ul className="space-y-2">
                {agents.map((n) => {
                  if (!isAgentNode(n.node)) return null;
                  const chain = MODEL_CHAIN[n.node];
                  const step = chainStep(n.node, n.model_id);
                  return (
                    <li key={n.node} className="flex items-center gap-1 overflow-x-auto text-meta whitespace-nowrap">
                      <span className="w-[104px] shrink-0 text-dense text-ink">{NODE_LABELS[n.node].tr}</span>
                      {chain.map((c, i) => (
                        <span key={c} className="inline-flex items-center gap-1.5">
                          <span className={cn("border px-1.5 py-0.5", i === step ? "border-ink bg-ink text-on-dark" : c === "HOLD" ? "border-dashed border-rule-soft text-muted" : "border-hairline text-ink-soft")}>{c}</span>
                          {i < chain.length - 1 ? <span aria-hidden className="text-muted">→</span> : null}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-dense text-muted">Bu koşuda LLM ajanı çalışmadı.</p>
            )}
            <p className="mt-2 text-meta text-muted">{Object.entries(PROVIDER_LABEL).map(([k, v]) => `${k} = ${v}`).join(" · ")}. Kaynak: config/models.yaml. Koyu kutu yanıt veren basamak; yedeğe düşülürse koşu “degraded” işaretlenir, zincir biterse HOLD.</p>
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-dense font-medium text-ink">Canlı olaylar</h3>
            <ol aria-live="polite" aria-label="Canlı olay akışı" className="min-h-16 space-y-1 border-l-[1.5px] border-ink pl-3 text-meta">
              {log.length ? (
                log.map((l) => (
                  <li key={l.id} className="flex gap-2">
                    <time className="text-muted tabular-nums">{logTime(l.at)}</time>
                    <span className="text-ink-soft">{l.text}</span>
                  </li>
                ))
              ) : (
                <li className="text-muted">{live ? "Olay bekleniyor…" : "Koşu tamamlandı; canlı olay yok. Demo senaryosu enjekte edildiğinde düğümler burada tek tek akar."}</li>
              )}
            </ol>
          </div>
        </div>
      </div>
    </Section>
  );
}
