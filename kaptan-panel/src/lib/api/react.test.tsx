import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider, useApi, useApiMutation, useApiQuery } from "./react";
import { createMockApi } from "./mock/mock-api";
import { MockDb, __setMockDb } from "./mock/db";
import { stopAllTimers, stopLiveTicker } from "./mock/scenarios";
import { ApiError, type KaptanApi } from "./types";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { useNow, currentTimeMs } from "@/lib/clock";
import { SessionProvider } from "@/lib/auth/session-context";

const ANALYST = { uid: "u-analist", email: "analist@kaptan.demo", name: "Mert (Analist)", role: "analyst" as const };

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

function apiWith(db: MockDb): KaptanApi {
  return createMockApi({ getActor: () => ({ uid: ANALYST.uid, name: ANALYST.name, role: ANALYST.role }), db, latencyMs: 0, live: false });
}

function Counter() {
  const q = useApiQuery((api) => api.counters());
  if (q.loading) return <p>yükleniyor</p>;
  if (q.error) return <p>hata: {q.error}</p>;
  return (
    <p>
      toplam {q.data?.total} <button onClick={() => void q.refetch()}>yenile</button>
    </p>
  );
}

describe("useApiQuery / useApiMutation", () => {
  it("loads, then refetches without flashing the loading state", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ApiProvider api={apiWith(new MockDb(null))}>
        <Counter />
      </ApiProvider>,
    );
    expect(screen.getByText("yükleniyor")).toBeInTheDocument();
    expect(await screen.findByText(/toplam 212/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "yenile" }));
    expect(screen.queryByText("yükleniyor")).toBeNull();
  });

  it("surfaces the Turkish error message", async () => {
    const failing = { ...apiWith(new MockDb(null)), counters: () => Promise.reject(new ApiError(503, "down", "Servis kapalı.")) } as KaptanApi;
    render(
      <ApiProvider api={failing}>
        <Counter />
      </ApiProvider>,
    );
    expect(await screen.findByText("hata: Servis kapalı.")).toBeInTheDocument();
  });

  it("tracks a mutation and returns undefined on failure", async () => {
    let result: unknown = "unset";
    function Note() {
      const m = useApiMutation((api, body: string) => api.addNote(1, body));
      return (
        <button
          onClick={async () => {
            result = await m.run("x");
          }}
        >
          {m.error ?? "kaydet"}
        </button>
      );
    }
    const user = userEvent.setup({ delay: null });
    render(
      <ApiProvider api={apiWith(new MockDb(null))}>
        <Note />
      </ApiProvider>,
    );
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(result).not.toBe("unset"));
    expect(result).toMatchObject({ body: "x" });
  });

  it("builds the mock client from the session when no api is given", async () => {
    __setMockDb(new MockDb(null));
    function Me() {
      const api = useApi();
      const q = useApiQuery(() => api.me());
      return <p>{q.data?.display_name ?? "…"}</p>;
    }
    render(
      <SessionProvider user={ANALYST}>
        <ApiProvider>
          <Me />
        </ApiProvider>
      </SessionProvider>,
    );
    expect(await screen.findByText("Mert (Analist)", {}, { timeout: 3_000 })).toBeInTheDocument();
  });

  it("throws outside the provider", () => {
    function Bare() {
      useApi();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Bare />)).toThrow(/ApiProvider/);
    spy.mockRestore();
  });
});

describe("useEventStream (mock bus)", () => {
  it("delivers typed events and ignores malformed ones", async () => {
    const db = new MockDb(null);
    __setMockDb(db);
    const seen: string[] = [];
    function Listener() {
      const status = useEventStream("desk", { halt: (d) => seen.push(`halt:${d.halted_today}`) });
      return <p>{status}</p>;
    }
    render(<Listener />);
    expect(screen.getByText("open")).toBeInTheDocument();
    const risk = (await apiWith(db).riskStatus()) as { halted_today: boolean };
    act(() => {
      db.bus.emit("desk", "halt", risk);
      db.bus.emit("desk", "halt", { nonsense: true });
      db.bus.emit("desk", "unknown", {});
    });
    expect(seen).toEqual(["halt:false"]);
  });
});

describe("clock", () => {
  it("returns the mock demo clock and ticks after mount", async () => {
    __setMockDb(new MockDb(null));
    expect(new Date(currentTimeMs()).toISOString().startsWith("2027-01-11")).toBe(true);
    function Clock() {
      const now = useNow(50);
      return <p>{now === null ? "yok" : "var"}</p>;
    }
    render(<Clock />);
    expect(screen.getByText("yok")).toBeInTheDocument();
    expect(await screen.findByText("var")).toBeInTheDocument();
  });
});
