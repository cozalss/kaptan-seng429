import type { z } from "zod";
import { can, deniedReason, type Action } from "@/lib/auth/permissions";
import { ApiError } from "../types";
import type { Actor, MockDb } from "./db";

/**
 * What every mock handler needs: the database, who is calling, a role check that refuses with
 * a typed 403 and the plain reason, and a small latency so loading states are real.
 */
export interface MockCtx {
  db: MockDb;
  /** The caller, or 401 when signed out. */
  me: () => Actor;
  /** The caller, or 403 `forbidden` with "Bunu Risk Sorumlusu yapar." when the role may not. */
  require: (action: Action) => Actor;
  ok: <T>(value: T, ms?: number) => Promise<T>;
  now: () => string;
}

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError(422, "validation", r.error.issues[0]?.message ?? "Geçersiz girdi");
  return r.data;
}

/** Small, varied latency so loading states are real in mock mode. */
function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function createCtx(db: MockDb, getActor: () => Actor | null, latency: number): MockCtx {
  const me = (): Actor => {
    const a = getActor();
    if (!a) throw new ApiError(401, "unauthenticated", "Oturum bulunamadı. Lütfen yeniden giriş yapın.");
    return a;
  };
  return {
    db,
    me,
    require: (action) => {
      const a = me();
      if (!can(a.role, action)) throw new ApiError(403, "forbidden", deniedReason(action, a.role));
      return a;
    },
    ok: (value, ms = latency) => delay(value, ms),
    now: () => db.nowIso(),
  };
}

/** The audit actor string for a person ("user:uye-3"). */
export const userActor = (a: Actor) => `user:${a.uid}`;

/** A signature for a decision: who, in which role, when, why. */
export function signatureOf(a: Actor, at: string, reason: string | null) {
  return { uid: a.uid, name: a.name, role: a.role, at, reason };
}
