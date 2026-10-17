import { NODE_LABELS, NodeName } from "@/lib/domain";
import { memberByUid, ROLE_LABEL } from "@/lib/domain/user";

const SYSTEM_NAMES: Readonly<Record<string, string>> = {
  kap_poller: "KAP okuyucu",
  simbist: "KAPtan hesabı borsası (SimBIST)",
  risk_monitor: "Risk izleyici",
  order_ticket: "Fiş yazıcı",
  scheduler: "Zamanlayıcı",
  nightly_verify: "Gece doğrulaması",
  restrictions_sync: "Tedbir listesi",
};

/** Crew members whose plain name reads better than the pipeline label. */
const NODE_NAMES: Readonly<Partial<Record<string, string>>> = {
  request_approval: "Öneri yazıcı",
};

/** Who did it, in words, as two parts: the name and what they are ("Üye 3", "Risk Sorumlusu"). */
export function actorParts(actor: string | null | undefined): { name: string; kind: string } {
  if (!actor) return { name: "—", kind: "" };
  const member = memberByUid(actor);
  if (member) return { name: member.name, kind: ROLE_LABEL[member.role] };
  if (actor.startsWith("user:")) return { name: actor.slice(5), kind: "Kullanıcı" };
  if (actor.startsWith("agent:")) {
    const id = actor.slice(6);
    const node = NodeName.safeParse(id);
    return { name: NODE_NAMES[id] ?? (node.success ? NODE_LABELS[node.data].tr : id), kind: "Tayfa" };
  }
  if (actor.startsWith("system:")) return { name: SYSTEM_NAMES[actor.slice(7)] ?? actor.slice(7), kind: "Sistem" };
  return { name: actor, kind: "" };
}

/**
 * Who did it, in one string, for audit actors and `decided_by` values:
 * "uye-3" → "Üye 3 (Risk Sorumlusu)", "agent:skeptic" → "Şüpheci", "system:risk_monitor" → "Risk izleyici".
 */
export function actorName(actor: string | null | undefined): string {
  const p = actorParts(actor);
  return memberByUid(actor) ? `${p.name} (${p.kind})` : p.name;
}
