import { soloRights } from "./rights";

const started = { uid: "u-admin", name: "Üye 4", role: "admin" as const, at: "2027-01-11T10:00:00+03:00", reason: "Sebep geçti, yeniden." };

describe("what the personal view lets you press", () => {
  it("opens everything in single-user mode", () => {
    const r = soloRights({ singleUser: true, role: "auditor", uid: "u", reset: null });
    expect(r).toMatchObject({ decide: true, stop: true, restart: "both", signLine: null });
  });

  it("lets the Risk Sorumlusu sign the second signature and stop", () => {
    const r = soloRights({ singleUser: false, role: "risk_officer", uid: "u-risk", reset: null });
    expect(r.decide).toBe(true);
    expect(r.signLine).toMatch(/İkinci imza gerekir/);
    expect(r.stop).toBe(true);
    expect(r.restart).toBeNull();
    expect(r.restartWhy).toMatch(/Yönetici başlatır/);
  });

  it("keeps the Denetçi read-only with the plain reason", () => {
    const r = soloRights({ singleUser: false, role: "auditor", uid: "u-aud", reset: null });
    expect(r.decide).toBe(false);
    expect(r.decideWhy).toMatch(/Denetçi yalnızca bakar/);
    expect(r.signLine).toMatch(/Risk Sorumlusu onaylar/);
    expect(r.stop).toBe(false);
    expect(r.stopWhy).toMatch(/Denetçi yalnızca bakar/);
  });

  it("splits the restart between two people", () => {
    expect(soloRights({ singleUser: false, role: "admin", uid: "u-admin", reset: { started: null } }).restart).toBe("start");
    expect(soloRights({ singleUser: false, role: "admin", uid: "u-admin", reset: { started } }).restartWhy).toMatch(/onayı bekleniyor/);
    expect(soloRights({ singleUser: false, role: "risk_officer", uid: "u-risk", reset: { started } }).restart).toBe("confirm");
    expect(soloRights({ singleUser: false, role: "risk_officer", uid: "u-admin", reset: { started } }).restartWhy).toMatch(/ikinci kişi/);
  });
});
