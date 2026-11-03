import { MockDb } from "./db";
import { engageKillSwitch, executeApproved, startLiveTicker, stopAllTimers, stopLiveTicker } from "./scenarios";
import { PENDING_PROPOSALS } from "@/mocks/ids";
import type { BusMessage, StreamKey } from "@/lib/sse/bus";

function recorder(db: MockDb, key: StreamKey) {
  const seen: BusMessage[] = [];
  db.bus.subscribe(key, (m) => seen.push(m));
  return seen;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  vi.useRealTimers();
});

describe("kill switch", () => {
  it("cancels open orders and hands positions to the exit rule", () => {
    const db = new MockDb(null);
    const [p] = PENDING_PROPOSALS;
    db.update((s) => ({
      ...s,
      approvals: { ...s.approvals, [p]: { status: "approved", decided_by: "sen", decided_at: db.nowIso(), decision_comment: "ok", approved_notional_try: null } },
    }));
    executeApproved(db, p);
    engageKillSwitch(db, "user:sen", "Test");
    expect(db.snapshot.canceledOrderIds.length).toBeGreaterThan(0);
    expect(db.snapshot.positionsManagedByExit).toBe(true);
  });
});

describe("live ticker", () => {
  it("releases post-13:40 disclosures one at a time and ignores a second start", () => {
    const db = new MockDb(null);
    const feed = recorder(db, "feed");
    startLiveTicker(db);
    startLiveTicker(db);
    vi.advanceTimersByTime(6_100);
    expect(db.snapshot.releasedLate).toHaveLength(1);
    expect(feed.map((m) => m.event)).toEqual(["disclosure", "counters"]);
    vi.advanceTimersByTime(30_000);
    expect(db.snapshot.releasedLate.length).toBeGreaterThan(1);
  });
});
