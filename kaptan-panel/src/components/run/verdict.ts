import { orderStatusView } from "@/components/ui/order-status";
import type { Explain, NodeName, TraceNode } from "@/lib/domain";
import { EVENT_LABEL, NODE_LABELS, RISK_RULES } from "@/lib/domain";
import { fmtInt, fmtPct, fmtPrice } from "@/lib/format";
import { fmtScore, riskCodeOf, splitReason } from "./labels";

/**
 * The one-sentence verdict and the path a jury reads in seconds (FRONTEND-SPEC §2.4,
 * 11 §2): "Bildirim → ön eleme → 6 ajan → kural → risk kapısı → insan onayı → dolum".
 * Everything here is rebuilt from the run's own records; no number is invented.
 */
export type StageState = "pass" | "stop" | "veto" | "wait" | "running" | "pending" | "skip";

export interface Stage {
  key: "disclosure" | "pregate" | "agents" | "rules" | "risk" | "approval" | "fill";
  label: string;
  state: StageState;
  note: string;
  anchor: string;
}

export type VerdictTone = "ok" | "wait" | "veto" | "stop" | "neutral" | "live";

export interface Verdict {
  tone: VerdictTone;
  stamp: string;
  sentence: string;
  stages: Stage[];
}

const AGENT_NODES: readonly NodeName[] = ["classifier", "reader", "materiality", "evidence", "skeptic", "compliance"];

const STAGE_OF: Partial<Record<NodeName, Stage["key"]>> = {
  route: "pregate",
  pre_gate: "pregate",
  guard: "pregate",
  classifier: "agents",
  reader: "agents",
  materiality: "agents",
  evidence: "agents",
  skeptic: "agents",
  compliance: "agents",
  merge: "rules",
  rule_engine: "rules",
  risk_gate: "risk",
  request_approval: "approval",
  approval: "approval",
  execute: "fill",
};

const STAGE_KEYS: readonly Stage["key"][] = ["disclosure", "pregate", "agents", "rules", "risk", "approval", "fill"];
const STAGE_META: Readonly<Record<Stage["key"], { label: string; anchor: string }>> = {
  disclosure: { label: "Bildirim", anchor: "bildirim" },
  pregate: { label: "Ön eleme", anchor: "on-eleme" },
  agents: { label: "6 ajan", anchor: "siniflandirma" },
  rules: { label: "Kural", anchor: "kural" },
  risk: { label: "Risk kapısı", anchor: "risk" },
  approval: { label: "İnsan onayı", anchor: "onay" },
  fill: { label: "Dolum", anchor: "emir" },
};

function stage(key: Stage["key"], state: StageState, note: string): Stage {
  return { key, state, note, ...STAGE_META[key] };
}

/** Agents that actually ran (done) out of the six. */
export function agentsRan(nodes: readonly TraceNode[]): number {
  return AGENT_NODES.filter((n) => nodes.some((t) => t.node === n && t.status === "done")).length;
}

/** First node that is running (or the first waiting one after the last done). */
export function currentNode(nodes: readonly TraceNode[]): TraceNode | null {
  return nodes.find((n) => n.status === "running") ?? nodes.find((n) => n.status === "waiting") ?? null;
}

function liveStages(e: Explain): Stage[] {
  const nodes = e.trace.nodes;
  const cur = currentNode(nodes);
  const curStage = cur ? STAGE_OF[cur.node] : undefined;
  const curIdx = curStage ? STAGE_KEYS.indexOf(curStage) : 1;
  return STAGE_KEYS.map((k, i) => {
    if (k === "disclosure") return stage(k, "pass", `idx ${e.disclosure.disclosure_index}`);
    if (i < curIdx) return stage(k, "pass", "tamam");
    if (i === curIdx) return stage(k, "running", cur ? `${NODE_LABELS[cur.node].tr}…` : "…");
    return stage(k, "pending", "sırada");
  });
}

function firstFailedRule(e: Explain): string | null {
  const f = e.rule_decision?.trace.find((t) => !t.passed);
  return f ? f.detail_tr : null;
}

