import { z } from "zod";
import {
  ApprovalCard,
  AuditEntry,
  AuditStatus,
  ChainVerifyResult,
  ConfigView,
  DayCounters,
  DisclosureDetail,
  DisclosureListItem,
  EvalSummary,
  Explain,
  KillResetRequest,
  LimitVersion,
  LiveArmState,
  Me,
  MorningBrief,
  Note,
  Order,
  OrderTicket,
  pageOf,
  PnlPoint,
  Position,
  RestrictedSecurity,
  RiskStatus,
  RunSummary,
  UniverseEntry,
} from "@/lib/domain";
import { AdminUserView } from "../admin-types";
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
      403: "Bu işlem rolünüze kapalı.",
      404: "Kayıt bulunamadı.",
      409: "Kayıt başka bir oturumda değişti ya da süresi doldu.",
      422: "Girdi geçersiz.",
      429: "Çok fazla istek. Biraz sonra yeniden deneyin.",
    };
    throw new ApiError(res.status, "http", msg ?? fallback[res.status] ?? "Sunucu hatası.");
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
  return {
    mode: "http",
    me: () => request(Me, "/me"),
    listDisclosures: (q = {}) =>
      request(pageOf(DisclosureListItem).extend({ counters: DayCounters }), `/disclosures${qs({ ...q })}`),
    getDisclosure: (index) => request(DisclosureDetail, `/disclosures/${index}`),
    addNote: (index, body) => request(Note, `/disclosures/${index}/notes`, post({ body })),
    counters: () => request(DayCounters, "/disclosures/counters"),
    listRuns: (q = {}) => request(z.array(RunSummary), `/runs${qs({ ...q })}`),
    getRun: (id) => request(RunSummary, `/runs/${encodeURIComponent(id)}`),
    explain: (id) => request(Explain, `/runs/${encodeURIComponent(id)}/explain`),
    listApprovals: (status = "pending") => request(z.array(ApprovalCard), `/approvals${qs({ status })}`),
    decideApproval: (id, d) => request(ApprovalCard, `/approvals/${encodeURIComponent(id)}/decision`, post(d)),
    listOrders: () => request(z.array(Order), "/orders"),
    listTickets: () => request(z.array(OrderTicket), "/orders/tickets"),
    manualFill: (id, input) => request(Order, `/orders/${encodeURIComponent(id)}/manual-fill`, post(input)),
    positions: () => request(z.array(Position), "/portfolio/positions"),
    pnl: (from, to) => request(z.array(PnlPoint), `/portfolio/pnl${qs({ from, to })}`),
    riskStatus: () => request(RiskStatus, "/risk/status"),
    killSwitch: (reason) => request(RiskStatus, "/risk/kill-switch", post({ reason })),
    requestKillReset: (input) => request(KillResetRequest, "/risk/kill-switch/reset/request", post(input)),
    confirmKillReset: (input) => request(RiskStatus, "/risk/kill-switch/reset/confirm", post(input)),
    limits: () => request(LimitVersion, "/limits"),
    limitsHistory: () => request(z.array(LimitVersion), "/limits/history"),
    proposeLimits: (input) => request(LimitVersion, "/limits/proposals", post(input)),
    decideLimits: (v, input) => request(LimitVersion, `/limits/proposals/${v}/approve`, post(input)),
    audit: (q = {}) => request(pageOf(AuditEntry), `/audit${qs({ ...q })}`),
    verifyAudit: () => request(ChainVerifyResult, "/audit/verify", post()),
    auditStatus: () => request(AuditStatus, "/audit/status"),
    evalSummary: () => request(EvalSummary, "/eval/summary"),
    brief: (date) => request(MorningBrief, date ? `/brief/${date}` : "/brief/today"),
    adminUsers: () => request(z.array(AdminUserView), "/admin/users"),
    adminConfig: () => request(ConfigView, "/admin/config"),
    universe: () => request(z.array(UniverseEntry), "/admin/universe"),
    restricted: () => request(z.array(RestrictedSecurity), "/admin/restricted"),
    addRestricted: (input) => request(RestrictedSecurity, "/admin/restricted", post(input)),
    requestRestrictedRemoval: (id) => request(RestrictedSecurity, `/admin/restricted/${encodeURIComponent(id)}/remove-request`, post()),
    confirmRestrictedRemoval: (id) => request(Void, `/admin/restricted/${encodeURIComponent(id)}/remove-confirm`, post()),
    liveArm: () => request(LiveArmState, "/admin/live"),
    armLive: (totp) => request(LiveArmState, "/admin/live/arm", post({ totp })),
    confirmLive: (totp) => request(LiveArmState, "/admin/live/confirm", post({ totp })),
    injectDemo: (scenario) =>
      request(z.object({ disclosure_index: z.number().nullable(), run_id: z.string().nullable() }), "/admin/demo/inject", post({ scenario })),
    setTamper: () => Promise.reject(new ApiError(403, "mock_only", "Kurcalama testi yalnızca demo veritabanında çalışır.")),
    resetDemo: () => Promise.reject(new ApiError(403, "mock_only", "Demo verisini sıfırlama yalnızca mock modda vardır.")),
  };
}

/** POST /auth/login (http mode). Returns the user; the access token stays in memory. */
export async function httpLogin(email: string, password: string): Promise<Me> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new ApiError(res.status, "login", "Kimlik doğrulanamadı.");
  const body = z.object({ access_token: z.string(), user: Me }).parse(await res.json());
  accessToken = body.access_token;
  return body.user;
}
