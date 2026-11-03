import { z } from "zod";
import { ApprovalCard, AuditPage, ChainVerifyResult, DayCounters, DisclosureListItem, Explain, LimitsView, Me, OrderTicket, PnlPoint, Position, ProposalNote, RiskStatus } from "@/lib/domain";
import { noteServerTime } from "@/lib/clock";
import { HoldResult, Overview } from "@/lib/solo/overview";
import { ApiError, unreachableError, type KaptanApi } from "../types";
import { repairDeep } from "./mojibake";

/**
 * FastAPI client (04 §11, 09 §6). Access JWT lives in memory only; the refresh token is
 * the HttpOnly `__Host-kaptan_rt` cookie, first-party thanks to the /api/v1 rewrite in
 * next.config.ts. Mutations send Bearer; /auth/refresh sends X-KAPtan-CSRF.
 */
const BASE = "/api/v1";
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function refreshOnce(): Promise<boolean> {
  const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include", headers: { "X-KAPtan-CSRF": "1" } });
  if (!res.ok) return false;
  const body = z.object({ access_token: z.string() }).safeParse(await res.json());
  if (!body.success) return false;
  accessToken = body.data.access_token;
  return true;
}

/**
 * Single flight: the refresh token rotates on every use and a reused one revokes the whole
 * family (API.md §2), so parallel 401s (a reload fires several requests, StrictMode twice) must
 * share one /auth/refresh instead of racing each other into a sign-out.
 */
let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  refreshing ??= refreshOnce()
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * With the API down, the fetch itself succeeds: Next's rewrite answers with its own error page. The
 * API's own failures always carry a JSON body, so a 5xx without one means nothing answered.
 */
function isProxyFailure(res: Response, body: unknown): boolean {
  return res.status >= 500 && (body === null || typeof body !== "object");
}

async function request<T extends z.ZodType>(schema: T, path: string, init: RequestInit = {}, retried = false): Promise<z.infer<T>> {
  // After a reload the access token is gone (memory only): get one from the refresh cookie first
  // instead of collecting a 401 per request. If that fails, the request goes out and gets its 401.
  if (accessToken === null && !retried) retried = !(await refresh());
  const headers = new Headers(init.headers);
  const sentToken = accessToken;
  if (sentToken) headers.set("Authorization", `Bearer ${sentToken}`);
  if (init.body) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw unreachableError();
  }
  if (res.status === 401 && !retried) {
    // Another request already refreshed while this one was in flight: just retry with the new token.
    const renewed = accessToken !== null && accessToken !== sentToken;
    if (renewed || (await refresh())) return request(schema, path, init, true);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    if (isProxyFailure(res, detail)) throw unreachableError();
    const msg = typeof detail?.detail === "string" ? detail.detail : null;
    const fallback: Record<number, string> = {
      401: "Oturumunun süresi doldu. Yeniden giriş yap.",
      404: "Kayıt bulunamadı.",
      409: "Kayıt bu arada değişti ya da süresi doldu.",
      422: "Girdi geçersiz.",
      429: "Çok fazla istek. Biraz sonra yeniden dene.",
    };
    const code = typeof detail?.code === "string" ? detail.code : "http";
    throw new ApiError(res.status, code, msg ?? fallback[res.status] ?? "Sunucu hatası.");
  }
  if (res.status === 204) return schema.parse(undefined);
  // Some live KAP text reaches the API double-decoded (UTF-8 read as cp1254): repair it once, here.
  const json: unknown = repairDeep(await res.json());
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError(502, "schema", "Sunucu yanıtı beklenen biçimde değil.");
  return parsed.data;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
/** Counters and risk status carry the server's "now": keep the UI clock on it. */
function withServerTime<T extends { as_of: string }>(body: T): T {
  noteServerTime(body.as_of);
  return body;
}

