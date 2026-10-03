import type { NodeName, RunEvent, TraceNode } from "@/lib/domain";
import { NODE_LABELS } from "@/lib/domain";

/**
 * Agent-trace timeline maths (FR-36, US-44): bar offsets from `started_at`, parallel
 * groups (Send fan-out), totals, and merging live SSE node events over the fetched trace.
 */
type NodeEventData = Extract<RunEvent, { event: "node" }>["data"];

export interface LiveNode {
  phase: "start" | "end";
  at: string;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

export type LiveMap = Partial<Record<NodeName, LiveNode>>;

export function applyNodeEvent(live: LiveMap, ev: NodeEventData): LiveMap {
  const prev = live[ev.node];
  // An "end" is final: a late "start" must not reopen a finished node.
  if (prev?.phase === "end" && ev.phase === "start") return live;
  return { ...live, [ev.node]: { phase: ev.phase, at: ev.at, latency_ms: ev.latency_ms, tokens_in: ev.tokens_in, tokens_out: ev.tokens_out } };
}

const RANK: Readonly<Record<TraceNode["status"], number>> = { waiting: 0, running: 1, done: 2, skipped: 2, failed: 2 };

/**
 * The fetched trace with live events laid over it; status only ever moves forward. Start times
 * stay on the trace's own clock: a node that only the stream knows about starts where the
 * previous node ended (or with its parallel group), never at the stream's wall-clock time.
 */
export function mergeLive(nodes: readonly TraceNode[], live: LiveMap): TraceNode[] {
  const out: TraceNode[] = [];
  nodes.forEach((n, i) => {
    const l = live[n.node];
    const liveStatus: TraceNode["status"] | null = l ? (l.phase === "end" ? "done" : "running") : null;
    // The human node only finishes when the approval record says so (interrupt()), never from the stream.
    if (!l || !liveStatus || NODE_LABELS[n.node].kind === "human" || RANK[liveStatus] <= RANK[n.status]) {
      out.push(n);
      return;
    }
    out.push({
      ...n,
      status: liveStatus,
      started_at: n.started_at ?? inferredStart(out, i, n),
      latency_ms: l.phase === "end" ? (l.latency_ms ?? n.latency_ms) : null,
      tokens_in: l.tokens_in ?? n.tokens_in,
      tokens_out: l.tokens_out ?? n.tokens_out,
    });
  });
  return out;
}

function inferredStart(prior: readonly TraceNode[], i: number, n: TraceNode): string | null {
  const prev = prior[i - 1];
  if (!prev?.started_at) return null;
  if (n.parallel_group && prev.parallel_group === n.parallel_group) return prev.started_at;
  const groupStart = prev.parallel_group ? prior.filter((p) => p.parallel_group === prev.parallel_group && p.started_at) : [prev];
  const end = Math.max(...groupStart.map((p) => Date.parse(p.started_at as string) + (p.latency_ms ?? 0)));
  return new Date(end).toISOString();
}

export interface Bar {
  node: TraceNode;
  /** 0–100 offset and width of the bar on the shared time axis. */
  left: number;
  width: number;
  /** Bracket marker for nodes that ran in parallel. */
  group: { first: boolean; last: boolean } | null;
}

export interface TraceTotals {
  wallMs: number;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  cached: number;
  done: number;
}

export function totals(nodes: readonly TraceNode[]): TraceTotals {
  const timed = nodes.filter((n) => n.started_at && n.latency_ms !== null);
  const start = Math.min(...timed.map((n) => Date.parse(n.started_at as string)));
  const end = Math.max(...timed.map((n) => Date.parse(n.started_at as string) + (n.latency_ms as number)));
  return {
    wallMs: timed.length ? end - start : 0,
    llmCalls: nodes.filter((n) => n.model_id && n.status === "done" && n.latency_ms !== 0).length,
    tokensIn: nodes.reduce((s, n) => s + n.tokens_in, 0),
    tokensOut: nodes.reduce((s, n) => s + n.tokens_out, 0),
    cached: nodes.filter((n) => n.cached).length,
    done: nodes.filter((n) => n.status === "done").length,
  };
}

/** Minimum visible bar (in %) so 20 ms code nodes still show as a tick. */
export const MIN_BAR = 0.6;
/** A running node has no duration yet: a short pulsing block at its start. */
export const RUNNING_BAR = 3;

export function layoutBars(nodes: readonly TraceNode[]): Bar[] {
  const timed = nodes.filter((n) => n.started_at);
  if (timed.length === 0) return nodes.map((node) => ({ node, left: 0, width: 0, group: null }));
  const t0 = Math.min(...timed.map((n) => Date.parse(n.started_at as string)));
  const tEnd = Math.max(...timed.map((n) => Date.parse(n.started_at as string) + (n.latency_ms ?? 0)));
  const span = Math.max(1, tEnd - t0);
  return nodes.map((node, i) => {
    const prev = nodes[i - 1];
    const next = nodes[i + 1];
    const g = node.parallel_group;
    const group = g ? { first: prev?.parallel_group !== g, last: next?.parallel_group !== g } : null;
    if (!node.started_at) return { node, left: 100, width: 0, group };
    const left = ((Date.parse(node.started_at) - t0) / span) * 100;
    const width = node.latency_ms === null ? RUNNING_BAR : Math.max(MIN_BAR, (node.latency_ms / span) * 100);
    const w = Math.min(width, 100);
    return { node, left: Math.max(0, Math.min(left, 100 - w)), width: w, group };
  });
}

/** Has the node finished (done or skipped)? Sections wait for their node while a run is live. */
export function nodeSettled(nodes: readonly TraceNode[], node: NodeName): boolean {
  const n = nodes.find((x) => x.node === node);
  return !n || n.status === "done" || n.status === "skipped" || n.status === "failed";
}
