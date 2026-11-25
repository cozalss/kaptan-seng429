import { describe, expect, it } from "vitest";
import { todayWords } from "./today-words";

const base = { started: true, decisions: 0, holds: 0, steps: 0, mine: 0 };

describe("todayWords", () => {
  it("puts the decisions first and adds the person's own disclosures", () => {
    expect(todayWords({ ...base, decisions: 6, holds: 2, mine: 4 })).toEqual({ headline: "Bugün 6 kararın var.", detail: "4 öneri, 2 “tut” sorusu. Hisselerinde 4 önemli duyuru da var." });
    expect(todayWords({ ...base, decisions: 1, mine: 0 })).toEqual({ headline: "Bugün 1 kararın var.", detail: "Hisselerinde önemli bir duyuru yok." });
    expect(todayWords({ ...base, decisions: 2, mine: null })).toEqual({ headline: "Bugün 2 kararın var.", detail: null });
  });

  it("says the bank step before anything else", () => {
    expect(todayWords({ ...base, decisions: 5, steps: 1 }).headline).toBe("Önce bu işlemi bankana gir, sonra 5 kararın var.");
    expect(todayWords({ ...base, steps: 2 }).headline).toBe("Bankana girmen gereken 2 işlem var.");
  });

  it("answers a quiet day about the person's own companies", () => {
    expect(todayWords({ ...base, mine: 3 })).toEqual({ headline: "Senin hisselerinde bugün 3 önemli duyuru var.", detail: "Senden bekleyen bir karar yok." });
    expect(todayWords(base).headline).toBe("Senin hisselerinde bugün önemli bir şey yok.");
    expect(todayWords({ ...base, mine: null })).toEqual({ headline: "Bugün karar vermen gereken bir şey yok.", detail: null });
  });

  it("greets a new install without claiming anything", () => {
    expect(todayWords({ ...base, started: false }).headline).toBe("Paran hazır, KAPtan okuyor.");
  });
});
