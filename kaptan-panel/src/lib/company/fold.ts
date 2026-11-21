/**
 * Turkish-aware matching, the same folding as the backend (`kaptan.text.turkish.join_key`): İ/i/I/ı,
 * ş/s, ğ/g, ç/c, ö/o, ü/u all meet, so "turk hava" finds "Türk Hava Yolları" and "ISIK" finds "Işık".
 */
const FOLD: Readonly<Record<string, string>> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function foldTr(text: string): string {
  const lower = text.normalize("NFC").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
  return lower
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}\s%]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower is better; null = no match (ticker, then name start, word start, anywhere). */
export function rankCompany(query: string, ticker: string, name: string): number | null {
  const key = foldTr(query);
  if (!key) return null;
  const t = foldTr(ticker);
  const n = foldTr(name);
  if (t === key) return 0;
  if (t.startsWith(key)) return 1;
  if (n.startsWith(key)) return 2;
  if (n.split(" ").some((w) => w.startsWith(key))) return 3;
  return n.includes(key) ? 4 : null;
}
