"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IS_MOCK } from "@/lib/api/config";
import { useApi } from "@/lib/api/react";
import { errorMessage, type KaptanApi } from "@/lib/api/types";
import { can } from "@/lib/auth/permissions";
import { canAccessPath } from "@/lib/auth/routes";
import { useSession } from "@/lib/auth/session-context";
import { ROLE_LABEL } from "@/lib/domain/user";
import { switchRole } from "@/components/shell/session-actions";
import { notify } from "@/components/ui/toast";
import { DEMO_STEPS, routePath, type DemoAction, type DemoStep } from "./demo-steps";
import { demoStore, nextStep, setAutoplay } from "./demo-store";

/**
 * Plays one step: switch role (mock only) → run a "before" action → navigate → run an
 * "after" action. Each stage waits for the app to catch up (new session, new path), so a
 * step can be re-entered, skipped back to or resumed after a reload.
 */
export type Phase = "role" | "pre" | "nav" | "post" | "done";

export interface RunnerStatus {
  phase: Phase;
  busy: string | null;
  error: string | null;
  /** http mode cannot switch roles: the presenter must use the right tab. */
  roleMismatch: boolean;
}

export function stepRoute(step: DemoStep, nonce: number): string {
  // A fresh value per entry so /audit re-runs the verification when the step is replayed.
  return step.route.replace(/dogrula=([a-z]+)/, (_m, v: string) => `dogrula=${v}-${nonce}`);
}

