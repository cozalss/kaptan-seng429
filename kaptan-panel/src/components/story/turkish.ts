/**
 * Turkish suffixes after numbers, written the way they are read aloud: "%18’i", "%61’inde",
 * "09:50’ye", "%60’ında". Vowel harmony follows the last spoken word of the number
 * ("altmış bir" → bir → 'i). Pure; used so sentences never need a "(ları)" crutch.
 */
const ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"] as const;
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"] as const;

/** The last word you say when reading a whole number aloud. */
export function lastSpokenWord(n: number): string {
  const v = Math.abs(Math.trunc(n));
  if (v === 0) return ONES[0];
  if (v % 10 !== 0) return ONES[v % 10] as string;
  if (v % 100 !== 0) return TENS[(v % 100) / 10] as string;
  if (v % 1000 !== 0) return "yüz";
  if (v % 1_000_000 !== 0) return "bin";
  return "milyon";
}

/** Reads the last number group of a printed value: "%0,31" → 31, "48,40" → 40, "09:50" → 50. */
export function lastNumber(text: string): number {
  const groups = text.match(/\d+/g);
  const last = groups?.[groups.length - 1];
  if (!last) return 0;
  // A decimal part is read without its trailing zeros ("0,30" → "sıfır virgül üç").
  const isDecimal = groups.length > 1 && /\d,\d+\D*$/.test(text);
  return Number(isDecimal ? last.replace(/0+$/, "") || "0" : last);
}

const VOWELS = "aeıioöuü";
function lastVowel(word: string): string {
  for (let i = word.length - 1; i >= 0; i -= 1) {
    const c = word[i] as string;
    if (VOWELS.includes(c)) return c;
  }
  return "e";
}
const endsInVowel = (word: string) => VOWELS.includes(word[word.length - 1] ?? "");

/** 4-way harmony vowel (ı i u ü) for a word. */
function narrow(word: string): string {
  const v = lastVowel(word);
  if (v === "a" || v === "ı") return "ı";
  if (v === "e" || v === "i") return "i";
  if (v === "o" || v === "u") return "u";
  return "ü";
}
/** 2-way harmony vowel (a e). */
function wide(vowel: string): string {
  return "aıou".includes(vowel) ? "a" : "e";
}

function wordOf(printed: string): string {
  // Some printed values end in a word, not a digit ("%18 yıllık gelir" is never passed here).
  return lastSpokenWord(lastNumber(printed));
}

/** Possessive: "%18" → "%18'i", "%20" → "%20'si", "%10" → "%10'u". */
export function possessive(printed: string): string {
  const w = wordOf(printed);
  return `${printed}’${endsInVowel(w) ? "s" : ""}${narrow(w)}`;
}

/** Possessive + locative: "%61" → "%61'inde", "%60" → "%60'ında", "%57" → "%57'sinde". */
export function possessiveLocative(printed: string): string {
  const w = wordOf(printed);
  const v = narrow(w);
  return `${printed}’${endsInVowel(w) ? "s" : ""}${v}nd${wide(v)}`;
}

/** Dative: "09:50" → "09:50'ye", "09:40" → "09:40'a". */
export function dative(printed: string): string {
  const w = wordOf(printed);
  return `${printed}’${endsInVowel(w) ? "y" : ""}${wide(lastVowel(w))}`;
}

const HARD = "çfhkpsşt";

/** Locative: "13:41" → "13:41’de", "13:40" → "13:40’ta", "09:30" → "09:30’da". */
export function locative(printed: string): string {
  const w = wordOf(printed);
  const d = HARD.includes(w[w.length - 1] ?? "") ? "t" : "d";
  return `${printed}’${d}${wide(lastVowel(w))}`;
}
