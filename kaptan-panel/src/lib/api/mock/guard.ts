import type { z } from "zod";
import { ApiError } from "../types";
import type { Actor, MockDb } from "./db";

/** What every mock handler needs: the database, who is calling and a small latency so loading states are real. */
export interface MockCtx {
  db: MockDb;
  /** The person, or 401 when signed out. */
  me: () => Actor;
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

export function createCtx(db: MockDb, user: Actor | null, latency: number): MockCtx {
  return {
    db,
    me: () => {
      if (!user) throw new ApiError(401, "unauthenticated", "Oturum bulunamadı. Yeniden giriş yap.");
      return user;
    },
    ok: (value, ms = latency) => delay(value, ms),
    now: () => db.nowIso(),
  };
}

/** The audit actor string for the person ("user:sen"). */
export const userActor = (a: Actor) => `user:${a.uid}`;

/** A recorded step: who, when, why. */
export function signatureOf(a: Actor, at: string, reason: string | null) {
  return { uid: a.uid, name: a.name, at, reason };
}

/**
 * One person takes both steps of a change that used to need two: allowed, and the ledger says so
 * as `auth.single_user_waiver` (as the backend does), so the record stays honest.
 */
export function recordWaiver(ctx: MockCtx, a: Actor, flow: string, entity: [string, string]): void {
  ctx.db.audit(userActor(a), "auth.single_user_waiver", entity[0], entity[1], { waiver: "single_user_waiver", flow, entity_type: entity[0], entity_id: entity[1], first_uid: a.uid });
}
