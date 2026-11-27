import { LearningReport } from "@/lib/domain/learning";
import { isApiError } from "../types";
import { MockDb } from "./db";
import { createMockApi } from "./mock-api";
import { stopAllTimers, stopLiveTicker } from "./scenarios";

function setup() {
  const db = new MockDb(null);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

const refused = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  return isApiError(e) ? { status: e.status, code: e.code } : null;
};

describe("mock · Ne öğrendim", () => {
  it("answers a report the zod contract accepts, with four kinds and one applied change", async () => {
    const { api } = setup();
    const r = LearningReport.parse(await api.getLearning());
    expect(r.kinds.map((k) => [k.kind, k.horizon_days])).toEqual([["E1", 20], ["E2", 20], ["E3", 5], ["E4", 5]]);
    expect(r.kinds.every((k) => !k.calibration.active && k.calibration.n_matured < k.calibration.needed)).toBe(true);
    expect(r.changes).toEqual([expect.objectContaining({ rule: "e1_capital_10d_min", status: "applied", can_revert: true })]);
    expect(r.auto_apply).toBe(true);
    expect(r.folds.filter((f) => f.kind === "E1").every((f) => f.error_ratio === null)).toBe(true);
  });

  it("undoes a change once (audited), then refuses it and an unknown version", async () => {
    const { db, api } = setup();
    const after = await api.revertLearningChange(2);
    expect(after.changes[0]).toMatchObject({ status: "reverted", can_revert: false });
    expect(await refused(api.revertLearningChange(2))).toEqual({ status: 409, code: "conflict" });
    expect(await refused(api.revertLearningChange(99))).toEqual({ status: 404, code: "not_found" });
    expect(db.auditChain().map((e) => e.action)).toContain("learn.rule_reverted");
  });

  it("keeps the switch off once turned off", async () => {
    const { api } = setup();
    expect((await api.setLearningSettings({ auto_apply: false })).auto_apply).toBe(false);
    expect((await api.getLearning()).auto_apply).toBe(false);
  });
});
