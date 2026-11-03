import type { Suggestion } from "@/lib/solo/overview";
import {
  bringToFront,
  closedFor,
  EMPTY_DECIDE,
  failAnswer,
  holdMs,
  pressAnswer,
  sectionSentence,
  settleAnswer,
  splitDecisions,
  stepFor,
  SEAL_MS,
} from "./decide-logic";

const s = (id: string, action: Suggestion["action"] = "al"): Suggestion => ({ id, symbol: id.toUpperCase(), action, reason_short: "Bir sebep.", confidence: 0.6, expires_at: null });
const list = [s("a"), s("b"), s("c")];

describe("answering a suggestion", () => {
  it("takes the object out of the queue at once and shows the next one first", () => {
    const pressed = pressAnswer(EMPTY_DECIDE, list[0] as Suggestion, "skip");
    const view = splitDecisions(list, pressed);
    expect(view.front?.id).toBe("b");
    expect(view.queue.map((x) => x.id)).toEqual(["c"]);
    expect(pressed.flights[0]).toMatchObject({ id: "a", answer: "skip", phase: "sending" });
  });

  it("ignores a second press on an object already on its way", () => {
    const once = pressAnswer(EMPTY_DECIDE, list[0] as Suggestion, "approve");
    expect(pressAnswer(once, list[0] as Suggestion, "skip")).toBe(once);
  });

  it("lets the person answer the next one while the first is still sending", () => {
    const two = pressAnswer(pressAnswer(EMPTY_DECIDE, list[0] as Suggestion, "approve"), list[1] as Suggestion, "skip");
    expect(two.flights.map((f) => f.id)).toEqual(["a", "b"]);
    expect(splitDecisions(list, two).front?.id).toBe("c");
  });

  it("clears an old error when the same object is pressed again", () => {
    const failed = failAnswer(pressAnswer(EMPTY_DECIDE, list[0] as Suggestion, "approve"), "a", "Olmadı.");
    expect(failed.errors).toEqual({ a: "Olmadı." });
    expect(pressAnswer(failed, list[0] as Suggestion, "approve").errors).toEqual({});
  });

  it("marks the answer done without touching the others", () => {
    const two = pressAnswer(pressAnswer(EMPTY_DECIDE, list[0] as Suggestion, "approve"), list[1] as Suggestion, "skip");
    const done = settleAnswer(two, "a");
    expect(done.flights.map((f) => f.phase)).toEqual(["done", "sending"]);
    // Never mutates what it was given.
    expect(two.flights.map((f) => f.phase)).toEqual(["sending", "sending"]);
  });
});

describe("a failed answer comes back", () => {
  it("returns to the front of the queue with its error in plain words", () => {
    const pressed = pressAnswer(EMPTY_DECIDE, list[1] as Suggestion, "approve");
    expect(splitDecisions(list, pressed).front?.id).toBe("a");
    const failed = failAnswer(pressed, "b", "Bu öneri zaten karara bağlandı ya da süresi doldu.");
    const view = splitDecisions(list, failed);
    expect(failed.flights).toEqual([]);
    expect(view.front?.id).toBe("b");
    expect(view.queue.map((x) => x.id)).toEqual(["a", "c"]);
    expect(failed.errors.b).toBe("Bu öneri zaten karara bağlandı ya da süresi doldu.");
  });
});

