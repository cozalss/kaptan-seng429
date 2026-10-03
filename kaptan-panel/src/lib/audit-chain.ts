import type { AuditEntry, ChainVerifyResult } from "@/lib/domain";
import { sha256Hex } from "@/lib/hash";

/**
 * Hash chain as specified in 07 §9 / 09 §7:
 *   canonical = [chain_pos, occurred_at (UTC), actor, action, entity_type, entity_id,
 *                run_id, strategy_version, payload]
 *   hash      = sha256(prev_hash || canonical), genesis prev_hash = "00".
 * The panel never trusts this for real verification (the API does); the mock uses it so
 * "Zinciri doğrula" (Ayarlar) behaves exactly like the backend would.
 */
export const GENESIS_PREV_HASH = "00";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export type ChainFields = Omit<AuditEntry, "hash" | "prev_hash" | "seq">;

export function canonicalOf(e: ChainFields): string {
  return JSON.stringify([
    e.chain_pos,
    e.occurred_at,
    e.actor,
    e.action,
    e.entity_type,
    e.entity_id,
    e.run_id,
    e.strategy_version,
    sortKeys(e.payload),
  ]);
}

export function hashOf(prevHash: string, e: ChainFields): string {
  return sha256Hex(prevHash + canonicalOf(e));
}

/** Append entries to a chain, computing seq, prev_hash and hash. Returns a new array. */
export function appendToChain(chain: readonly AuditEntry[], fields: readonly Omit<ChainFields, "chain_pos">[]): AuditEntry[] {
  const out = [...chain];
  for (const f of fields) {
    const last = out[out.length - 1];
    const chain_pos = (last?.chain_pos ?? 0) + 1;
    const prev_hash = last?.hash ?? GENESIS_PREV_HASH;
    const full: ChainFields = { ...f, chain_pos };
    out.push({ ...full, seq: chain_pos, prev_hash, hash: hashOf(prev_hash, full) });
  }
  return out;
}

export function verifyChain(
  chain: readonly AuditEntry[],
  nowIso: string,
  anchor: { at: string; chain_pos: number; hash: string } | null = null,
): ChainVerifyResult {
  const fail = (pos: number, kind: NonNullable<ChainVerifyResult["kind"]>, checked: number): ChainVerifyResult => ({
    ok: false,
    first_bad_pos: pos,
    kind,
    checked,
    head_hash: chain[chain.length - 1]?.hash ?? GENESIS_PREV_HASH,
    verified_at: nowIso,
    anchor,
  });
  let prev = GENESIS_PREV_HASH;
  for (let i = 0; i < chain.length; i += 1) {
    const e = chain[i] as AuditEntry;
    if (e.chain_pos !== i + 1) return fail(i + 1, "gap_or_duplicate", i);
    if (e.prev_hash !== prev) return fail(e.chain_pos, "prev_hash_mismatch", i);
    if (hashOf(e.prev_hash, e) !== e.hash) return fail(e.chain_pos, "hash_mismatch", i);
    if (anchor && anchor.chain_pos === e.chain_pos && anchor.hash !== e.hash) return fail(e.chain_pos, "anchor_mismatch", i);
    prev = e.hash;
  }
  return {
    ok: true,
    first_bad_pos: null,
    kind: null,
    checked: chain.length,
    head_hash: prev,
    verified_at: nowIso,
    anchor,
  };
}
