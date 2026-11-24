import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMorning, OFF_AFTER_MS, wasOff } from "../src/digest";
import { loadLists, loadState } from "../src/db";
import { blockedAnswer } from "../src/kap";
import { runTick, shouldPoll } from "../src/tick";
import {
  BUYBACK, CHAT, CONTRACT, FRI, MON, NOISE, SAT, TUE, fakeBot, ist, kapItem, kapTime, meta, pair, resetDb, setLists, setMeta, testEnv,
  type RowSpec,
} from "./helpers";

const noSleep = async (): Promise<void> => undefined;

function mockKap(items: unknown[] | (() => Response)) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    typeof items === "function" ? items() : new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } }),
  );
}

const spec = (over: Partial<RowSpec> & Pick<RowSpec, "index" | "ticker">): RowSpec => ({
  title: BUYBACK,
  at: kapTime(TUE, "09:10:00"),
  ...over,
});

async function tick(now: number, items: unknown[], bot = fakeBot()) {
  mockKap(items);
  const result = await runTick(testEnv, now, { bot, sleep: noSleep });
  return { result, bot };
}

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a run before pairing", () => {
  it("does nothing and asks KAP for nothing", async () => {
    const spy = mockKap([]);
    const result = await runTick(testEnv, ist(TUE, "09:30"), { bot: fakeBot(), sleep: noSleep });
    expect(result.skipped).toBe("not paired");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("instant messages: important and mine", () => {
  const now = ist(TUE, "09:30");
  beforeEach(async () => {
    await pair(now, { morning_sent_on: TUE }); // the morning message has its own tests
    await setLists(["THYAO"], ["ASELS"]);
  });

  it("sends one message with the line, the tone and the four buttons", async () => {
    const { bot, result } = await tick(now, [kapItem(spec({ index: 100, ticker: "THYAO", company: "TÜRK HAVA YOLLARI" }))]);
    expect(result.sent).toBe(1);
    expect(bot.sent).toHaveLength(1);
    const msg = bot.sent[0];
    expect(msg?.chat).toBe(CHAT);
    expect(msg?.text).toContain("<b>THYAO</b> · TÜRK HAVA YOLLARI");
    expect(msg?.text).toContain("▲ olumlu");
    const labels = msg?.markup?.inline_keyboard.flat().map((b) => b.text);
    expect(labels).toEqual(["Okudum", "Sonra oku", "Aç", "Bu şirketi sustur"]);
    expect(msg?.markup?.inline_keyboard.flat().find((b) => b.text === "Aç")?.url).toBe("https://www.kap.org.tr/tr/Bildirim/100");
    expect(msg?.markup?.inline_keyboard.flat().every((b) => (b.callback_data ?? "").length <= 64)).toBe(true);
  });

  it("never sends the same disclosure twice", async () => {
    const items = [kapItem(spec({ index: 100, ticker: "THYAO" }))];
    await tick(now, items);
    const again = await tick(now + 5 * 60_000, items);
    expect(again.bot.sent).toHaveLength(0);
  });

  it("an important disclosure of a stranger waits for the morning", async () => {
    const { bot } = await tick(now, [kapItem(spec({ index: 101, ticker: "GARAN" }))]);
    expect(bot.sent).toHaveLength(0);
    const row = await testEnv.DB.prepare("SELECT important, state FROM events WHERE idx = 101").first<{ important: number; state: string }>();
    expect(row).toEqual({ important: 1, state: "morning" });
  });

  it("noise, updates and unknown subjects are not even kept", async () => {
    const { bot } = await tick(now, [
      kapItem(spec({ index: 1, ticker: "THYAO", title: NOISE })),
      kapItem(spec({ index: 2, ticker: "THYAO", related: true })),
      kapItem(spec({ index: 3, ticker: "GARAN", title: "Şirket Genel Bilgi Formu" })),
    ]);
    expect(bot.sent).toHaveLength(0);
    const n = await testEnv.DB.prepare("SELECT count(*) AS n FROM events").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("ignores what was published before the look-back or before pairing", async () => {
    const old = kapItem(spec({ index: 5, ticker: "THYAO", at: kapTime(TUE, "05:00:00") }));
    const { bot } = await tick(now, [old]);
    expect(bot.sent).toHaveLength(0);
  });

  it("two disclosures of one company in one run go out as one grouped message", async () => {
    const { bot } = await tick(now, [
      kapItem(spec({ index: 10, ticker: "THYAO" })),
      kapItem(spec({ index: 11, ticker: "THYAO", title: CONTRACT, at: kapTime(TUE, "09:12:00") })),
    ]);
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0]?.text).toContain("2 yeni duyuru");
    expect(bot.sent[0]?.markup?.inline_keyboard[0]?.[0]?.callback_data).toMatch(/^okt:THYAO:\d+$/);
  });

  it("at most one message per company in 30 minutes; the rest go together later", async () => {
    await tick(now, [kapItem(spec({ index: 10, ticker: "THYAO" }))]);
    const second = kapItem(spec({ index: 12, ticker: "THYAO", title: CONTRACT, at: kapTime(TUE, "09:35:00") }));
    const soon = await tick(now + 10 * 60_000, [second]);
    expect(soon.bot.sent).toHaveLength(0);
    const later = await tick(now + 31 * 60_000, [second]);
    expect(later.bot.sent).toHaveLength(1);
    expect(later.bot.sent[0]?.text).toContain("Yeni bir iş anlaşması");
  });

  it("stops at the daily cap and keeps the rest for the morning", async () => {
    await setMeta({ daily_cap: 1 });
    const { bot } = await tick(now, [
      kapItem(spec({ index: 20, ticker: "THYAO" })),
      kapItem(spec({ index: 21, ticker: "ASELS", at: kapTime(TUE, "09:11:00") })),
    ]);
    expect(bot.sent).toHaveLength(1);
    const held = await testEnv.DB.prepare("SELECT state, reason FROM events WHERE idx = 21").first();
    expect(held).toEqual({ state: "held", reason: "cap" });
  });

  it("holds messages in the person's quiet hours", async () => {
    await setMeta({ quiet: JSON.stringify({ on: true, start: "09:00", end: "10:00" }) });
    const { bot } = await tick(now, [kapItem(spec({ index: 30, ticker: "THYAO" }))]);
    expect(bot.sent).toHaveLength(0);
    expect((await testEnv.DB.prepare("SELECT reason FROM events WHERE idx = 30").first<{ reason: string }>())?.reason).toBe("quiet");
  });

  it("holds messages after /sessiz until the next morning", async () => {
    await setMeta({ silent_until: ist(TUE, "10:00") });
    const { bot } = await tick(now, [kapItem(spec({ index: 31, ticker: "THYAO" }))]);
    expect(bot.sent).toHaveLength(0);
  });

  it("a muted company is silent at once", async () => {
    await setLists([], [], ["THYAO"]);
    const { bot } = await tick(now, [kapItem(spec({ index: 32, ticker: "THYAO" }))]);
    expect(bot.sent).toHaveLength(0);
  });

  it("a failed send is tried again on the next run", async () => {
    const bot = fakeBot();
    bot.fail = true;
    const items = [kapItem(spec({ index: 40, ticker: "THYAO" }))];
    await tick(now, items, bot);
    expect(bot.sent).toHaveLength(0);
    bot.fail = false;
    await tick(now + 2 * 60_000, items, bot);
    expect(bot.sent).toHaveLength(1);
  });

  it("level 'daha az' sends only clear good or bad news of held stocks", async () => {
    await setMeta({ level: "less" });
    const { bot } = await tick(now, [
      kapItem(spec({ index: 50, ticker: "THYAO", title: CONTRACT })), // belirsiz
      kapItem(spec({ index: 51, ticker: "ASELS", at: kapTime(TUE, "09:11:00") })), // olumlu but only watched
    ]);
    expect(bot.sent).toHaveLength(0);
    const buy = await tick(now + 2 * 60_000, [kapItem(spec({ index: 52, ticker: "THYAO", at: kapTime(TUE, "09:20:00") }))], bot);
    expect(buy.bot.sent).toHaveLength(1);
  });

  it("level 'daha çok' also sends plain disclosures of watched stocks", async () => {
    await setMeta({ level: "more" });
    const { bot } = await tick(now, [kapItem(spec({ index: 60, ticker: "ASELS", title: "Şirket Genel Bilgi Formu" }))]);
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0]?.text).toContain("Şirket Genel Bilgi Formu");
  });

  it("no message ever carries money, amounts or share counts", async () => {
    const { bot } = await tick(now, [kapItem(spec({ index: 70, ticker: "THYAO", summary: "5.000.000 adet pay 12,34 TL" }))]);
    for (const m of bot.sent) expect(m.text).not.toMatch(/₺|\bTL\b|adet|\d{4,}/);
  });
});