function preGateReason(e: Explain): { code: string | null; text: string } {
  const first = e.pre_gate?.reasons.find((r) => splitReason(r).code) ?? e.pre_gate?.reasons[0] ?? "";
  return splitReason(first);
}

function approvalStage(e: Explain): Stage {
  const a = e.approval;
  if (!a) return stage("approval", "pending", "ulaşılmadı");
  switch (a.status) {
    case "approved":
      return stage("approval", "pass", a.approved_notional_try ? "küçültülerek onaylandı" : "onaylandı");
    case "rejected":
      return stage("approval", "veto", "reddedildi");
    case "expired":
      return stage("approval", "stop", "süresi doldu (09:50)");
    case "cancelled":
      return stage("approval", "stop", "iptal (kill switch)");
    default:
      return stage("approval", "wait", "onay bekliyor");
  }
}

function fillStage(e: Explain): Stage {
  const fill = e.fills[0];
  if (fill) return stage("fill", "pass", `${fmtInt(fill.qty)} lot @ ${fmtPrice(fill.price)}`);
  const order = e.orders[0];
  if (order) return stage("fill", order.status === "canceled" || order.status === "rejected" ? "stop" : "wait", order.status === "pending_open" || order.status === "accepted" ? "emir gönderildi" : orderStatusView(order).label.toLocaleLowerCase("tr-TR"));
  return stage("fill", "pending", "—");
}

function proposeVerdict(e: Explain): Verdict {
  const ev = e.classifier?.event_type ?? e.run.event_type;
  const code = ev ? EVENT_LABEL[ev].code : "Kural";
  const mult = e.skeptic?.size_multiplier ?? 1;
  const p = e.proposal;
  const a = e.approval;
  const lots = p ? `${fmtInt(p.requested_qty)} lot @ ${fmtPrice(p.limit_price)}` : "öneri";
  const skepticPart = mult < 1 ? `Şüpheci büyüklüğü ×${String(mult).replace(".", ",")} küçülttü; ` : "";
  const head = `${e.disclosure.company_name}: ${e.disclosure.summary}. ${code} kuralı geçti; ${skepticPart}risk kapısı geçti.`;
  const stages: Stage[] = [
    stage("disclosure", "pass", `idx ${e.disclosure.disclosure_index}`),
    stage("pregate", "pass", "R03 · R04 · R13 ✓"),
    stage("agents", "pass", `${agentsRan(e.trace.nodes)}/6 çalıştı`),
    stage("rules", "pass", `${code} ✓`),
    stage("risk", e.risk_checks.some((r) => r.outcome === "reject") ? "veto" : "pass", `R01–R16 · ${e.risk_checks.filter((r) => r.outcome === "pass").length} geçti`),
    approvalStage(e),
    fillStage(e),
  ];
  const fill = e.fills[0];
  if (a?.status === "approved") {
    const tail = fill ? ` Onaylandı ve ${fmtInt(fill.qty)} lot @ ${fmtPrice(fill.price)} dolum aldı (SimBIST, sanal).` : " Onaylandı; emir gönderildi.";
    return { tone: "ok", stamp: fill ? "Öneri · onaylandı · dolum" : "Öneri · onaylandı", sentence: head + tail, stages };
  }
  if (a?.status === "rejected") return { tone: "veto", stamp: "Öneri · Risk Officer reddetti", sentence: `${head} Risk Officer reddetti.`, stages };
  if (a?.status === "expired") return { tone: "stop", stamp: "Öneri · süresi doldu", sentence: `${head} Onay 09:50'ye kadar verilmedi; öneri düştü.`, stages };
  if (a?.status === "cancelled") return { tone: "veto", stamp: "Öneri · kill switch iptal etti", sentence: `${head} Kill switch açıldığı için öneri iptal edildi.`, stages };
  return { tone: "wait", stamp: "Öneri · onay bekliyor", sentence: `${head} ${lots} öneri Risk Officer onayı bekliyor.`, stages };
}

