import { safeEqual } from "./crypto";
import { handleUpdate, type TgUpdate } from "./handlers";
import { fetchKap, KAP_BASE } from "./kap";
import { applySync, authorized, BadRequest, MAX_ACTIONS, parseSync, readJson } from "./sync";
import { makeBot } from "./telegram";
import { runTick } from "./tick";
import { local } from "./time";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

async function actions(env: Env): Promise<Response> {
  const { results } = await env.DB
    .prepare("SELECT id, action, idx, ticker FROM actions ORDER BY id LIMIT ?")
    .bind(MAX_ACTIONS)
    .all<{ id: number; action: string; idx: number | null; ticker: string | null }>();
  return json({ actions: results });
}

async function ack(request: Request, env: Env): Promise<Response> {
  const body = (await readJson(request)) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is number => Number.isInteger(v)).slice(0, MAX_ACTIONS) : [];
  if (ids.length) await env.DB.batch(ids.map((id) => env.DB.prepare("DELETE FROM actions WHERE id = ?").bind(id)));
  return json({ ok: true, removed: ids.length });
}

/** One KAP fetch, to find out whether KAP answers Cloudflare's addresses (the setup script calls this). */
async function health(env: Env): Promise<Response> {
  const got = await fetchKap(env.KAP_BASE_URL ?? KAP_BASE, local(Date.now()).date);
  if (got.ok) return json({ ok: true, kap: "ok", rows: got.rows.length });
  return json({ ok: false, kap: got.blocked ? "blocked" : "error", reason: got.reason });
}

async function webhook(request: Request, env: Env): Promise<Response> {
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!(await safeEqual(given, env.WEBHOOK_SECRET ?? ""))) return json({ ok: false }, 401);
  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return json({ ok: true }); // nothing to retry: Telegram would only send the same thing again
  }
  try {
    await handleUpdate(env, update, Date.now(), makeBot(env.TELEGRAM_BOT_TOKEN));
  } catch (e) {
    console.error("update not handled", (e as Error).name); // never the text: it may hold the person's words
  }
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/telegram" && request.method === "POST") return await webhook(request, env);
      if (pathname === "/" && request.method === "GET") return new Response("KAPtan bulut takibi");
      const guarded = ["/sync", "/actions", "/actions/ack", "/health"];
      if (!guarded.includes(pathname)) return json({ ok: false }, 404);
      if (!(await authorized(request, env))) return json({ ok: false }, 401);
      if (pathname === "/sync" && request.method === "POST") {
        return json(await applySync(env.DB, parseSync(await readJson(request)), Date.now()));
      }
      if (pathname === "/actions" && request.method === "GET") return await actions(env);
      if (pathname === "/actions/ack" && request.method === "POST") return await ack(request, env);
      if (pathname === "/health" && request.method === "GET") return await health(env);
      return json({ ok: false }, 405);
    } catch (e) {
      if (e instanceof BadRequest) return json({ ok: false, error: e.message }, 400);
      console.error("request failed", (e as Error).name);
      return json({ ok: false }, 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runTick(env).catch((e: unknown) => {
        console.error("tick failed", (e as Error).name);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