describe("KAP trouble", () => {
  const now = ist(TUE, "09:30");
  beforeEach(async () => {
    await pair(now);
  });

  it("a WAF page marks KAP as blocked and backs off", async () => {
    const spy = mockKap(() => new Response("<html>blocked</html>", { headers: { "content-type": "text/html" } }));
    await runTick(testEnv, now, { bot: fakeBot(), sleep: noSleep });
    expect(await meta("kap_status")).toBe("blocked");
    expect(Number(await meta("next_try_at"))).toBeGreaterThan(now);
    expect(spy).toHaveBeenCalledTimes(1);
    await runTick(testEnv, now + 2 * 60_000, { bot: fakeBot(), sleep: noSleep });
    expect(spy).toHaveBeenCalledTimes(1); // still backing off
  });

  it("HTTP 666 is a WAF answer (workerd cannot build such a Response, so the check is called directly)", () => {
    expect(blockedAnswer(666, "x", "")).toContain("WAF");
    expect(blockedAnswer(403, "x", "")).toContain("WAF");
    expect(blockedAnswer(200, "  ", "application/json")).toBe("empty body");
    expect(blockedAnswer(200, "[]", "application/json")).toBeNull();
  });

  it("a good answer clears the blocked state", async () => {
    mockKap(() => new Response("x", { status: 403 }));
    await runTick(testEnv, now, { bot: fakeBot(), sleep: noSleep });
    expect(await meta("kap_status")).toBe("blocked");
    vi.restoreAllMocks();
    mockKap([]);
    await runTick(testEnv, now + 40 * 60_000, { bot: fakeBot(), sleep: noSleep });
    expect(await meta("kap_status")).toBe("ok");
  });

  it("polls every run in the session and every ten minutes outside it", () => {
    expect(shouldPoll(ist(TUE, "09:32"), null)).toBe(true);
    expect(shouldPoll(ist(TUE, "22:32"), null)).toBe(false);
    expect(shouldPoll(ist(TUE, "22:30"), null)).toBe(true);
    expect(shouldPoll(ist(SAT, "12:32"), null)).toBe(false);
    expect(shouldPoll(ist(TUE, "09:32"), ist(TUE, "10:00"))).toBe(false);
  });
});

