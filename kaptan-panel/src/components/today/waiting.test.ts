import type { LimitsView, OrderTicket, RiskStatus } from "@/lib/domain";
import { can as canFor, type Action } from "@/lib/auth/permissions";
import type { Role } from "@/lib/domain/user";
import { waitingItems } from "./waiting";

const as = (role: Role) => (a: Action) => canFor(role, a);
const sig = (uid: string, role: Role) => ({ uid, name: uid, role, at: "2027-01-11T08:00:00.000Z", reason: "neden" });

const NOW = Date.parse("2027-01-11T08:00:00.000Z");
const ticket = (status: OrderTicket["entry"]["status"], validUntil = "2027-01-11T09:00:00.000Z") =>
  ({ entry: { status }, created_at: "2027-01-11T07:50:00.000Z", valid_until: validUntil }) as unknown as OrderTicket;
const limits = { pending: { proposed_by: sig("uye-1", "admin") } } as unknown as LimitsView;
const stoppedWithStart = { kill_switch: "on", reset: { started: sig("uye-1", "admin") } } as unknown as RiskStatus;

describe("Seni bekleyenler", () => {
  it("lists slips, a limit change and a restart for the Risk Sorumlusu", () => {
    const items = waitingItems({ can: as("risk_officer"), uid: "uye-3", tickets: [ticket("awaiting"), ticket("entered")], now: NOW, limits, risk: stoppedWithStart });
    expect(items.map((i) => [i.text, i.place])).toEqual([
      ["1 emir fişi aracı kuruma girilmeyi bekliyor", "Portföy"],
      ["Yönetici bir sınır değişikliği önerdi; ikinci imza senin", "Ayarlar"],
      ["Yeniden başlatma 1/2 imzalı; onay senin", "Portföy"],
    ]);
    expect(items.map((i) => i.href)).toEqual(["/portfoy", "/ayarlar", "/portfoy"]);
  });

  it("shows nothing to roles that cannot act, or to the person who signed first", () => {
    expect(waitingItems({ can: as("auditor"), uid: "uye-4", tickets: [ticket("awaiting")], now: NOW, limits, risk: stoppedWithStart })).toEqual([]);
    expect(waitingItems({ can: as("risk_officer"), uid: "user:uye-1", tickets: [], now: NOW, limits, risk: stoppedWithStart })).toEqual([]);
  });

  it("is empty when nothing waits", () => {
    const running = { kill_switch: "off", reset: null } as unknown as RiskStatus;
    expect(waitingItems({ can: as("risk_officer"), uid: "uye-3", tickets: undefined, now: NOW, limits: undefined, risk: running })).toEqual([]);
    expect(waitingItems({ can: as("risk_officer"), uid: "uye-3", tickets: [ticket("canceled")], now: NOW, limits: undefined, risk: null })).toEqual([]);
  });

  it("counts only the slips Portföy lists: none past their window, none before the clock is known", () => {
    const expired = ticket("awaiting", "2027-01-10T07:10:00.000Z");
    const running = { kill_switch: "off", reset: null } as unknown as RiskStatus;
    const base = { can: as("risk_officer"), uid: "uye-3", limits: undefined, risk: running };
    expect(waitingItems({ ...base, tickets: [expired, expired], now: NOW })).toEqual([]);
    expect(waitingItems({ ...base, tickets: [ticket("awaiting")], now: null })).toEqual([]);
    expect(waitingItems({ ...base, tickets: [expired, ticket("awaiting")], now: NOW }).map((i) => i.text)).toEqual([
      "1 emir fişi aracı kuruma girilmeyi bekliyor",
    ]);
  });
});