export async function runAction(api: KaptanApi, a: DemoAction, role: Parameters<typeof can>[0]): Promise<string | null> {
  if (a.kind === "inject") {
    await api.injectDemo(a.scenario);
    return "DEMO FİKSTÜRÜ enjekte edildi";
  }
  if (a.kind === "tamper") {
    if (!can(role, "demo_inject")) return null;
    const s = await api.auditStatus();
    if (s.tamper_on !== a.on) await api.setTamper(a.on);
    return a.on ? "Kurcalama testi açık" : null;
  }
  if (a.kind === "reset") return runReset(api, a.stage);
  // The injected run needs a few seconds to reach the queue (interrupt): wait for it.
  for (let i = 0; i < 24; i += 1) {
    const pending = await api.listApprovals("pending");
    if (pending.some((c) => c.proposal_id === a.proposal)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await api.decideApproval(a.proposal, {
    decision: "approve",
    approved_notional_try: null,
    comment: "Rehberli demo: kanıt, şüpheci ve kurallar incelendi; onay.",
    totp: "000000",
  });
  return "Onay verildi";
}

/** Still on the step entry that started this work? */
const isCurrent = (nonce: number) => demoStore.get().active && demoStore.get().nonce === nonce;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Backup for steps 4b/4c. Idempotent: if the presenter already pressed the screen's own
 * button, nothing happens twice. The request waits for the loss simulation to trip the
 * kill switch (it takes ~8 s after injection).
 */
async function runReset(api: KaptanApi, stage: "request" | "confirm"): Promise<string | null> {
  let risk = await api.riskStatus();
  for (let i = 0; i < 24 && risk.kill_switch !== "on"; i += 1) {
    await sleep(500);
    risk = await api.riskStatus();
  }
  if (risk.kill_switch !== "on") return null;
  if (stage === "request") {
    if (risk.reset_request) return null;
    await api.requestKillReset({ reason: "Rehberli demo: zarar incelendi, eşikler değişmedi.", totp: "000000" });
    return "Sıfırlama başlatıldı (1/2)";
  }
  const req = risk.reset_request;
  if (!req) return null;
  await api.confirmKillReset({ request_id: req.id, comment: "İkinci göz: onaylıyorum.", totp: "000000" });
  return "Reset onaylandı (2/2)";
}

export function useDemoRunner() {
  const s = useSyncExternalStore(demoStore.subscribe, demoStore.get, demoStore.server);
  const user = useSession();
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const step = DEMO_STEPS[s.index] as DemoStep;
  const [status, setStatus] = useState<RunnerStatus & { nonce: number }>({ nonce: -1, phase: "done", busy: null, error: null, roleMismatch: false });
  const running = useRef<string | null>(null);

  const needsRole = Boolean(step.role && step.role !== user.role);

  // Stage 0: a new entry (nonce) starts the step.
  useEffect(() => {
    if (!s.active || status.nonce === s.nonce) return;
    const roleMismatch = needsRole && !IS_MOCK;
    const id = setTimeout(() => setStatus({ nonce: s.nonce, phase: needsRole && IS_MOCK ? "role" : "pre", busy: null, error: null, roleMismatch }), 0);
    return () => clearTimeout(id);
  }, [s.active, s.nonce, status.nonce, needsRole]);

  // Every stage is bound to the entry (nonce) that started it: a slow action from a step the
  // presenter already left must not move the new step's state machine.
  const advance = useCallback(
    (nonce: number, phase: Phase, patch: Partial<RunnerStatus> = {}) => setStatus((st) => (st.nonce === nonce ? { ...st, phase, ...patch } : st)),
    [],
  );

  // Stage 1: role switch (mock), then wait for the new session to arrive.
  useEffect(() => {
    if (!s.active || status.nonce !== s.nonce || status.phase !== "role") return;
    const key = `role:${s.nonce}`;
    const n = s.nonce;
    if (!needsRole) {
      const id = setTimeout(() => advance(n, "pre", { busy: null }), 0);
      return () => clearTimeout(id);
    }
    if (running.current === key || !step.role) return;
    running.current = key;
    const role = step.role;
    void (async () => {
      advance(n, "role", { busy: `Rol: ${ROLE_LABEL[role]}` });
      const r = await switchRole(role, pathname).catch(() => ({ ok: false, next: pathname }));
      if (!r.ok) {
        advance(n, "pre", { busy: null, error: "Rol değiştirilemedi; oturum süresi dolmuş olabilir." });
        return;
      }
      if (!canAccessPath(role, pathname)) router.push(stepRoute(step, s.nonce));
      router.refresh();
    })();
  }, [s.active, s.nonce, status.nonce, status.phase, needsRole, step, pathname, router, advance]);

  // Stage 2: "before" action, then navigate.
  useEffect(() => {
    if (!s.active || status.nonce !== s.nonce || status.phase !== "pre") return;
    const key = `pre:${s.nonce}`;
    const n = s.nonce;
    if (running.current === key) return;
    running.current = key;
    void (async () => {
      const a = step.action;
      if (a?.when === "before" && !status.roleMismatch) {
        advance(n, "pre", { busy: "Hazırlanıyor…" });
        try {
          const msg = await runAction(api, a, user.role);
          if (msg) notify.info(msg, `Adım ${step.id} · ${step.title}`);
        } catch (e) {
          advance(n, "pre", { error: errorMessage(e) });
        }
      }
      if (!isCurrent(n)) return;
      advance(n, "nav", { busy: null });
      router.push(stepRoute(step, n));
    })();
  }, [s.active, s.nonce, status.nonce, status.phase, status.roleMismatch, step, api, user.role, router, advance]);

  // Stage 3: arrived → "after" action (mock events land on the live screen).
  useEffect(() => {
    if (!s.active || status.nonce !== s.nonce || status.phase !== "nav" || pathname !== routePath(step.route)) return;
    const key = `post:${s.nonce}`;
    const n = s.nonce;
    if (running.current === key) return;
    running.current = key;
    void (async () => {
      const a = step.action;
      if (a?.when === "after" && !status.roleMismatch) {
        advance(n, "post", { busy: "Senaryo enjekte ediliyor…" });
        try {
          await runAction(api, a, user.role);
          notify.info(`Senaryo: ${step.title}`, "DEMO FİKSTÜRÜ enjekte edildi.");
        } catch (e) {
          advance(n, "done", { busy: null, error: errorMessage(e) });
          return;
        }
      }
      advance(n, "done", { busy: null });
    })();
  }, [s.active, s.nonce, status.nonce, status.phase, status.roleMismatch, pathname, step, api, user.role, advance]);

  /** Manual action button (2f "Yedek: otomatik onayla", 4b/4c reset backups). */
  const runManual = useCallback(async () => {
    const a = step.action;
    if (!a || a.when !== "manual") return false;
    const n = s.nonce;
    const waiting = a.kind === "approve" ? "Öneri kuyruğa düşünce onaylanacak…" : "Kill switch bekleniyor…";
    advance(n, status.phase, { busy: waiting, error: null });
    try {
      const msg = await runAction(api, a, user.role);
      advance(n, "done", { busy: null });
      if (a.kind === "approve") notify.success("Öneri onaylandı", "SimBIST'e gönderildi; dolum birkaç saniye içinde.");
      else if (msg) notify.success(msg, `Adım ${step.id} · ${step.title}`);
      return true;
    } catch (e) {
      advance(n, "done", { busy: null, error: errorMessage(e) });
      return false;
    }
  }, [step, api, user.role, advance, status.phase, s.nonce]);

  // Autoplay (offline fallback replay): dwell, run manual actions, advance.
  useEffect(() => {
    if (!s.active || !s.autoplay || status.nonce !== s.nonce || status.phase !== "done") return;
    const id = setTimeout(async () => {
      if (step.action?.when === "manual") await runManual();
      if (!nextStep()) setAutoplay(false);
    }, step.seconds * 1000);
    return () => clearTimeout(id);
  }, [s.active, s.autoplay, s.nonce, status.nonce, status.phase, step, runManual]);

  return { state: s, step, status: status.nonce === s.nonce ? status : { ...status, phase: "role" as Phase, busy: "Hazırlanıyor…", error: null }, runManual, roleNow: user.role };
}
