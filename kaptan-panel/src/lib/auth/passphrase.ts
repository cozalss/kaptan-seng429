/**
 * The test double's one passphrase (e2e and unit tests sign in with it). Real sign-in is checked
 * by the API, never here; nothing a real build ships imports this file.
 */
export const TEST_PASSPHRASE = "kaptan2026";

/** Length-independent comparison (no early exit on the first differing character). */
export function passphraseMatches(input: string, expected: string = TEST_PASSPHRASE): boolean {
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
