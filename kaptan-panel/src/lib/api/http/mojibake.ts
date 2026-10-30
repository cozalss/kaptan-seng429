/**
 * Turkish text that was UTF-8 but got decoded as Windows-1254 on the way in ("TUKAÅ\udc9e GIDA"
 * for "TUKAŞ GIDA", "dÄ±ÅŸÄ±nda" for "dışında"). Undecodable bytes survive as lone surrogates
 * U+DC80–U+DCFF (Python's surrogateescape). This turns such a string back into the bytes it
 * came from and decodes them as UTF-8. Anything that is not exactly that pattern — correct
 * Turkish, plain ASCII, a byte sequence that is not valid UTF-8 — is returned unchanged.
 */

/** Windows-1254 bytes 0x80–0x9F and the six letters that differ from Latin-1. */
const CP1254: Readonly<Record<number, number>> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99,
  0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x0178: 0x9f,
  0x011e: 0xd0, 0x0130: 0xdd, 0x015e: 0xde, 0x011f: 0xf0, 0x0131: 0xfd, 0x015f: 0xfe,
};

/** The lead bytes of Turkish letters and punctuation as cp1254 shows them: Ã Ä Å â. */
const SUSPECT = /[ÃÄÅâ]/;

const decoder = typeof TextDecoder === "undefined" ? null : new TextDecoder("utf-8", { fatal: true });

export function repairMojibake(text: string): string {
  if (!decoder || !SUSPECT.test(text)) return text;
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    const b = c < 0x80 ? c : c >= 0xdc80 && c <= 0xdcff ? c - 0xdc00 : (CP1254[c] ?? (c >= 0xa0 && c <= 0xff ? c : -1));
    if (b < 0) return text;
    bytes[i] = b;
  }
  try {
    return decoder.decode(bytes);
  } catch {
    return text;
  }
}

/** Every string inside a parsed JSON value, repaired; a new value (the input is not touched). */
export function repairDeep(value: unknown): unknown {
  if (typeof value === "string") return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, repairDeep(v)]));
  }
  return value;
}
