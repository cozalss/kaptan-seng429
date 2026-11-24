import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../src/crypto";
import { validate } from "../src/gemini";
import worker from "../src/index";
import { local } from "../src/time";
import { CHAT, CONTRACT, HOOK, SECRET, TUE, fakeBot, ist, kapItem, kapTime, meta, pair, resetDb, setLists, setMeta, testEnv } from "./helpers";
import { runTick } from "../src/tick";

interface Call {
  method: string;
  body: Record<string, unknown>;
}

/** Telegram calls are recorded, KAP answers with `kap`, everything else is refused: no real network. */
function mockNet(kap: () => Response = () => new Response("[]", { headers: { "content-type": "application/json" } })) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.telegram.org/")) {
      calls.push({ method: url.split("/").pop() ?? "", body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return new Response('{"ok":true,"result":{}}');
    }
    if (url.includes("kap.org.tr")) return kap();
    throw new Error(`unexpected network call: ${url}`);
  });
  return calls;
}

const call = (path: string, init: RequestInit = {}, auth: string | null = SECRET) =>
  worker.fetch(
    new Request(`https://bulut.example${path}`, {
      ...init,
      headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), "content-type": "application/json", ...(init.headers ?? {}) },
    }),
    testEnv,
  );

const hook = (update: unknown, secret: string | null = HOOK) =>
  call("/telegram", {
    method: "POST",
    body: JSON.stringify(update),
    headers: secret === null ? {} : { "x-telegram-bot-api-secret-token": secret },
  }, null);

const text = (t: string, chat = CHAT) => ({ message: { message_id: 1, chat: { id: chat, type: "private" }, text: t } });
const button = (data: string, chat = CHAT) => ({
  callback_query: {
    id: "cb1",
    data,
    message: {
      message_id: 7,
      chat: { id: chat, type: "private" },
      text: "THYAO · satır",
      reply_markup: { inline_keyboard: [[{ text: "Aç", url: "https://www.kap.org.tr/tr/Bildirim/5" }, { text: "Okudum", callback_data: data }]] },
    },
  },
});