describe("the queue stays reachable", () => {
  it("brings any waiting suggestion to the front, keeping the others in order", () => {
    const view = splitDecisions(list, bringToFront(EMPTY_DECIDE, "c"));
    expect(view.front?.id).toBe("c");
    expect(view.queue.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("falls back to the first when the chosen one has gone", () => {
    expect(splitDecisions([s("a")], bringToFront(EMPTY_DECIDE, "yok")).front?.id).toBe("a");
    expect(splitDecisions([], EMPTY_DECIDE).front).toBeNull();
  });
});

describe("what comes after the seal", () => {
  const ticket = { ticket_no: "T-1" };

  it("stays sealed until the server has answered and the press has landed", () => {
    expect(stepFor({ action: "al", answer: "approve", phase: "sending" }, { landed: true, ticket: null })).toEqual({ kind: "sealing" });
    expect(stepFor({ action: "al", answer: "approve", phase: "done" }, { landed: false, ticket })).toEqual({ kind: "sealing" });
  });

  it("an approved AL or SAT turns into what to enter at the bank", () => {
    expect(stepFor({ action: "al", answer: "approve", phase: "done" }, { landed: true, ticket })).toEqual({ kind: "enter", ticket });
    expect(stepFor({ action: "sat", answer: "approve", phase: "done" }, { landed: true, ticket })).toEqual({ kind: "enter", ticket });
  });

  it("says the details are coming while the ticket has not arrived: never a silent nothing", () => {
    expect(stepFor({ action: "al", answer: "approve", phase: "done" }, { landed: true, ticket: null })).toEqual({ kind: "preparing" });
  });

  it("a TUT is just a line: nothing to enter", () => {
    expect(stepFor({ action: "tut", answer: "approve", phase: "done" }, { landed: true, ticket: null })).toEqual({ kind: "line" });
  });

  it("a Geç leaves nothing behind", () => {
    expect(stepFor({ action: "al", answer: "skip", phase: "done" }, { landed: true, ticket: null })).toEqual({ kind: "gone" });
    expect(stepFor({ action: "al", answer: "skip", phase: "sending" }, { landed: false, ticket: null })).toEqual({ kind: "gone" });
  });
});

describe("reduced motion", () => {
  it("does not wait for the press to land", () => {
    expect(holdMs(true)).toBe(0);
    expect(holdMs(false)).toBe(SEAL_MS);
  });

  it("the whole signature stays under 600 ms with the reveal", () => {
    expect(SEAL_MS).toBeLessThanOrEqual(400);
  });
});

describe("closed buttons say why", () => {
  it("closes both while everything is stopped", () => {
    expect(closedFor({ stopped: true, halted: false })).toEqual({
      canApprove: false,
      canSkip: false,
      reason: "İşlemler durduruldu. Yeniden başlatana kadar öneri onaylanamaz; elindeki hisseler yerinde duruyor.",
    });
  });

  it("keeps Geç open on a day the money fell too far", () => {
    expect(closedFor({ stopped: false, halted: true })).toEqual({
      canApprove: false,
      canSkip: true,
      reason: "Paran bugün %1'den fazla düştüğü için bugün yeni işlem yok. Yarın kendiliğinden açılır; istersen geçebilirsin.",
    });
  });

  it("is open otherwise", () => {
    expect(closedFor({ stopped: false, halted: false })).toEqual({ canApprove: true, canSkip: true, reason: null });
    expect(closedFor({ stopped: true, halted: true }).canSkip).toBe(false);
  });
});

describe("the section's sentence", () => {
  it("says what to do now, the bank first because it has a clock", () => {
    expect(sectionSentence({ decisions: 3, steps: 0, stopped: false })).toBe("Bugün 3 kararın var.");
    expect(sectionSentence({ decisions: 1, steps: 0, stopped: false })).toBe("Bugün 1 kararın var.");
    expect(sectionSentence({ decisions: 2, steps: 1, stopped: false })).toBe("Önce bu işlemi bankana gir, sonra 2 kararın var.");
    expect(sectionSentence({ decisions: 2, steps: 3, stopped: false })).toBe("Önce bu 3 işlemi bankana gir, sonra 2 kararın var.");
    expect(sectionSentence({ decisions: 0, steps: 2, stopped: false })).toBe("Bankana girmen gereken 2 işlem var.");
    expect(sectionSentence({ decisions: 0, steps: 1, stopped: false })).toBe("Bankana girmen gereken bir işlem var.");
    expect(sectionSentence({ decisions: 0, steps: 0, stopped: false })).toBe("Bugün karar vermen gereken bir şey yok.");
  });

  it("says the stop first", () => {
    expect(sectionSentence({ decisions: 2, steps: 0, stopped: true })).toBe("İşlemler durdu; şimdilik karar yok.");
  });
});
