import { TelegramPair, TelegramStatus } from "@/lib/domain/telegram";
import { isApiError } from "../types";
import { MockDb } from "./db";
import { createMockApi } from "./mock-api";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { PAIR_DELAY_MS } from "./telegram";

const TOKEN = "123456789:AAFakeTokenForTestsOnly_0123456789abcd";

function setup() {
  const db = new MockDb(null);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

afterEach(() => {
  vi.useRealTimers();
  stopAllTimers();
  stopLiveTicker();
});

const refused = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  return isApiError(e) ? { status: e.status, code: e.code } : null;
};

describe("mock · Telegram", () => {
  it("starts empty, refuses a bad code and a pairing before a code, and never returns the code", async () => {
    const { api } = setup();
    const first = TelegramStatus.parse(await api.telegramStatus());
    expect(first).toMatchObject({ configured: false, paired: false, level: "normal", daily_cap: 8 });
    expect(await refused(api.saveTelegram({ token: "abc" }))).toEqual({ status: 422, code: "validation" });
    expect(await refused(api.pairTelegram())).toEqual({ status: 409, code: "conflict" });
    const saved = await api.saveTelegram({ token: TOKEN });
    expect(saved.configured).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(TOKEN);
  });

  it("pairs when the phone taps the link, keeps the level, sends a message once a minute, and unlinks (audited)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { db, api } = setup();
    await api.saveTelegram({ token: TOKEN });
    const pair = TelegramPair.parse(await api.pairTelegram());
    expect(pair.pair_link).toMatch(/^https:\/\/t\.me\/kaptan_mock_bot\?start=\w{8,}$/);
    expect((await api.telegramStatus()).pairing_open).toBe(true);
    expect(await refused(api.sendTelegramSample())).toEqual({ status: 409, code: "conflict" });
    vi.advanceTimersByTime(PAIR_DELAY_MS + 10);
    expect((await api.telegramStatus()).paired).toBe(true);
    expect((await api.saveTelegram({ level: "less", daily_cap: 5 })).level).toBe("less");
    expect((await api.sendTelegramSample()).last_sent_at).not.toBeNull();
    expect(await refused(api.sendTelegramSample())).toEqual({ status: 429, code: "rate_limited" });
    const gone = await api.unlinkTelegram();
    expect(gone).toMatchObject({ configured: false, paired: false, level: "normal" });
    const actions = db.auditChain().map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["telegram.changed", "telegram.pairing_started", "telegram.unlinked"]));
  });

  it("shows the cloud only when the test turns it on, and never an address or a secret", async () => {
    const { api } = setup();
    expect(await api.telegramStatus()).toMatchObject({ cloud_on: false, cloud_synced_at: null, cloud_kap: null });
    const store = new Map<string, string>([["kaptan-mock-cloud", "1"], ["kaptan-mock-cloud-kap", "blocked"]]);
    vi.stubGlobal("window", { sessionStorage: { getItem: (k: string) => store.get(k) ?? null } });
    try {
      const on = TelegramStatus.parse(await api.telegramStatus());
      expect(on).toMatchObject({ cloud_on: true, cloud_kap: "blocked", cloud_error: false });
      expect(on.cloud_synced_at).not.toBeNull();
      expect(JSON.stringify(on)).not.toMatch(/workers\.dev|secret|bearer/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
