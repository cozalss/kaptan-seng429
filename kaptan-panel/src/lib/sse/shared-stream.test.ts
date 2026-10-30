import { openStreamCount, subscribeShared } from "./shared-stream";

class FakeEventSource {
  static made: FakeEventSource[] = [];
  readonly listeners = new Map<string, (ev: MessageEvent<string>) => void>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.made.push(this);
  }
  addEventListener(name: string, fn: (ev: MessageEvent<string>) => void) {
    this.listeners.set(name, fn);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.made = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ticket: "t" }), { status: 200 })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("one EventSource per stream for the whole tab", () => {
  it("shares the connection, fans messages out (repaired), and closes after the last listener", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const status = vi.fn();
    const offA = subscribeShared("desk", ["ticket"], { onMessage: a, onStatus: status });
    const offB = subscribeShared("desk", ["ticket"], { onMessage: b, onStatus: () => undefined });
    await vi.waitFor(() => expect(FakeEventSource.made).toHaveLength(1));
    const es = FakeEventSource.made[0]!;
    expect(es.url).toContain("/api/v1/stream/desk?ticket=t");
    es.onopen?.();
    expect(status).toHaveBeenLastCalledWith("open");

    es.listeners.get("ticket")?.({ data: JSON.stringify({ company: "TUKAÅ\udc9e" }), lastEventId: "7" } as MessageEvent<string>);
    expect(a).toHaveBeenCalledWith({ id: "7", event: "ticket", data: { company: "TUKAŞ" } });
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    offB();
    expect(es.closed).toBe(false); // lingers across a route change
    vi.advanceTimersByTime(2_500);
    expect(es.closed).toBe(true);
    expect(openStreamCount()).toBe(0);
  });
});
