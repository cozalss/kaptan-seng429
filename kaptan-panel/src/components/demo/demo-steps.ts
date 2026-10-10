import type { Role } from "@/lib/domain/user";
import { DEMO_E3_PROPOSAL, type DemoScenario } from "@/mocks/ids";

/**
 * The guided demo (11-demo-senaryosu §2): six acts, each a few steps. A step names the screen,
 * the role whose eyes we look through (switched automatically), what happens on arrival and
 * one line for the presenter. Manual steps are pressed in the screen; the bar offers a backup.
 */
export type DemoAction =
  /** Start from a clean demo day (Yönetici). */
  | { kind: "reset"; when: "before"; as: Role }
  | { kind: "inject"; scenario: DemoScenario; when: "after" }
  | { kind: "await_proposal"; proposal: string; when: "before" }
  | { kind: "tamper"; on: boolean; when: "before"; as?: Role }
  | { kind: "verify"; when: "after" }
  | { kind: "approve"; proposal: string; when: "manual" }
  | { kind: "reset_start"; when: "manual" }
  | { kind: "reset_confirm"; when: "manual" }
  | { kind: "limit_propose"; when: "manual" }
  | { kind: "limit_approve"; when: "manual" };

export interface DemoStep {
  id: string;
  act: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  route: string;
  /** Whose eyes; null keeps the current role. */
  role: Role | null;
  actions?: readonly DemoAction[];
  note: string;
}

const E3 = `/oneri/${DEMO_E3_PROPOSAL}`;

