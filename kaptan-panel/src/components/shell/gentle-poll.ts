/**
 * A poll that is easy on the API: one request at a time (the next wait starts when the answer has
 * arrived, so a slow API never gets a second request on top of the first), nothing while the tab is
 * hidden, and on coming back it asks at once only if a full wait has passed.
 */
export interface PollDoc {
  hidden: boolean;
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
}

export interface GentlePoll {
  /** One request. Its failure is the caller's to record; the poll goes on. */
  run: () => Promise<void>;
  /** The wait before the next request, read after each answer. */
  everyMs: () => number;
  doc?: PollDoc;
}

/** Starts polling; returns the stop. */
export function startGentlePoll({ run, everyMs, doc = document }: GentlePoll): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let stopped = false;
  let lastDoneAt: number | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number) => {
    clear();
    if (stopped || doc.hidden) return;
    timer = setTimeout(() => void tick(), Math.max(0, ms));
  };
  const tick = async () => {
    timer = null;
    if (stopped || inFlight || doc.hidden) return;
    inFlight = true;
    try {
      await run();
    } catch {
      // The caller's `run` records its own failures; the poll only keeps its rhythm.
    } finally {
      inFlight = false;
      lastDoneAt = Date.now();
      schedule(everyMs());
    }
  };
  const onVisibility = () => {
    if (doc.hidden) return clear();
    // An answer still on its way schedules the next one itself.
    if (inFlight) return;
    schedule(lastDoneAt === null ? 0 : everyMs() - (Date.now() - lastDoneAt));
  };

  doc.addEventListener("visibilitychange", onVisibility);
  schedule(0);
  return () => {
    stopped = true;
    clear();
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
