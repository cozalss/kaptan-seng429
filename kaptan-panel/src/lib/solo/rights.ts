import { can, deniedReason } from "@/lib/auth/permissions";
import { ROLE_LABEL, type Role } from "@/lib/domain/role-meta";
import type { KillReset } from "@/lib/domain/trading";

/**
 * What the person on /benim may press. Single-user mode: everything (one person signs both
 * steps, the backend audits the waiver). Multi-user mode (any team member who switched to the
 * personal view): the same permission table as the full desk — an order still needs its second
 * signature from the Risk Sorumlusu, and a restart still takes two people.
 */
export interface SoloRights {
  /** Onayla / Geç on a suggestion. */
  decide: boolean;
  /** Why the buttons are closed (null when open). */
  decideWhy: string | null;
  /** The plain line under each AL/SAT card in multi-user mode (null in single-user mode). */
  signLine: string | null;
  stop: boolean;
  stopWhy: string | null;
  /** The restart step this person may take: both at once, one of the two, or none. */
  restart: "both" | "start" | "confirm" | null;
  restartWhy: string | null;
}

export interface RightsInput {
  singleUser: boolean;
  role: Role;
  uid: string;
  reset: KillReset | null;
}

const ALL: SoloRights = { decide: true, decideWhy: null, signLine: null, stop: true, stopWhy: null, restart: "both", restartWhy: null };

export function soloRights({ singleUser, role, uid, reset }: RightsInput): SoloRights {
  if (singleUser) return ALL;
  const decide = can(role, "proposal.decide");
  const stop = can(role, "kill.stop");
  return {
    decide,
    decideWhy: decide ? null : deniedReason("proposal.decide", role),
    signLine: decide ? "İkinci imza gerekir: onaylarsan senin adınla atılır." : `İkinci imza gerekir: ${ROLE_LABEL.risk_officer} onaylar.`,
    stop,
    stopWhy: stop ? null : deniedReason("kill.stop", role),
    ...restartStep(role, uid, reset),
  };
}

function restartStep(role: Role, uid: string, reset: KillReset | null): Pick<SoloRights, "restart" | "restartWhy"> {
  const started = reset?.started ?? null;
  if (!started) {
    if (can(role, "kill.reset_start")) return { restart: "start", restartWhy: null };
    return { restart: null, restartWhy: `Yeniden başlatmayı ${ROLE_LABEL.admin} başlatır, ${ROLE_LABEL.risk_officer} onaylar.` };
  }
  if (!can(role, "kill.reset_confirm")) return { restart: null, restartWhy: `${started.name} yeniden başlatmayı istedi; ${ROLE_LABEL.risk_officer} onayı bekleniyor.` };
  if (started.uid === uid) return { restart: null, restartWhy: "Başlatan kişi onaylayamaz; ikinci kişi gerekir." };
  return { restart: "confirm", restartWhy: null };
}
