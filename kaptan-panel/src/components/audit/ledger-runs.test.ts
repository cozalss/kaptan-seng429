import type { AuditEntry } from "@/lib/domain";
import { groupRuns, runMeta } from "./ledger-runs";
import { shouldPaint, walkProgress } from "./chain-walk";

const at = (pos: number, actor: string, action: string, hhmm: string): AuditEntry => ({
  seq: pos,
  chain_pos: pos,
  occurred_at: `2027-01-11T${hhmm}:00.000Z`,
  actor,
  action,
  entity_type: "disclosure",
  entity_id: String(pos),
  run_id: null,
  strategy_version: null,
  payload: {},
  prev_hash: "00",
  hash: "a".repeat(64),
});
const read = (pos: number, hhmm: string) => at(pos, "system:kap_poller", "disclosure.ingested", hhmm);

describe("groupRuns", () => {
  it("folds consecutive KAP okuyucu fetches into one run and leaves everything else alone", () => {
    // Newest first, as the ledger lists them.
    const entries = [read(10, "05:38"), read(9, "05:00"), read(8, "04:30"), at(7, "user:uye-3", "approval.decided", "04:20"), read(6, "04:10"), at(5, "agent:classifier", "classification.done", "04:00"), read(4, "03:50"), read(3, "03:22")];
    const before = [...entries];
    const rows = groupRuns(entries);
    expect(entries).toEqual(before);
    expect(rows.map((r) => (r.kind === "one" ? r.entry.chain_pos : r.entries.map((e) => e.chain_pos)))).toEqual([[10, 9, 8], 7, 6, 5, [4, 3]]);
  });

  it("never folds a person's acts, even when they repeat", () => {
    const sign = (pos: number) => at(pos, "user:uye-3", "disclosure.ingested", "09:00");
    expect(groupRuns([sign(2), sign(1)]).every((r) => r.kind === "one")).toBe(true);
    expect(groupRuns([])).toEqual([]);
  });

  it("says the span a run covers, oldest first", () => {
    expect(runMeta([read(4802, "05:38"), read(4785, "03:22")], (iso) => iso.slice(11, 16))).toBe("03:22–05:38 · #4.785–#4.802");
    expect(runMeta([])).toBe("");
  });
});

describe("chain walk pacing", () => {
  it("counts up to the target with an ease-out and stops there", () => {
    expect(walkProgress(0, 4_812)).toBe(0);
    expect(walkProgress(700, 4_812)).toBeGreaterThan(2_406);
    expect(walkProgress(5_000, 4_812)).toBe(4_812);
  });

  it("repaints at most every 33 ms and 1/120 of the way, always on the last record", () => {
    expect(shouldPaint(100, 0, 4_812, 20)).toBe(false);
    expect(shouldPaint(10, 0, 4_812, 40)).toBe(false);
    expect(shouldPaint(100, 0, 4_812, 40)).toBe(true);
    expect(shouldPaint(4_812, 4_800, 4_812, 1)).toBe(true);
  });
});
