/**
 * Single-user sign-in (PERSONAL-SPEC §4). Mock mode has one demo passphrase, printed on
 * /login on purpose ("demo parolası"): the mock deployment is a public demo with fictional
 * data, and the cookie it sets is not a security boundary. In http mode the passphrase is
 * checked by the API, never here.
 */
export const DEMO_PASSPHRASE = "kaptan-demo";

/** Length-independent comparison (no early exit on the first differing character). */
export function passphraseMatches(input: string, expected: string = DEMO_PASSPHRASE): boolean {
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