export function createHttpApi(): KaptanApi {
  const id = encodeURIComponent;
  return {
    mode: "http",
    me: () => request(Me, "/me"),
    counters: (day?: string) => request(DayCounters, `/disclosures/counters${qs({ day })}`).then(withServerTime),
    // One odd row (an unusual ticker, a new enum value) must not blank the whole list: keep the rows that parse.
    disclosures: (q = {}) =>
      request(z.array(z.unknown()), `/disclosures${qs({ day: q.day, limit: q.limit, ticker: q.ticker })}`).then((rows) =>
        rows.flatMap((r) => {
          const one = DisclosureListItem.safeParse(r);
          return one.success ? [one.data] : [];
        }),
      ),
    listApprovals: (status = "pending") => request(z.array(ApprovalCard), `/approvals${qs({ status })}`),
    decideApproval: (pid, d) => request(ApprovalCard, `/approvals/${id(pid)}/decision`, post(d)),
    explain: (runId) => request(Explain, `/runs/${id(runId)}/explain`),
    listNotes: (pid) => request(z.array(ProposalNote), `/approvals/${id(pid)}/notes`),
    addNote: (pid, body) => request(ProposalNote, `/approvals/${id(pid)}/notes`, post({ body })),
    listTickets: () => request(z.array(OrderTicket), "/tickets"),
    markTicket: (no, input) => request(OrderTicket, `/tickets/${id(no)}/mark`, post(input)),
    overview: () => request(Overview, "/me/overview"),
    holdSuggestion: (sid, input) => request(HoldResult, `/me/suggestions/${id(sid)}/hold`, post(input)),
    positions: () => request(z.array(Position), "/portfolio/positions"),
    pnl: (from, to) => request(z.array(PnlPoint), `/portfolio/pnl${qs({ from, to })}`),
    riskStatus: () => request(RiskStatus, "/risk/status").then(withServerTime),
    killSwitch: (reason) => request(RiskStatus, "/risk/kill-switch", post({ reason })),
    startKillReset: (input) => request(RiskStatus, "/risk/kill-switch/reset/request", post(input)),
    confirmKillReset: (input) => request(RiskStatus, "/risk/kill-switch/reset/confirm", post(input)),
    limits: () => request(LimitsView, "/limits"),
    proposeLimit: (input) => request(LimitsView, "/limits/proposals", post(input)),
    decideLimit: (version, input) => request(LimitsView, `/limits/proposals/${version}/decision`, post(input)),
    auditList: (q = {}) => request(AuditPage, `/audit${qs({ scope: q.scope, q: q.q, limit: q.limit })}`),
    verifyAudit: () => request(ChainVerifyResult, "/audit/verify", post()),
  };
}

const MSG_LOGIN_LATER = "Giriş şu an yapılamıyor. Biraz sonra yeniden dene.";

/** POST /auth/login with the one password. The access token stays in memory. */
export async function httpLogin(passphrase: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
  } catch {
    throw unreachableError();
  }
  if (res.status === 429) throw new ApiError(429, "login", "Çok fazla deneme oldu. Biraz sonra yeniden dene.");
  if (res.status >= 500) throw isProxyFailure(res, await res.json().catch(() => null)) ? unreachableError() : new ApiError(res.status, "login", MSG_LOGIN_LATER);
  if (!res.ok) throw new ApiError(res.status, "login", "Parola doğrulanamadı.");
  const body = z.object({ access_token: z.string() }).safeParse(await res.json().catch(() => null));
  if (!body.success) throw new ApiError(502, "schema", MSG_LOGIN_LATER);
  accessToken = body.data.access_token;
}

/** Revoke the refresh family. A failed call still ends at /login: the cookie expires on its own. */
export async function httpLogout(): Promise<void> {
  accessToken = null;
  await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" });
}

/** Does the API answer at all? Anything but the rewrite's own failure counts as an answer. */
export async function httpReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { cache: "no-store" });
    return !isProxyFailure(res, await res.json().catch(() => null));
  } catch {
    return false;
  }
}
