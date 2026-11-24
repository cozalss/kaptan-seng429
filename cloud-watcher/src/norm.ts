/** Port of backend text/turkish.py `norm_key` (checked against `norm_vectors` of the generated JSON). */
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/g;

export function trLower(s: string): string {
  return s.normalize("NFC").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

export function normKey(s: string): string {
  const clean = s.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  return trLower(clean).replace(/[^\p{L}\p{N}_\s%]/gu, " ").replace(/\s+/g, " ").trim();
}
