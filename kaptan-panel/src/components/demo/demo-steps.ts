import type { Role } from "@/lib/domain/user";
import { DEMO_E3_PROPOSAL, DEMO_E3_RUN, DEMO_INJ_RUN, DEMO_R04_RUN, type DemoScenario } from "@/mocks/ids";

/**
 * The 5-minute final demo (11-demo-senaryosu §2, FRONTEND-SPEC §7) as data. Each step names
 * the screen, the role that drives it (the demo starts as Risk Officer; Admin injects,
 * resets and runs the tamper test), the mock event it triggers and a one-line presenter note.
 */
export type DemoAction =
  | { kind: "inject"; scenario: DemoScenario; when: "after" }
  | { kind: "tamper"; on: boolean; when: "before" }
  | { kind: "approve"; proposal: string; when: "manual" }
  /** Kill switch reset, four eyes: Admin requests (1/2), Risk Officer confirms (2/2). */
  | { kind: "reset"; stage: "request" | "confirm"; when: "manual" };

/** Label of the rail's backup button for a manual action (the presenter normally clicks in the screen). */
export function manualLabel(a: DemoAction | undefined): string | null {
  if (!a || a.when !== "manual") return null;
  if (a.kind === "approve") return "Yedek: otomatik onayla";
  if (a.kind === "reset") return a.stage === "request" ? "Yedek: sıfırlamayı başlat" : "Yedek: sıfırlamayı onayla";
  return null;
}

export interface DemoStep {
  id: string;
  act: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  /** Planned slot in the 5-minute script. */
  window: string;
  /** Path (may carry ?query or #hash). */
  route: string;
  /** Role that must be signed in for this step; null keeps the current one. */
  role: Role | null;
  action?: DemoAction;
  note: string;
  /** Seconds this step gets in autoplay (fallback replay). */
  seconds: number;
}

const E3 = `/runs/${DEMO_E3_RUN}`;