/** Build the verdict for any run (pure). */
export function buildVerdict(e: Explain): Verdict {
  const run = e.run;
  if (run.status === "running") {
    const cur = currentNode(e.trace.nodes);
    return {
      tone: "live",
      stamp: "Canlı · graf çalışıyor",
      sentence: `${e.disclosure.company_name} bildirimi işleniyor: ${cur ? NODE_LABELS[cur.node].tr : "başlıyor"} düğümü çalışıyor. Her düğüm bittikçe bölümler dolar.`,
      stages: liveStages(e),
    };
  }

  const base = (k: Stage["key"], s: StageState, n: string) => stage(k, s, n);
  const pending = (from: number): Stage[] => STAGE_KEYS.slice(from).map((k) => base(k, "pending", "ulaşılmadı"));

  if (run.outcome === "PREGATE_VETO") {
    const r = preGateReason(e);
    const rc = riskCodeOf(r.code);
    const rule = rc ? `${rc} · ${RISK_RULES[rc as keyof typeof RISK_RULES]?.label_tr ?? ""}` : "ön eleme";
    return {
      tone: "veto",
      stamp: `Sert veto · ${rc ?? "ön eleme"} · LLM çağrısı ${run.llm_calls}`,
      sentence: `${e.disclosure.company_name} ön elemede durduruldu: ${(r.text || rule).replace(/\s*\([a-z_]+\)/g, "")}. Hiçbir ajan çalışmadı; LLM çağrısı ${run.llm_calls}, emir yok.`,
      stages: [base("disclosure", "pass", `idx ${e.disclosure.disclosure_index}`), base("pregate", "veto", rule), ...pending(2)],
    };
  }

  if (run.outcome === "QUARANTINED") {
    const score = e.guard ? fmtScore(e.guard.injection_score) : "—";
    const comp = e.compliance?.decision === "veto" ? " Uyum RET verdi;" : "";
    return {
      tone: "veto",
      stamp: "Karantina · kural motoruna ulaşmadı",
      sentence: `Bildirim metninde modele yönelik gizli talimat bulundu (Prompt Guard ${score}). Koruma karantinaya aldı;${comp} kural motoruna ulaşmadı, emir üretilmedi.`,
      stages: [
        base("disclosure", "pass", `idx ${e.disclosure.disclosure_index}`),
        base("pregate", "veto", `Guard ${score} · karantina`),
        base("agents", "skip", e.compliance ? "yalnızca Uyum → RET" : "çalışmadı"),
        ...pending(3),
      ],
    };
  }

  if (run.status === "hold_quota") {
    return {
      tone: "stop",
      stamp: "Kota bitti · HOLD",
      sentence: "LLM kotası ve yedek model zinciri tükendi; karar güvenli varsayılan HOLD oldu. Emir üretilmedi.",
      stages: [base("disclosure", "pass", `idx ${e.disclosure.disclosure_index}`), base("pregate", "pass", "geçti"), base("agents", "stop", "kota bitti"), ...pending(3)],
    };
  }

  if (run.status === "failed") {
    const f = e.trace.nodes.find((n) => n.status === "failed");
    return {
      tone: "stop",
      stamp: "Hata · HOLD",
      sentence: `${f ? NODE_LABELS[f.node].tr : "Bir"} düğümü hata verdi; karar güvenli varsayılan HOLD oldu. Emir üretilmedi.`,
      stages: [base("disclosure", "pass", `idx ${e.disclosure.disclosure_index}`), base("pregate", "pass", "geçti"), base("agents", "stop", "hata"), ...pending(3)],
    };
  }

  if (run.outcome === "PROPOSE") return proposeVerdict(e);

  const outOfScope = !e.rule_decision && (e.classifier?.event_type === "IGNORE" || e.classifier?.event_type === "FILTER");
  if (!outOfScope && (run.outcome === "NO_TRADE" || run.outcome === "HOLD")) {
    const ev = e.classifier?.event_type ?? run.event_type;
    const code = ev ? EVENT_LABEL[ev].code : "Kural";
    const why = firstFailedRule(e) ?? "Kural şartı sağlanmadı.";
    const veto = e.skeptic?.veto ? " Şüpheci veto bayrağı kaldırdı." : "";
    const isHold = run.outcome === "HOLD";
    return {
      tone: "stop",
      stamp: isHold ? "HOLD · güvenli varsayılan" : `İşlem yok · ${code} kuralı sağlanmadı`,
      sentence: `${e.disclosure.company_name}: ${e.disclosure.summary}. ${why}${veto} ${isHold ? "Karar HOLD; emir üretilmedi." : "İşlem yok."}`,
      stages: [
        base("disclosure", "pass", `idx ${e.disclosure.disclosure_index}`),
        base("pregate", "pass", "geçti"),
        base("agents", "pass", `${agentsRan(e.trace.nodes)}/6 çalıştı`),
        base("rules", "stop", isHold ? "HOLD" : `${code} ✗`),
        ...pending(4),
      ],
    };
  }

  // Archived: classified out of scope (O · Diğer / X), no trading path.
  const cls = e.classifier ? `${EVENT_LABEL[e.classifier.event_type].code} · ${EVENT_LABEL[e.classifier.event_type].tr}` : "kapsam dışı";
  return {
    tone: "neutral",
    stamp: "Arşivlendi · kapsam dışı",
    sentence: `${e.disclosure.company_name}: ${e.disclosure.summary}. Sınıflandırıcı “${cls}” dedi${e.classifier ? ` (güven ${fmtScore(e.classifier.confidence)})` : ""}; E1–E4 kapsamı dışında, arşivlendi.`,
    stages: [base("disclosure", "pass", `idx ${e.disclosure.disclosure_index}`), base("pregate", "pass", "geçti"), base("agents", "skip", "kapsam dışı"), ...pending(3)],
  };
}

