import { NODE_LABELS, NodeName, OWNER } from "@/lib/domain";

/**
 * Who did it, in words, for audit actors and `decided_by` values: "user:sen" / "sen" → "Sen",
 * "agent:skeptic" → "Şüpheci", "system:risk_monitor" → "Otomatik (risk izleyici)".
 */
export function actorName(actor: string | null | undefined): string {
  if (!actor) return "—";
  if (actor === OWNER.uid || actor === `user:${OWNER.uid}`) return OWNER.name;
  if (actor.startsWith("user:")) return actor.slice(5);
  if (actor.startsWith("agent:")) {
    const node = NodeName.safeParse(actor.slice(6));
    return node.success ? NODE_LABELS[node.data].tr : actor.slice(6);
  }
  if (actor.startsWith("system:risk_monitor")) return "Otomatik (risk izleyici)";
  if (actor.startsWith("system:")) return `Sistem (${actor.slice(7)})`;
  return actor;
}
