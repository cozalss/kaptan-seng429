import { approvalExpiry, isTradingDay, istanbulIso, nextTradingDay, tradingDaysBetween } from "./time";
import { fmtInt, fmtPct, fmtSignedPct, fmtTry, shortHash, upperTr } from "./format";
import { appendToChain, GENESIS_PREV_HASH, hashOf, verifyChain } from "./audit-chain";
import type { AuditEntry } from "./domain";

describe("time", () => {
  it("converts Istanbul wall time to UTC", () => {
    expect(istanbulIso("2027-01-11", "13:40")).toBe("2027-01-11T10:40:00.000Z");
  });
  it("skips weekends and holidays", () => {
    expect(isTradingDay("2027-01-11")).toBe(true);
    expect(nextTradingDay("2027-01-08")).toBe("2027-01-11");
    expect(nextTradingDay("2026-12-31")).toBe("2027-01-04");
    expect(tradingDaysBetween("2027-01-08", "2027-01-12").length).toBeGreaterThanOrEqual(2);
  });
  it("expires approvals at 09:50 on the next trading session (Ç-10)", () => {
    expect(approvalExpiry(istanbulIso("2027-01-08", "16:00"))).toBe(istanbulIso("2027-01-11", "09:50"));
  });
});

describe("format (tr-TR)", () => {
  it("formats numbers, money and percentages the Turkish way", () => {
    expect(fmtInt(1016480)).toBe("1.016.480");
    expect(fmtTry(59916)).toMatch(/59\.916/);
    expect(fmtPct(0.18, 0)).toBe("%18");
    expect(fmtSignedPct(-0.011)).toBe("−%1,1");
    expect(fmtSignedPct(0.014)).toBe("+%1,4");
  });
  it("shortens hashes", () => {
    expect(shortHash("abcdef0123456789")).toBe("abcd…6789");
  });
  it("upper-cases with the Turkish dotted I", () => {
    expect(upperTr("işlem")).toBe("İŞLEM");
  });
});

describe("audit hash chain", () => {
  const base = (n: number): AuditEntry[] =>
    appendToChain(
      [],
      Array.from({ length: n }, (_, i) => ({
        occurred_at: `2027-01-11T10:0${i}:00.000Z`,
        actor: "u-risk",
        action: "approval.decided",
        entity_type: "proposal",
        entity_id: `p-${i}`,
        run_id: null,
        strategy_version: null,
        payload: { b: i, a: "x" },
      })),
    );
  const now = "2027-01-11T10:40:00.000Z";

  it("links entries from the genesis hash", () => {
    const chain = base(3);
    expect(chain[0]?.prev_hash).toBe(GENESIS_PREV_HASH);
    expect(chain[1]?.prev_hash).toBe(chain[0]?.hash);
    expect(verifyChain(chain, now)).toMatchObject({ ok: true, checked: 3, head_hash: chain[2]?.hash });
  });
  it("is insensitive to payload key order (canonical JSON)", () => {
    const [e] = base(1) as [AuditEntry];
    expect(hashOf(e.prev_hash, { ...e, payload: { a: "x", b: 0 } })).toBe(e.hash);
  });
  it("detects a tampered payload at the exact position", () => {
    const chain = base(4).map((e) => (e.chain_pos === 3 ? { ...e, payload: { a: "x", b: 99 } } : e));
    expect(verifyChain(chain, now)).toMatchObject({ ok: false, first_bad_pos: 3, kind: "hash_mismatch" });
  });
  it("detects a deleted entry", () => {
    const chain = base(4).filter((e) => e.chain_pos !== 2);
    expect(verifyChain(chain, now)).toMatchObject({ ok: false, kind: "gap_or_duplicate" });
  });
  it("detects an anchor mismatch", () => {
    const r = verifyChain(base(3), now, { at: now, chain_pos: 2, hash: "ff" });
    expect(r).toMatchObject({ ok: false, first_bad_pos: 2, kind: "anchor_mismatch" });
  });
});