/** The 1–3 numbers the run is about (shown as Bodoni stats). */
export interface KeyFact {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "north" | "wash" | "muted";
}

export function keyFacts(e: Explain): KeyFact[] {
  const facts: KeyFact[] = [];
  if (e.run.outcome === "PREGATE_VETO") {
    facts.push({ label: "LLM çağrısı", value: String(e.run.llm_calls), hint: "hiçbir ajan çalışmadı", tone: "north" });
    facts.push({ label: "Ön eleme süresi", value: `${fmtInt(e.run.latency_ms)}`, hint: "milisaniye" });
    return facts;
  }
  if (e.run.outcome === "QUARANTINED" && e.guard) {
    facts.push({ label: "Prompt Guard skoru", value: fmtScore(e.guard.injection_score), hint: "karantina eşiği 0,90", tone: "north" });
    facts.push({ label: "Regex eşleşmesi", value: String(e.guard.regex_hits.length), hint: "Türkçe talimat kalıbı" });
    return facts;
  }
  if (e.classifier) facts.push({ label: "Sınıflandırma güveni", value: fmtScore(e.classifier.confidence), hint: `eşik 0,80 · ${EVENT_LABEL[e.classifier.event_type].code}` });
  const ratio = e.merged?.amount_to_revenue_annualized ?? e.merged?.amount_to_mcap ?? null;
  if (ratio !== null && ratio !== undefined && ratio > 0.001) facts.push({ label: e.merged?.amount_to_mcap ? "Tutar / piyasa değeri" : "Tutar / yıllık gelir", value: fmtPct(ratio, 1), hint: "Birleştirme, Decimal" });
  if (e.evidence_card) facts.push({ label: "Benzer olay", value: String(e.evidence_card.stats.n), hint: "kanıt kartı · örnek değer" });
  if (e.proposal && facts.length < 4) facts.push({ label: "Önerilen", value: fmtInt(e.proposal.requested_qty), hint: `lot @ ${fmtPrice(e.proposal.limit_price)}` });
  return facts.slice(0, 4);
}
