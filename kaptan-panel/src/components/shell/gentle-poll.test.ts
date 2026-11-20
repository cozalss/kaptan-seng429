import { startGentlePoll, type PollDoc } from "./gentle-poll";

function fakeDoc(hidden = false) {
  const listeners = new Set<() => void>();
  const doc: PollDoc & { set(hidden: boolean): void } = {
    hidden,
    addEventListener: (_type, fn) => void listeners.add(fn),
    removeEventListener: (_type, fn) => void listeners.delete(fn),
    set(next) {
      doc.hidden = next;
      for (const fn of listeners) fn();
    },
  };
  return doc;
}

const MINUTE = 60_000;

describe("the gentle poll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks at once, then once a minute", async () => {
    const run = vi.fn(async () => undefined);
    const stop = startGentlePoll({ run, everyMs: () => MINUTE, doc: fakeDoc() });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("never stacks: the next minute starts when the answer has arrived", async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const stop = startGentlePoll({ run, everyMs: () => MINUTE, doc: fakeDoc() });
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("pauses while the tab is hidden and asks again when it comes back, if a minute has passed", async () => {
    const doc = fakeDoc();
    const run = vi.fn(async () => undefined);
    const stop = startGentlePoll({ run, everyMs: () => MINUTE, doc });
    await vi.advanceTimersByTimeAsync(0);
    doc.set(true);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(run).toHaveBeenCalledTimes(1);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not ask again on a quick look away and back", async () => {
    const doc = fakeDoc();
    const run = vi.fn(async () => undefined);
    const stop = startGentlePoll({ run, everyMs: () => MINUTE, doc });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20_000);
    doc.set(true);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not start in a hidden tab, and keeps going after a failed answer", async () => {
    const doc = fakeDoc(true);
    const run = vi.fn(async () => {
      throw new Error("down");
    });
    const stop = startGentlePoll({ run, everyMs: () => MINUTE, doc });
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run).not.toHaveBeenCalled();
    doc.set(false);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stops for good", async () => {
    const doc = fakeDoc();
    const run = vi.fn(async () => undefined);
    const stop = startGentlePoll({ run, everyMs: () => MINUTE, doc });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    doc.set(true);
    doc.set(false);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("takes the next wait from the caller, so a failing API can be asked sooner", async () => {
    let wait = MINUTE;
    const run = vi.fn(async () => undefined);
    const stop = startGentlePoll({ run, everyMs: () => wait, doc: fakeDoc() });
    await vi.advanceTimersByTimeAsync(0);
    wait = 15_000;
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });
});