export const ACT_TITLES: Readonly<Record<DemoStep["act"], string>> = {
  1: "Canlı akış",
  2: "Sözleşme → iki imza",
  3: "Saldırı ve tedbir",
  4: "Durdur, defter, sınırlar",
  5: "Sonuçlar",
  6: "Kişisel mod",
};

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "1",
    act: 1,
    title: "Bugün, Analist gözüyle",
    route: "/bugun",
    role: "analyst",
    actions: [{ kind: "reset", when: "before", as: "admin" }],
    note: "Tayfa bugün 200’den fazla bildirim okudu; çoğu yapay zekâya hiç gitmeden elendi. Analist okur, not ekler.",
  },
  {
    id: "2a",
    act: 2,
    title: "Yönetici sözleşme senaryosunu ekler",
    route: "/bugun",
    role: "admin",
    actions: [{ kind: "inject", scenario: "e3_contract", when: "after" }],
    note: "ÖRNEK ENERJİ yıllık gelirinin %18’i kadar iş aldı. Konu belli değil; Sınıflandırıcı devreye giriyor, kart birkaç saniyede belirir.",
  },
  {
    id: "2b",
    act: 2,
    title: "Analist okur ama imzalayamaz",
    route: E3,
    role: "analyst",
    actions: [{ kind: "await_proposal", proposal: DEMO_E3_PROPOSAL, when: "before" }],
    note: "23 benzer olay, şüpheci tutarı yarıya indirdi. Onayla kapalı ve nedeni yazıyor: “Bunu Risk Sorumlusu yapar.”",
  },
  {
    id: "2c",
    act: 2,
    title: "Risk Sorumlusu imzalar (2/2)",
    route: E3,
    role: "risk_officer",
    actions: [{ kind: "approve", proposal: DEMO_E3_PROPOSAL, when: "manual" }],
    note: "Kurallar ilk imzayı attı; ikinci imza bir insanın. Onayla’ya bas: damga rol adı ve saatle düşer, emir fişi çıkar.",
  },
  {
    id: "3a",
    act: 3,
    title: "Gizli talimat yakalanır",
    route: "/denetim",
    role: "admin",
    actions: [{ kind: "inject", scenario: "redteam_injection", when: "after" }],
    note: "Bildirime “önceki talimatları yok say” saklanmış. Uyum yakalar, öneri çıkmaz; birkaç saniyede deftere yazılır.",
  },
  {
    id: "3b",
    act: 3,
    title: "Tedbirli hisse baştan reddedilir",
    route: "/denetim",
    role: null,
    actions: [{ kind: "inject", scenario: "restricted_r04", when: "after" }],
    note: "SPK tedbiri olan hisse: kurallar yapay zekâya sormadan reddeder (R04). Pazarlık yok.",
  },
  {
    id: "4a",
    act: 4,
    title: "Zarar: −%1’de durur, −%5’te her şey durur",
    route: "/portfoy",
    role: "admin",
    actions: [{ kind: "inject", scenario: "loss_simulation", when: "after" }],
    note: "Portföy adım adım düşer. Günlük −%1’de yeni emir durur; zirveden −%5’te risk izleyici her şeyi durdurur, pozisyon satmaz.",
  },
  {
    id: "4b",
    act: 4,
    title: "Yönetici yeniden başlatmayı başlatır (1/2)",
    route: "/portfoy",
    role: "admin",
    actions: [{ kind: "reset_start", when: "manual" }],
    note: "Tek kişi sistemi geri açamaz. Yönetici başlatır, kısa bir gerekçe yazar: birinci imza.",
  },
  {
    id: "4c",
    act: 4,
    title: "Risk Sorumlusu onaylar (2/2)",
    route: "/portfoy",
    role: "risk_officer",
    actions: [{ kind: "reset_confirm", when: "manual" }],
    note: "Başka bir kişi, Risk Sorumlusu, onaylar: ikinci imza. Sistem yeniden çalışır.",
  },
  {
    id: "4d",
    act: 4,
    title: "Defter doğrulanır: zincir sağlam",
    route: "/denetim",
    role: "admin",
    actions: [
      { kind: "tamper", on: false, when: "before" },
      { kind: "verify", when: "after" },
    ],
    note: "Her kayıt bir öncekinin özetini taşır. Baştan sona yürüyoruz: hiçbir kayıt sonradan değişmemiş.",
  },
  {
    id: "4e",
    act: 4,
    title: "Kurcalama testi: zincir kırılır",
    route: "/denetim",
    role: "admin",
    actions: [
      { kind: "tamper", on: true, when: "before" },
      { kind: "verify", when: "after" },
    ],
    note: "Verideki tek bir kayıt arkadan değişti. Doğrulama tam orada durur: “Kayıt #3.907’de zincir kırık”.",
  },
  {
    id: "4f",
    act: 4,
    title: "Sınır değişikliği: Yönetici önerir (1/2)",
    route: "/ayarlar",
    role: "admin",
    actions: [
      { kind: "tamper", on: false, when: "before" },
      { kind: "limit_propose", when: "manual" },
    ],
    note: "Eşikler sabit; değiştirmek iki imza ister. Yönetici işlem başına riski %0,5’ten %0,4’e indirmeyi önerir.",
  },
  {
    id: "4g",
    act: 4,
    title: "Risk Sorumlusu onaylar (2/2)",
    route: "/ayarlar",
    role: "risk_officer",
    actions: [{ kind: "limit_approve", when: "manual" }],
    note: "Öneren onaylayamaz; ikinci imza Risk Sorumlusu’ndan gelir. Yeni sürüm yürürlüğe girer, eskisi geçmişte kalır.",
  },
  {
    id: "5",
    act: 5,
    title: "Denetçi gözüyle: sonuçlar",
    route: "/portfoy",
    role: "auditor",
    note: "Paper sonuçları örnek değerdir; ana kanıt slayttaki holdout testi. Denetçi her şeyi görür, hiçbir düğme ona açık değildir.",
  },
  {
    id: "6",
    act: 6,
    title: "Emir fişi: son butona insan basar",
    route: E3,
    role: "risk_officer",
    note: "Aynı kod kişisel modda emir fişi hazırlar; fiş aracı kuruma elle girilir. “Son butona yine ben basıyorum.”",
  },
];

export function clampIndex(i: number, steps: readonly unknown[] = DEMO_STEPS): number {
  return Math.min(Math.max(0, Math.trunc(i)), steps.length - 1);
}

/** Path part of a route (what usePathname() reports once we have arrived). */
export function routePath(route: string): string {
  return route.split(/[?#]/)[0] ?? route;
}

/** The manual action of a step and the label of its backup button, if any. */
export function manualAction(step: DemoStep): { action: DemoAction; label: string } | null {
  const a = step.actions?.find((x) => x.when === "manual");
  if (!a) return null;
  const label: Partial<Record<DemoAction["kind"], string>> = {
    approve: "Yedek: imzala",
    reset_start: "Yedek: başlat (1/2)",
    reset_confirm: "Yedek: onayla (2/2)",
    limit_propose: "Yedek: öner (1/2)",
    limit_approve: "Yedek: onayla (2/2)",
  };
  return { action: a, label: label[a.kind] ?? "Yedek" };
}

/** Steps in an act and this step's place in it ("Perde 2 · 1/3"). */
export function actPosition(index: number, steps: readonly DemoStep[] = DEMO_STEPS): { act: DemoStep["act"]; n: number; of: number } {
  const step = steps[clampIndex(index, steps)] as DemoStep;
  const inAct = steps.filter((s) => s.act === step.act);
  return { act: step.act, n: inAct.indexOf(step) + 1, of: inAct.length };
}
