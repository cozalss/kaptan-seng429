import type { KaptanApi } from "@/lib/api/types";
import { isApiError } from "@/lib/api/types";
import { requestVerify } from "@/components/audit/chain-walk";
import type { DemoAction } from "./demo-steps";

/**
 * What a guided-demo step does to the desk. Every action is idempotent: if the presenter
 * already pressed the screen's own button, the backup does nothing twice.
 */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll `ok()` every `every` ms until it holds or `timeout` passes; returns whether it held. */
export async function until(ok: () => boolean | Promise<boolean>, timeout = 4_000, every = 50): Promise<boolean> {
  const end = Date.now() + timeout;
  for (;;) {
    if (await ok()) return true;
    if (Date.now() >= end) return false;
    await sleep(every);
  }
}

export interface ActionEnv {
  /** Wait for things that take real time in the mock (a run, the loss simulation). */
  patience?: number;
}

export async function runAction(api: KaptanApi, a: DemoAction, env: ActionEnv = {}): Promise<string | null> {
  const patience = env.patience ?? 12_000;
  switch (a.kind) {
    case "reset":
      await api.resetDemo();
      return "Gün baştan başladı.";
    case "inject":
      await api.injectDemo(a.scenario);
      return null;
    case "await_proposal":
      await until(async () => (await api.listApprovals("all")).some((c) => c.proposal_id === a.proposal), patience, 400);
      return null;
    case "tamper": {
      const page = await api.auditList({ scope: "today", limit: 1 });
      if (page.tamper_on !== a.on) await api.setTamper(a.on);
      return null;
    }
    case "verify":
      requestVerify();
      return null;
    case "approve": {
      await until(async () => (await api.listApprovals("pending")).some((c) => c.proposal_id === a.proposal), patience, 400);
      const card = (await api.listApprovals("all")).find((c) => c.proposal_id === a.proposal);
      if (!card || card.status !== "pending") return null;
      await api.decideApproval(a.proposal, { decision: "approve", approved_notional_try: null, comment: "Rehberli tur: kanıt, şüpheci ve kurallar okundu." });
      return "İmzalandı (2/2).";
    }
    case "reset_start": {
      const on = await until(async () => (await api.riskStatus()).kill_switch === "on", patience, 400);
      const risk = await api.riskStatus();
      if (!on || risk.reset?.started) return null;
      await api.startKillReset({ reason: "Zarar incelendi; eşikler değişmedi, yeniden başlatılabilir." });
      return "Yeniden başlatma başlatıldı (1/2).";
    }
    case "reset_confirm": {
      const risk = await api.riskStatus();
      if (risk.kill_switch !== "on" || !risk.reset?.started) return null;
      await api.confirmKillReset({ reason: "İkinci imza: inceledim, onaylıyorum." });
      return "Yeniden başlatıldı (2/2).";
    }
    case "limit_propose": {
      const view = await api.limits();
      if (view.pending) return null;
      try {
        await api.proposeLimit({ key: "risk_per_trade_pct", value: 0.004, reason: "Oynaklık arttı; işlem başına riski biraz azaltalım." });
      } catch (e) {
        if (isApiError(e) && e.code === "no_change") return null;
        throw e;
      }
      return "Değişiklik önerildi (1/2).";
    }
    case "limit_approve": {
      const view = await api.limits();
      if (!view.pending) return null;
      await api.decideLimit(view.pending.version, { decision: "approve", comment: "" });
      return "Sınır değişikliği onaylandı (2/2).";
    }
  }
}