describe("the morning message", () => {
  beforeEach(async () => {
    await pair(ist(TUE, "08:00"));
    await setLists(["THYAO"], []);
  });

  it("is not sent before 08:45, on a weekend, or on a holiday", async () => {
    expect((await tick(ist(TUE, "08:30"), [])).bot.sent).toHaveLength(0);
    expect((await tick(ist(SAT, "09:00"), [])).bot.sent).toHaveLength(0);
    expect((await tick(ist("2026-10-29", "09:00"), [])).bot.sent).toHaveLength(0);
  });

  it("lists what happened to my stocks and the day's highlights, once", async () => {
    // Monday evening's disclosure of a held stock (already told on Monday, the morning still recaps it)
    await testEnv.DB.prepare(
      "INSERT INTO events (idx, ticker, company, kind, important, line, tone, published_at, state) VALUES (1, 'THYAO', 'THY', 'buyback', 1, 'Pazartesi satırı.', 'olumlu', ?, 'done')",
    ).bind(ist("2026-11-23", "19:30")).run();
    const items = [kapItem(spec({ index: 2, ticker: "GARAN", title: CONTRACT, at: kapTime(TUE, "08:10:00") }))];
    const first = await tick(ist(TUE, "08:46"), items);
    const morning = first.bot.sent.find((m) => m.text.startsWith("Günaydın."));
    expect(morning).toBeDefined();
    expect(morning?.text).toContain("Dün akşamdan beri senin hisselerinde:");
    expect(morning?.text).toContain("Günün öne çıkanları:");
    expect(morning?.text).toContain("GARAN");
    expect(morning?.markup).toBeUndefined();
    const again = await tick(ist(TUE, "08:50"), items);
    expect(again.bot.sent.filter((m) => m.text.startsWith("Günaydın."))).toHaveLength(0);
    expect(await meta("morning_sent_on")).toBe(TUE);
  });

  it("says plainly when nothing happened to my stocks", async () => {
    const { bot } = await tick(ist(TUE, "08:46"), []);
    expect(bot.sent[0]?.text).toBe("Günaydın.\nSenin hisselerinde önemli bir şey yok.");
  });

  it("after a weekend it says 'Son iş gününden beri'", async () => {
    await pair(ist(FRI, "08:00"));
    const items = [kapItem(spec({ index: 3, ticker: "THYAO", at: kapTime(FRI, "19:00:00") }))];
    mockKap(items);
    const bot = fakeBot();
    // the instant message of Friday evening is out of the way: the morning still recaps it
    await testEnv.DB.prepare(
      "INSERT INTO events (idx, ticker, company, kind, important, line, tone, published_at, state) VALUES (3, 'THYAO', 'THY', 'buyback', 1, 'Satır.', 'olumlu', ?, 'done')",
    ).bind(ist(FRI, "19:00")).run();
    await runTick(testEnv, ist(MON, "08:46"), { bot, sleep: noSleep });
    expect(bot.sent[0]?.text).toContain("Son iş gününden beri senin hisselerinde:");
  });

  it("carries what the cap or the quiet hours held back", async () => {
    await testEnv.DB.prepare(
      "INSERT INTO events (idx, ticker, company, kind, important, line, tone, published_at, state, reason) VALUES (9, 'THYAO', 'THY', 'buyback', 1, 'Tutulan satır.', 'olumlu', ?, 'held', 'cap')",
    ).bind(ist(TUE, "01:00")).run();
    const { bot } = await tick(ist(TUE, "08:46"), []);
    expect(bot.sent[0]?.text).toContain("Tutulan satır.");
    expect(bot.sent[0]?.text).toContain("Günlük mesaj sınırı dolduğu için");
    expect((await testEnv.DB.prepare("SELECT state FROM events WHERE idx = 9").first<{ state: string }>())?.state).toBe("done");
  });
});

