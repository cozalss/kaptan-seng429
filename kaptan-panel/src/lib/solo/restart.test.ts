import type { RiskStatus } from "@/lib/domain";
import type { KaptanApi } from "@/lib/api/types";
import { isWaiting, requestRestart } from "./restart";

const NOW = "2027-01-11T10:00:00.000Z";
const LATER = "2027-01-18T10:00:00.000Z";
const started = { uid: "sen", name: "Deniz", at: NOW, reason: "yeniden başlat" };

function risk(reset: RiskStatus["reset"]): RiskStatus {
  return { as_of: NOW, kill_switch: reset ? "on" : "off", reset } as RiskStatus;
}

function fakeApi(afterStart: RiskStatus, afterConfirm: RiskStatus = risk(null)) {
  const startKillReset = vi.fn(async () => afterStart);
  const confirmKillReset = vi.fn(async () => afterConfirm);
  return { api: { startKillReset, confirmKillReset } as unknown as KaptanApi, startKillReset, confirmKillReset };
}

describe("isWaiting", () => {
  it("is false when the confirm has no opening time or it has passed", () => {
    expect(isWaiting(risk({ started, ready_at: null }))).toBe(false);
    expect(isWaiting(risk({ started, ready_at: "2027-01-10T10:00:00.000Z" }))).toBe(false);
  });

  it("is true while the opening time is ahead of the server's clock", () => {
    expect(isWaiting(risk({ started, ready_at: LATER }))).toBe(true);
  });
});

describe("requestRestart", () => {
  it("asks and confirms in one go when nothing makes it wait", async () => {
    const { api, startKillReset, confirmKillReset } = fakeApi(risk({ started, ready_at: null }));
    const after = await requestRestart(api, risk({ started: null, ready_at: null }), "neden");
    expect(startKillReset).toHaveBeenCalledWith({ reason: "neden" });
    expect(confirmKillReset).toHaveBeenCalledWith({ reason: "neden" });
    expect(after.kill_switch).toBe("off");
  });

  it("stops after asking while the wait runs (real data)", async () => {
    const waiting = risk({ started, ready_at: LATER });
    const { api, confirmKillReset } = fakeApi(waiting);
    await expect(requestRestart(api, risk({ started: null, ready_at: null }), "neden")).resolves.toBe(waiting);
    expect(confirmKillReset).not.toHaveBeenCalled();
  });

  it("only confirms when the request was made earlier and the wait is over", async () => {
    const { api, startKillReset, confirmKillReset } = fakeApi(risk(null));
    await requestRestart(api, risk({ started, ready_at: "2027-01-10T10:00:00.000Z" }), "neden");
    expect(startKillReset).not.toHaveBeenCalled();
    expect(confirmKillReset).toHaveBeenCalledOnce();
  });

  it("lets a refused confirm (409) reach the caller with its message", async () => {
    const { api, confirmKillReset } = fakeApi(risk({ started, ready_at: null }));
    confirmKillReset.mockRejectedValueOnce(new Error("Henüz açılmadı."));
    await expect(requestRestart(api, risk({ started, ready_at: null }), "neden")).rejects.toThrow("Henüz açılmadı.");
  });
});
