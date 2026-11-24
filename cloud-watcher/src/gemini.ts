/**
 * Optional better line for an important disclosure of the person's OWN stock, only when GEMINI_API_KEY is set.
 * Same idea as backend signal/llm.py: a JSON answer, checked before it is kept (length, tone list, no number that the
 * disclosure does not contain, no advice words). Cached by construction (the line is stored with the event, one call
 * per disclosure) and capped per Istanbul day. Only the public KAP subject and summary are sent: never money.
 */
import { setMeta, type State } from "./db";
import { local } from "./time";
import type { Classified, KapRow, Tone } from "./types";

export const DEFAULT_DAILY_CAP = 40;
const MODEL = "gemini-2.5-flash";
const LINE_MAX = 140;
const SO_WHAT_MAX = 200;
const TONES = new Set<string>(["olumlu", "olumsuz", "notr", "belirsiz"]);
const ADVICE = /(almalısın|satmalısın|tutmalısın|hedef fiyat|tavsiye|öneriyoruz|\bal\b|\bsat\b)/i;
/** Kinds where the rules can say little more than the KAP subject did. */
const THIN_KINDS = new Set(["contract", "earnings", "dividend", "merger", "capital"]);

const digits = (text: string): Set<string> => new Set((text.match(/\d[\d.,]*/g) ?? []).map((m) => m.replace(/\D/g, "")).filter(Boolean));

/** The checked reading, or null when the answer cannot be kept (pure). */
export function validate(output: unknown, source: string): Classified | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  const line = String(o.line ?? "").split(/\s+/).filter(Boolean).join(" ");
  const soWhat = o.so_what ? String(o.so_what).split(/\s+/).filter(Boolean).join(" ") : null;
  const tone = String(o.tone ?? "");
  if (!line || line.length > LINE_MAX || !TONES.has(tone)) return null;
  if (soWhat !== null && soWhat.length > SO_WHAT_MAX) return null;
  const allowed = digits(source);
  for (const d of [...digits(line), ...(soWhat ? digits(soWhat) : [])]) if (!allowed.has(d)) return null;
  if (ADVICE.test(line) || (soWhat !== null && ADVICE.test(soWhat))) return null;
  return { kind: "", line, tone: tone as Tone, soWhat };
}

export function prompt(row: KapRow): string {
  return [
    "Bir KAP duyurusunu sade Türkçeyle özetle. Sadece şu JSON'u ver: {\"line\": \"...\", \"tone\": \"olumlu|olumsuz|notr|belirsiz\", \"so_what\": \"...\" veya null}.",
    "Kurallar: line en çok 140 karakter, tek cümle; metinde olmayan sayı yazma; al/sat tavsiyesi verme; para tutarı uydurma.",
    `Şirket: ${row.company}`,
    `Konu: ${row.subject}`,
    `Özet: ${row.summary}`,
  ].join("\n");
}

/** One call when allowed; anything wrong returns the rule-made reading unchanged. Never throws. */
export async function refine(
  env: Env,
  state: State,
  db: D1Database,
  row: KapRow,
  base: Classified,
  now: number,
): Promise<Classified> {
  if (!env.GEMINI_API_KEY || !THIN_KINDS.has(base.kind)) return base;
  const today = local(now).date;
  const cap = Number(env.GEMINI_DAILY_CAP ?? DEFAULT_DAILY_CAP);
  const used = state.raw.get("gemini_day") === today ? Number(state.raw.get("gemini_n") ?? 0) : 0;
  if (used >= cap) return base;
  await setMeta(db, state, { gemini_day: today, gemini_n: used + 1 }); // counted before the call: a failure still costs quota
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt(row) }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 300, temperature: 0.2 },
      }),
    });
    if (!res.ok) return base;
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const checked = validate(JSON.parse(text), `${row.subject} ${row.summary}`);
    return checked ? { ...checked, kind: base.kind } : base;
  } catch {
    return base;
  }
}