describe("the weekend summary", () => {
  beforeEach(async () => {
    await pair(ist(FRI, "08:00"));
    await setLists(["THYAO"], []);
  });

  it("goes out on the last trading day before a closed day, once", async () => {
    const first = await tick(ist(FRI, "18:32"), []);
    const text = first.bot.sent.at(-1)?.text ?? "";
    expect(text).toContain("İyi akşamlar. Borsa yarın kapalı.");
    expect(text).toContain("Senin hisselerinde önemli bir şey yok.");
    const again = await tick(ist(FRI, "18:40"), []);
    expect(again.bot.sent.filter((m) => m.text.includes("Borsa yarın kapalı"))).toHaveLength(0);
  });

  it("does not go out on an ordinary evening", async () => {
    const { bot } = await tick(ist(TUE, "18:40"), []);
    expect(bot.sent.filter((m) => m.text.includes("Borsa yarın kapalı"))).toHaveLength(0);
  });
});

describe("the 'computer was off' line", () => {
  const now = ist(TUE, "08:46");
  beforeEach(async () => {
    await pair(ist(TUE, "01:00"));
  });

  it("is added to the morning message when the PC was silent for more than 12 hours, once a day", async () => {
    await setMeta({ last_sync_at: now - OFF_AFTER_MS - 60_000 });
    const { bot } = await tick(now, []);
    expect(bot.sent[0]?.text).toContain("Bilgisayardaki KAPtan dünden beri kapalı; öneriler için açman gerek.");
    expect(await meta("off_told_on")).toBe(TUE);
    const state = await loadState(testEnv.DB);
    expect(wasOff(state, now + 60_000)).toBe(false); // not again the same day
    expect(wasOff(state, now + 24 * 3600_000)).toBe(true); // the next day it may say it again
  });

  it("is left out when the PC synced recently or never synced", async () => {
    await setMeta({ last_sync_at: now - 3600_000 });
    const lists = await loadLists(testEnv.DB);
    const state = await loadState(testEnv.DB);
    expect((await buildMorning(testEnv.DB, state, lists, now)).text).not.toContain("kapalı");
    await testEnv.DB.prepare("DELETE FROM meta WHERE key = 'last_sync_at'").run();
    const fresh = await loadState(testEnv.DB);
    expect((await buildMorning(testEnv.DB, fresh, lists, now)).text).not.toContain("kapalı");
  });
});