const sync = (body: unknown, auth: string | null = SECRET) => call("/sync", { method: "POST", body: JSON.stringify(body) }, auth);

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("webhook", () => {
  it("refuses a missing or wrong secret token and does nothing", async () => {
    const calls = mockNet();
    await pair(Date.now());
    expect((await hook(text("/durum"), null)).status).toBe(401);
    expect((await hook(text("/durum"), "wrong")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("answers 200 even for a broken body, so Telegram does not retry for ever", async () => {
    mockNet();
    const res = await call("/telegram", { method: "POST", body: "not json", headers: { "x-telegram-bot-api-secret-token": HOOK } }, null);
    expect(res.status).toBe(200);
  });
});

describe("pairing", () => {
  const code = "kod-12345678-abc";
  const armed = async (expires = Date.now() + 600_000) => {
    const res = await sync({ pair: { hash: await sha256Hex(code), expires_at: expires } });
    expect(res.status).toBe(200);
  };

  it("pairs the chat that sends /start <code> and nobody else", async () => {
    const calls = mockNet();
    await armed();
    await hook(text("/start wrong-code-123456", 999));
    expect(await meta("chat_id")).toBeNull();
    await hook(text(`/start ${code}`, CHAT));
    expect(await meta("chat_id")).toBe(String(CHAT));
    expect(String(calls.at(-1)?.body.text)).toContain("Bağlandı.");
    // the code is spent: another chat cannot use it, and a stranger's commands are ignored
    const before = calls.length;
    await hook(text(`/start ${code}`, 999));
    await hook(text("/durum", 999));
    expect(calls).toHaveLength(before);
    expect(await meta("chat_id")).toBe(String(CHAT));
  });

  it("refuses an expired code", async () => {
    mockNet();
    await armed(Date.now() - 1000);
    await hook(text(`/start ${code}`));
    expect(await meta("chat_id")).toBeNull();
  });

  it("syncing the same code again does not unpair a paired chat", async () => {
    mockNet();
    await armed();
    await hook(text(`/start ${code}`));
    await armed();
    expect(await meta("chat_id")).toBe(String(CHAT));
  });

  it("tells the PC which chat is paired", async () => {
    mockNet();
    await armed();
    await hook(text(`/start ${code}`));
    const body = (await (await sync({ held: [], watched: [] })).json()) as { chat_id: number };
    expect(body.chat_id).toBe(CHAT);
  });

  it("a chat the PC paired before the cloud existed carries over, but never over a new pairing", async () => {
    mockNet();
    await sync({ chat_id: CHAT });
    expect(await meta("chat_id")).toBe(String(CHAT));
    await sync({ chat_id: 777 }); // already paired: ignored
    expect(await meta("chat_id")).toBe(String(CHAT));
    await sync({ unlink: true });
    await sync({ chat_id: 888, pair: { hash: await sha256Hex("zzzzzzzz-code"), expires_at: Date.now() + 60_000 } });
    expect(await meta("chat_id")).toBeNull();
  });

  it("an unlink from the PC forgets the chat", async () => {
    mockNet();
    await pair(Date.now());
    await sync({ unlink: true });
    expect(await meta("chat_id")).toBeNull();
  });
});

describe("commands", () => {
  beforeEach(async () => {
    await pair(Date.now());
  });

  it("/ayar çok changes the level, /ayar alone offers the choices", async () => {
    const calls = mockNet();
    await hook(text("/ayar çok"));
    expect(await meta("level")).toBe("more");
    await hook(text("/ayar"));
    const offer = calls.at(-1)?.body as { reply_markup?: { inline_keyboard: Array<Array<{ callback_data: string }>> } };
    expect(offer.reply_markup?.inline_keyboard[0]?.map((b) => b.callback_data)).toEqual(["lvl:less", "lvl:normal", "lvl:more"]);
    await hook(button("lvl:less"));
    expect(await meta("level")).toBe("less");
  });

  it("/sessiz holds messages until 08:45 of the next morning", async () => {
    mockNet();
    await hook(text("/sessiz"));
    const until = Number(await meta("silent_until"));
    expect(until).toBeGreaterThan(Date.now());
    expect(until - Date.now()).toBeLessThanOrEqual(24 * 3600_000);
    expect(local(until).minutes).toBe(8 * 60 + 45);
  });

  it("/durum counts the day and says when the PC looks off", async () => {
    const calls = mockNet();
    await setMeta({ last_sync_at: Date.now() - 20 * 3600_000 });
    await hook(text("/durum"));
    const said = String(calls.at(-1)?.body.text);
    expect(said).toContain("Bugün 0 anlık mesaj gönderdim (günlük sınır 8).");
    expect(said).toContain("Bilgisayardaki KAPtan kapalı görünüyor");
  });
});

describe("buttons", () => {
  beforeEach(async () => {
    await pair(Date.now());
  });

  it("Okudum and Sonra oku go to the action queue, answer at once and keep only the link", async () => {
    const calls = mockNet();
    await hook(button("ok:5"));
    await hook(button("later:6"));
    const rows = (await testEnv.DB.prepare("SELECT action, idx FROM actions ORDER BY id").all()).results;
    expect(rows).toEqual([{ action: "read", idx: 5 }, { action: "later", idx: 6 }]);
    expect(calls.filter((c) => c.method === "answerCallbackQuery")).toHaveLength(2);
    const edit = calls.find((c) => c.method === "editMessageText")?.body as { text: string; reply_markup: { inline_keyboard: Array<Array<{ url?: string }>> } };
    expect(edit.text).toContain("✓ Okundu");
    expect(edit.reply_markup.inline_keyboard.flat().every((b) => b.url)).toBe(true);
  });

  it("'Okudum' on a group marks every disclosure of that company in the day", async () => {
    mockNet();
    const stamp = Math.floor(ist(TUE, "10:00") / 1000);
    for (const [idx, at] of [[1, "09:10"], [2, "09:20"], [3, "07:00"]] as const) {
      await testEnv.DB.prepare(
        "INSERT INTO events (idx, ticker, company, kind, important, line, tone, published_at, state) VALUES (?, 'THYAO', 'THY', 'buyback', 1, 'x', 'olumlu', ?, 'done')",
      ).bind(idx, ist(TUE, at)).run();
    }
    await hook(button(`okt:THYAO:${stamp}`));
    const ids = (await testEnv.DB.prepare("SELECT idx FROM actions WHERE action = 'read' ORDER BY idx").all()).results.map((r) => r.idx);
    expect(ids).toEqual([1, 2, 3]);
  });

  it("Bu şirketi sustur mutes at once in the Worker and queues the action for the PC", async () => {
    mockNet();
    await hook(button("mute:THYAO"));
    expect((await testEnv.DB.prepare("SELECT ticker FROM muted").all()).results).toEqual([{ ticker: "THYAO" }]);
    expect((await testEnv.DB.prepare("SELECT action, ticker FROM actions").all()).results).toEqual([{ action: "mute", ticker: "THYAO" }]);
  });

  it("buttons of other chats, unknown buttons and bad data do nothing", async () => {
    mockNet();
    await hook(button("ok:5", 999));
    await hook(button("mute:thy"));
    await hook(button("zzz:1"));
    await hook(button("ok:abc"));
    expect((await testEnv.DB.prepare("SELECT count(*) AS n FROM actions").first<{ n: number }>())?.n).toBe(0);
    expect((await testEnv.DB.prepare("SELECT count(*) AS n FROM muted").first<{ n: number }>())?.n).toBe(0);
  });

  it("has no approve button anywhere in a sent message", async () => {
    const bot = fakeBot();
    mockNet(() => new Response(JSON.stringify([kapItem({ index: 5, title: "Payların Geri Alınmasına İlişkin Bildirim", ticker: "THYAO", at: kapTime(TUE, "09:10:00") })]), { headers: { "content-type": "application/json" } }));
    await setLists(["THYAO"], []);
    await runTick(testEnv, ist(TUE, "09:30"), { bot, sleep: async () => undefined });
    expect(JSON.stringify(bot.sent)).not.toMatch(/onay|onayla|approve/i);
  });
});

describe("/sync, /actions and /health", () => {
  it("need the secret", async () => {
    mockNet();
    expect((await sync({}, null)).status).toBe(401);
    expect((await sync({}, "wrong")).status).toBe(401);
    expect((await call("/actions", {}, null)).status).toBe(401);
    expect((await call("/health", {}, "wrong")).status).toBe(401);
    expect((await call("/nowhere")).status).toBe(404);
  });

  it("rejects things that are not tickers, so nothing but tickers is stored", async () => {
    expect((await sync({ held: ["THYAO", "1.250 adet"] })).status).toBe(400);
    expect((await sync({ held: "THYAO" })).status).toBe(400);
    expect((await sync({ level: "çok" })).status).toBe(400);
    expect((await sync({ quiet: { on: true, start: "25:00", end: "08:00" } })).status).toBe(400);
    expect((await call("/sync", { method: "POST", body: "{" })).status).toBe(400);
  });

  it("stores the two lists and keeps them while the PC is away", async () => {
    await sync({ held: ["THYAO", "ASELS"], watched: ["ASELS", "GARAN"], muted: ["EREGL"] });
    const lists = (await testEnv.DB.prepare("SELECT ticker, kind FROM lists ORDER BY ticker").all()).results;
    expect(lists).toEqual([{ ticker: "ASELS", kind: "held" }, { ticker: "GARAN", kind: "watched" }, { ticker: "THYAO", kind: "held" }]); // held wins
    expect((await testEnv.DB.prepare("SELECT ticker FROM muted").all()).results).toEqual([{ ticker: "EREGL" }]);
    expect(Number(await meta("last_sync_at"))).toBeGreaterThan(0);
  });

  it("does not rewrite lists that did not change", async () => {
    await sync({ held: ["THYAO"], watched: [] });
    await testEnv.DB.prepare("UPDATE lists SET kind = 'watched' WHERE ticker = 'THYAO'").run(); // would be repaired by a rewrite
    await sync({ held: ["THYAO"], watched: [] });
    expect((await testEnv.DB.prepare("SELECT kind FROM lists").first<{ kind: string }>())?.kind).toBe("watched");
  });

  it("a mute pressed on the phone survives a sync until the PC has pulled it", async () => {
    mockNet();
    await pair(Date.now());
    await hook(button("mute:GARAN"));
    await sync({ held: [], watched: [], muted: [] });
    expect((await testEnv.DB.prepare("SELECT ticker FROM muted").all()).results).toEqual([{ ticker: "GARAN" }]);
    const queued = (await testEnv.DB.prepare("SELECT id FROM actions").all<{ id: number }>()).results.map((r) => r.id);
    await call("/actions/ack", { method: "POST", body: JSON.stringify({ ids: queued }) });
    await sync({ held: [], watched: [], muted: [] });
    expect((await testEnv.DB.prepare("SELECT count(*) AS n FROM muted").first<{ n: number }>())?.n).toBe(0);
  });

  it("the PC's level wins only when it changed there; /ayar on the phone otherwise stays", async () => {
    await sync({ level: "normal", daily_cap: 8 });
    await setMeta({ level: "more" }); // set from the phone
    await sync({ level: "normal", daily_cap: 8 });
    expect(await meta("level")).toBe("more");
    await sync({ level: "less", daily_cap: 3 });
    expect(await meta("level")).toBe("less");
    expect(await meta("daily_cap")).toBe("3");
  });

  it("hands out the queued button actions and forgets them once acknowledged", async () => {
    await testEnv.DB.prepare("INSERT INTO actions (action, idx, ticker, created_at) VALUES ('read', 5, NULL, 1), ('mute', NULL, 'THYAO', 2)").run();
    const got = (await (await call("/actions")).json()) as { actions: Array<{ id: number; action: string }> };
    expect(got.actions.map((a) => a.action)).toEqual(["read", "mute"]);
    await call("/actions/ack", { method: "POST", body: JSON.stringify({ ids: got.actions.map((a) => a.id) }) });
    expect(((await (await call("/actions")).json()) as { actions: unknown[] }).actions).toEqual([]);
  });

  it("/health says ok when KAP answers and blocked when it does not", async () => {
    mockNet(() => new Response("[]", { headers: { "content-type": "application/json" } }));
    expect(await (await call("/health")).json()).toMatchObject({ ok: true, kap: "ok" });
    vi.restoreAllMocks();
    mockNet(() => new Response("<html>", { status: 403 }));
    expect(await (await call("/health")).json()).toMatchObject({ ok: false, kap: "blocked" });
  });
});

describe("optional Gemini line", () => {
  const source = "Yeni İş İlişkisi 2026 sözleşmesi";
  it("keeps a checked answer", () => {
    expect(validate({ line: "Yeni bir iş anlaşması yaptı.", tone: "olumlu", so_what: null }, source)?.tone).toBe("olumlu");
  });
  it("rejects a number the disclosure does not contain, advice words, a bad tone and a long line", () => {
    expect(validate({ line: "500 milyon liralık iş.", tone: "olumlu" }, source)).toBeNull();
    expect(validate({ line: "Bu hisseyi almalısın.", tone: "olumlu" }, source)).toBeNull();
    expect(validate({ line: "Fena değil.", tone: "harika" }, source)).toBeNull();
    expect(validate({ line: "x".repeat(141), tone: "notr" }, source)).toBeNull();
  });

  const run = async (key: string | undefined, answer: unknown, cap = "40") => {
    const e = Object.create(testEnv) as Env;
    e.GEMINI_API_KEY = key;
    e.GEMINI_DAILY_CAP = cap;
    let gemini = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("generativelanguage")) {
        gemini += 1;
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
      }
      return new Response(JSON.stringify([kapItem({ index: 77, title: CONTRACT, ticker: "THYAO", at: kapTime(TUE, "09:10:00") })]), { headers: { "content-type": "application/json" } });
    });
    await pair(ist(TUE, "09:30"));
    await setLists(["THYAO"], []);
    await runTick(e, ist(TUE, "09:30"), { bot: fakeBot(), sleep: async () => undefined });
    return { gemini, line: (await testEnv.DB.prepare("SELECT line FROM events WHERE idx = 77").first<{ line: string }>())?.line };
  };

  it("does nothing without a key", async () => {
    const r = await run(undefined, { line: "Bir cümle.", tone: "olumlu" });
    expect(r.gemini).toBe(0);
    expect(r.line).toBe("Yeni bir iş anlaşması bildirdi.");
  });
  it("uses the checked line for a thin disclosure of my own stock", async () => {
    const r = await run("k", { line: "Yeni bir iş anlaşması imzaladı.", tone: "olumlu" });
    expect(r.gemini).toBe(1);
    expect(r.line).toBe("Yeni bir iş anlaşması imzaladı.");
  });
  it("falls back to the rule line when the answer is rejected or the daily cap is used up", async () => {
    expect((await run("k", { line: "9999 liralık iş.", tone: "olumlu" })).line).toBe("Yeni bir iş anlaşması bildirdi.");
    await resetDb();
    const capped = await run("k", { line: "Başka cümle.", tone: "olumlu" }, "0");
    expect(capped.gemini).toBe(0);
  });
});
