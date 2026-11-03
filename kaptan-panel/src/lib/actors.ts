import { NODE_LABELS, NodeName } from "@/lib/domain";

/** What each part of the system does, in a record's small print (`kind`). */
const SYSTEM_PARTS: Readonly<Record<string, string>> = {
  kap_poller: "bildirim okuma",
  simbist: "işlem kaydı",
  risk_monitor: "para kuralları",
  order_ticket: "işlem bilgisi",
  scheduler: "zamanlayıcı",
  nightly_verify: "gece kontrolü",
  restrictions_sync: "tedbir listesi",
};

/** One person and KAPtan: every record was done by "Sen" or by "KAPtan". */
export const YOU = "Sen";
export const SYSTEM = "KAPtan";

/** Is this actor the person (anything that is not a part of the system)? */
export function isPerson(actor: string | null | undefined): boolean {
  if (!actor) return false;
  return !actor.startsWith("agent:") && !actor.startsWith("system:") && actor !== "auth";
}

/** Who did it, in words, as two parts: "Sen" or "KAPtan", and for KAPtan which part of it. */
export function actorParts(actor: string | null | undefined): { name: string; kind: string } {
  if (!actor) return { name: "—", kind: "" };
  if (isPerson(actor)) return { name: YOU, kind: "" };
  if (actor === "auth") return { name: SYSTEM, kind: "giriş" };
  if (actor.startsWith("agent:")) {
    const node = NodeName.safeParse(actor.slice(6));
    return { name: SYSTEM, kind: node.success ? NODE_LABELS[node.data].tr : "" };
  }
  return { name: SYSTEM, kind: SYSTEM_PARTS[actor.slice(7)] ?? "" };
}

/** Who did it, in one word, for audit actors and `decided_by` values. */
export function actorName(actor: string | null | undefined): string {
  return actorParts(actor).name;
}
