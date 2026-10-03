import type { NodeName, RunTrace, TraceNode } from "@/lib/domain";
import type { RunSpec } from "./run-spec";

interface Models {
  modelLite: string;
  modelOss: string;
}

type Step = { node: NodeName; ms: number; tin?: number; tout?: number; llm?: "lite" | "oss"; group?: string; note?: string };

const FANOUT: Step[] = [
  { node: "reader", ms: 4_100, tin: 3_900, tout: 620, llm: "lite", group: "fanout-1" },
  { node: "materiality", ms: 2_900, tin: 2_100, tout: 310, llm: "lite", group: "fanout-1" },
  { node: "evidence", ms: 5_200, tin: 4_400, tout: 540, llm: "lite", group: "fanout-1" },
];

function stepsFor(spec: RunSpec): Step[] {
  const head: Step[] = [
    { node: "route", ms: 40 },
    { node: "pre_gate", ms: 90, note: spec.kind === "pregate_veto" ? "Sert veto — LLM çağrısı 0" : undefined },
  ];
  if (spec.kind === "pregate_veto") return [...head, { node: "record", ms: 30 }];
  const guard: Step = {
    node: "guard",
    ms: 380,
    note: spec.kind === "quarantine" ? `Prompt Guard ${spec.guardScore.toFixed(2).replace(".", ",")} → karantina` : undefined,
  };
  if (spec.kind === "quarantine") {
    return [...head, guard, { node: "compliance", ms: 1_700, tin: 2_600, tout: 280, llm: "lite", note: "RET" }, { node: "record", ms: 30 }];
  }
  const classifier: Step = { node: "classifier", ms: spec.method === "llm" ? 1_900 : 0, tin: spec.method === "llm" ? 1_800 : 0, tout: 210, llm: "oss" };
  if (spec.kind === "archived") {
    return [...head, guard, classifier, { node: "filter_action", ms: 20 }, { node: "record", ms: 30 }];
  }
  const middle: Step[] = [
    ...FANOUT,
    { node: "merge", ms: 60, note: spec.merge?.amountInText === false ? "Tutar metinde yok ✗" : "Oranlar Decimal ile hesaplandı" },
    { node: "skeptic", ms: 3_300, tin: 3_600, tout: 450, llm: "oss" },
    { node: "rule_engine", ms: 25 },
  ];
  if (spec.kind !== "propose") return [...head, guard, classifier, ...middle, { node: "record", ms: 30 }];
  const tail: Step[] = [
    { node: "compliance", ms: 2_400, tin: 3_100, tout: 390, llm: "lite" },
    { node: "risk_gate", ms: 35 },
    { node: "request_approval", ms: 20 },
    { node: "approval", ms: 0 },
  ];
  if (spec.decision?.status === "approved") tail.push({ node: "execute", ms: 140 }, { node: "record", ms: 30 });
  return [...head, guard, classifier, ...middle, ...tail];
}

export function buildTrace(spec: RunSpec, models: Models): RunTrace {
  const steps = stepsFor(spec);
  let cursor = Date.parse(spec.publishedAtIso) + 21_000;
  let groupStart: number | null = null;
  let groupMax = 0;
  const nodes: TraceNode[] = [];
  steps.forEach((s, i) => {
    const next = steps[i + 1];
    let started = cursor;
    if (s.group) {
      groupStart ??= cursor;
      started = groupStart;
      groupMax = Math.max(groupMax, s.ms);
    }
    const isApprovalWaiting = s.node === "approval" && spec.decision?.status !== "approved";
    const isSkippedClassifier = s.node === "classifier" && spec.method === "subject_map";
    nodes.push({
      node: s.node,
      status: isApprovalWaiting ? (spec.decision?.status === "pending" ? "waiting" : "done") : isSkippedClassifier ? "skipped" : "done",
      started_at: new Date(started).toISOString(),
      latency_ms: isApprovalWaiting ? null : s.ms,
      tokens_in: s.tin ?? 0,
      tokens_out: s.llm ? (s.tout ?? 0) : 0,
      model_id: s.llm === "lite" ? models.modelLite : s.llm === "oss" ? models.modelOss : null,
      prompt_version: s.llm ? `${s.node}@1.1.0` : null,
      cached: spec.is_fixture && Boolean(s.llm),
      parallel_group: s.group ?? null,
      note_tr: isSkippedClassifier ? "Konu alanı tipledi; LLM gerekmedi" : (s.note ?? null),
    });
    if (s.group) {
      if (!next || next.group !== s.group) {
        cursor = (groupStart ?? cursor) + groupMax;
        groupStart = null;
        groupMax = 0;
      }
    } else {
      cursor += s.ms;
    }
  });
  return {
    nodes,
    langsmith_url: null,
  };
}
