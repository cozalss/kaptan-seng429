/**
 * The colour of a signed figure (projector rule): up in deep green, down in claret, flat in
 * ink. Claret is not north red, which stays reserved for Durdur, veto and a broken chain.
 * The sign is always also written (+/−), so colour is never the only carrier.
 */
export function signTone(n: number | null | undefined): "text-gain" | "text-loss" | "text-ink" {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return "text-ink";
  return n > 0 ? "text-gain" : "text-loss";
}