export const DEMO_STEPS: readonly DemoStep[] = [
  { id: "1", act: 1, title: "Canlı akış ve sayaçlar", window: "0:00–0:40", route: "/inbox", role: "risk_officer", seconds: 26, note: "Bildirimlerin çoğu LLM'e hiç gitmiyor: devre kesici ve kapsam dışı konular deterministik eleniyor." },
  { id: "2a", act: 2, title: "E3 sözleşme bildirimi düşer", window: "0:40", route: "/inbox", role: "admin", action: { kind: "inject", scenario: "e3_contract", when: "after" }, seconds: 12, note: "Konu “Özel Durum Açıklaması (Genel)”: tip belli değil, bu yüzden Sınıflandırıcı devreye giriyor." },
  { id: "2b", act: 2, title: "Ajan grafı ve birleştirme", window: "0:55", route: E3, role: null, seconds: 18, note: "Okuyucu, Önemlilik ve Kanıt paralel çalışır; oranı LLM değil, Birleştirme düğümü hesaplar." },
  { id: "2c", act: 2, title: "Kanıt kartı", window: "1:15", route: `${E3}#kanit`, role: null, seconds: 14, note: "23 benzer olay, ortalama +%1,4, isabet %61: sayıları kod hesaplıyor, LLM uydurmuyor." },
  { id: "2d", act: 2, title: "Şüpheci notu", window: "1:30", route: `${E3}#supheci`, role: null, seconds: 12, note: "Bildirimden önce 2 seansta +%3,6 hareket: şüpheci pozisyonu yarıya indiriyor." },
  { id: "2e", act: 2, title: "Kural, uyum ve risk kapısı", window: "1:42", route: `${E3}#kural`, role: null, seconds: 18, note: "Al kararını Python kuralı veriyor; risk kapısı öneriyi yalnızca küçültür ya da reddeder." },
  { id: "2f", act: 2, title: "Onay ve paper dolum", window: "2:00", route: `/approvals?oneri=${DEMO_E3_PROPOSAL}`, role: "risk_officer", action: { kind: "approve", proposal: DEMO_E3_PROPOSAL, when: "manual" }, seconds: 22, note: "Onayla, yorum, 000000: SimBIST dolumu 1.240 lot @ 48,32. Onaysız hiçbir emir çıkmaz." },
  { id: "2g", act: 2, title: "Ajan izi", window: "2:22", route: `${E3}#iz`, role: null, seconds: 8, note: "Her düğümün süresi, token'ı ve modeli: kararın izi buradan okunur." },
  { id: "3a", act: 3, title: "Red-team: gizli talimat", window: "2:30", route: `/runs/${DEMO_INJ_RUN}`, role: "admin", action: { kind: "inject", scenario: "redteam_injection", when: "after" }, seconds: 26, note: "Prompt Guard 0,98, Türkçe kalıp ve Uyum RET: kural motoruna ulaşmadı. LLM'in emir yetkisi zaten yok." },
  { id: "3b", act: 3, title: "Tedbirli hisse", window: "3:00", route: `/runs/${DEMO_R04_RUN}`, role: null, action: { kind: "inject", scenario: "restricted_r04", when: "after" }, seconds: 25, note: "Hisse tedbirli: ön elemede sert veto (R04), LLM çağrısı 0. Pazarlık yok." },
  { id: "4a", act: 4, title: "Zarar simülasyonu", window: "3:30", route: "/portfolio", role: null, action: { kind: "inject", scenario: "loss_simulation", when: "after" }, seconds: 15, note: "−%1'de yeni emir durur; −%5'te kill switch açık emirleri iptal eder, pozisyonları satmaz." },
  { id: "4b", act: 4, title: "Sıfırlama 1/2 (Admin)", window: "3:45", route: "/portfolio", role: "admin", action: { kind: "reset", stage: "request", when: "manual" }, seconds: 8, note: "Admin sıfırlamayı başlatır: tek kişi sıfırlayamaz (1/2)." },
  { id: "4c", act: 4, title: "Sıfırlama 2/2 (Risk Officer)", window: "3:53", route: "/portfolio", role: "risk_officer", action: { kind: "reset", stage: "confirm", when: "manual" }, seconds: 8, note: "Farklı bir kişi, Risk Officer, onaylar (2/2). Eşikler config'te sabit." },
  { id: "4d", act: 4, title: "Zinciri doğrula", window: "4:01", route: "/audit?dogrula=temiz", role: "admin", action: { kind: "tamper", on: false, when: "before" }, seconds: 10, note: "4.812 kayıt, hash zinciri geçerli: kayıtların sonradan değiştirilmediğini gösterebiliyoruz." },
  { id: "4e", act: 4, title: "Kurcalama testi", window: "4:11", route: "/audit?dogrula=kurcalama", role: "admin", action: { kind: "tamper", on: true, when: "before" }, seconds: 9, note: "Demo veritabanında tek bir kayıt değişti: “Kayıt #3.907'de zincir kırık”." },
  { id: "5", act: 5, title: "Sonuçlar ve ablation", window: "4:20", route: "/eval", role: null, action: { kind: "tamper", on: false, when: "before" }, seconds: 25, note: "Ana kanıt tek koşuluk holdout; buradaki sayılar örnek değer, sonuç ne çıktıysa o gösterilir." },
  { id: "6", act: 6, title: "Kişisel mod: emir fişi", window: "4:50", route: "/portfolio?sekme=fis", role: null, seconds: 10, note: "Aynı kod kişisel modda emir fişi hazırlıyor; son butona yine insan basıyor." },
];

export const DEMO_BUDGET_S = 300;

export const ACT_TITLES: Readonly<Record<DemoStep["act"], string>> = {
  1: "Canlı akış",
  2: "Sözleşme → onay",
  3: "Saldırı ve tedbir",
  4: "Kill switch ve audit",
  5: "Sonuçlar",
  6: "Kişisel mod",
};

export function clampIndex(i: number, steps: readonly unknown[] = DEMO_STEPS): number {
  return Math.min(Math.max(0, i), steps.length - 1);
}

/** Path part of a step route (what usePathname() reports once we have arrived). */
export function routePath(route: string): string {
  return route.split(/[?#]/)[0] ?? route;
}

/** "m:ss" for the presenter clock. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Planned start (seconds) of a step, from its window ("2:30" or "0:40–2:30"). */
export function plannedStart(step: DemoStep): number {
  const m = /^(\d+):(\d{2})/.exec(step.window);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Behind schedule when elapsed time passed the next step's planned start by > 20 s. */
export function isBehind(index: number, elapsedMs: number, steps: readonly DemoStep[] = DEMO_STEPS): boolean {
  const next = steps[index + 1];
  const limit = next ? plannedStart(next) : DEMO_BUDGET_S;
  return elapsedMs / 1000 > limit + 20;
}

export function totalAutoplaySeconds(steps: readonly DemoStep[] = DEMO_STEPS): number {
  return steps.reduce((a, s) => a + s.seconds, 0);
}
