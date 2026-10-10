import { z } from "zod";
import { ApprovalCard, AuditPage, ChainVerifyResult, DayCounters, Explain, LimitsView, Me, OrderTicket, PnlPoint, Position, ProposalNote, RiskStatus, TeamMember } from "@/lib/domain";
import type { Role } from "@/lib/domain/user";
import { ApiError, type KaptanApi } from "../types";

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

async function refresh(): Promise<boolean> {
  const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include", headers: { "X-KAPtan-CSRF": "1" } });
  if (!res.ok) return false;
  const body = z.object({ access_token: z.string() }).safeParse(await res.json());
  if (!body.success) return false;
  accessToken = body.data.access_token;
  return true;
}

async function request<T extends z.ZodType>(schema: T, path: string, init: RequestInit = {}, retried = false): Promise<z.infer<T>> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "network", "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.");
  }
  if (res.status === 401 && !retried && (await refresh())) return request(schema, path, init, true);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const msg = typeof detail?.detail === "string" ? detail.detail : null;
    const fallback: Record<number, string> = {
      401: "Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.",
      403: "Bu işlem rolüne kapalı.",
      404: "Kayıt bulunamadı.",
      409: "Kayıt bu arada değişti ya da süresi doldu.",
      422: "Girdi geçersiz.",
      429: "Çok fazla istek. Biraz sonra yeniden deneyin.",
    };
    const code = typeof detail?.code === "string" ? detail.code : "http";
    throw new ApiError(res.status, code, msg ?? fallback[res.status] ?? "Sunucu hatası.");
  }
  if (res.status === 204) return schema.parse(undefined);
  const json: unknown = await res.json();
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
const Void = z.undefined().or(z.null()).transform(() => undefined);

export function createHttpApi(): KaptanApi {
  const id = encodeURIComponent;
  return {
    mode: "http",
    me: () => request(Me, "/me"),
    setRole: async (role) => {
      const body = await request(z.object({ access_token: z.string(), user: Me }), "/auth/role", post({ role }));
      accessToken = body.access_token;
      return body.user;
    },
    users: () => request(z.array(TeamMember), "/admin/users"),
    counters: () => request(DayCounters, "/disclosures/counters"),
    listApprovals: (status = "pending") => request(z.array(ApprovalCard), `/approvals${qs({ status })}`),
    decideApproval: (pid, d) => request(ApprovalCard, `/approvals/${id(pid)}/decision`, post(d)),
    explain: (runId) => request(Explain, `/runs/${id(runId)}/explain`),
    listNotes: (pid) => request(z.array(ProposalNote), `/approvals/${id(pid)}/notes`),
    addNote: (pid, body) => request(ProposalNote, `/approvals/${id(pid)}/notes`, post({ body })),
    listTickets: () => request(z.array(OrderTicket), "/tickets"),
    markTicket: (no, input) => request(OrderTicket, `/tickets/${id(no)}/mark`, post(input)),
    positions: () => request(z.array(Position), "/portfolio/positions"),
    pnl: (from, to) => request(z.array(PnlPoint), `/portfolio/pnl${qs({ from, to })}`),
    riskStatus: () => request(RiskStatus, "/risk/status"),
    killSwitch: (reason) => request(RiskStatus, "/risk/kill-switch", post({ reason })),
    startKillReset: (input) => request(RiskStatus, "/risk/kill-switch/reset/request", post(input)),
    confirmKillReset: (input) => request(RiskStatus, "/risk/kill-switch/reset/confirm", post(input)),
    limits: () => request(LimitsView, "/limits"),
    proposeLimit: (input) => request(LimitsView, "/limits/proposals", post(input)),
    decideLimit: (version, input) => request(LimitsView, `/limits/proposals/${version}/decision`, post(input)),
    auditList: (q = {}) => request(AuditPage, `/audit${qs({ scope: q.scope, q: q.q, limit: q.limit })}`),
    verifyAudit: () => request(ChainVerifyResult, "/audit/verify", post()),
    injectDemo: (scenario) =>
      request(z.object({ disclosure_index: z.number().nullable(), run_id: z.string().nullable() }), "/demo/inject", post({ scenario })),
    setTamper: (on) => request(z.object({ tamper_on: z.boolean() }), "/demo/tamper", post({ on })),
    resetDemo: () => request(Void, "/demo/reset", post()),
  };
}

/**
 * POST /auth/login with the single passphrase (http mode). The access token stays in memory.
 * `role` is the door's request; the backend decides the role it actually grants (API.md §2).
 */
export async function httpLogin(passphrase: string, role?: Role): Promise<Me> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(role ? { passphrase, role } : { passphrase }),
  });
  if (!res.ok) throw new ApiError(res.status, "login", "Parola doğrulanamadı.");
  const body = z.object({ access_token: z.string(), user: Me }).parse(await res.json());
  accessToken = body.access_token;
  return body.user;
}
