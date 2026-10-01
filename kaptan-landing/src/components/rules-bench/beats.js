// The pinned chapter as a pure function of scroll progress p (0 … 1). Five beats: E1, E2, E3, E4,
// then the filters. In each rule's beat its instrument walks across the threshold first, then its
// pennant runs up the halyard; in the filters' beat the leak line climbs past 8 % (every pennant
// dips to half-mast) and falls back before the pin lets go. Snap points sit where a beat is
// complete, so the page always comes to rest on a fired rule. No DOM; show.js applies the pose.

export const RULE_IDS = Object.freeze(['E1', 'E2', 'E3', 'E4']);
const BEAT = 0.18; // each rule's share of the pin; the filters take the last 0.28
const RULES_END = 4 * BEAT;
const FILTERS = 1 - RULES_END;

/** Snap points / scroll labels: where each beat comes to rest. */
export const BEAT_LABELS = Object.freeze({ start: 0, E1: 0.18, E2: 0.36, E3: 0.54, E4: 0.72, filters: 0.86, end: 1 });

const clamp01 = (x) => Math.min(1, Math.max(0, x));
// A snapped scroll lands a pixel or two either side of a label; the beat changes just past it.
const SETTLE = 0.06; // in beats (≈ 1 % of the pin)
/** Smoothstep of x over [a, b]. */
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * @param {number} p scroll progress through the pin
 * @returns {{ active: number, slot: string, instrument: Record<string, number>, gate: number[],
 *   leak: number, filterInk: number }}
 *   active: 0–3 the rule in focus, 4 the filters; slot: which instrument the shared slot shows;
 *   instrument: each rule's scrubbed progress (0 preset … 1 past the threshold);
 *   gate: how far each rule's pennant may be hoisted (0 … 1; the glue also needs the rule fired);
 *   leak: the leak line's progress (crosses 8 % near 0.43); filterInk: the filter line inking in.
 */
export function poseAt(p) {
  const x = clamp01(Number.isFinite(p) ? p : 0);
  const active = x <= 0 ? 0 : Math.min(4, Math.ceil(x / BEAT - SETTLE) - 1);
  const instrument = {};
  const gate = RULE_IDS.map((id, k) => {
    const local = (x - k * BEAT) / BEAT;
    instrument[id] = smooth(0, 0.45, local);
    return smooth(0.45, 1, local);
  });
  const f = (x - RULES_END) / FILTERS;
  return {
    active,
    slot: active < 4 ? RULE_IDS[active] : 'leak',
    instrument,
    gate,
    leak: smooth(0, 0.36, f) * (1 - smooth(0.64, 0.96, f)),
    filterInk: smooth(0, 0.3, f),
  };
}

/** Where in the pin a rule's underline is drawn (0 … 1 across its beat). */
export const beatProgress = (p, k) => clamp01((p - k * BEAT) / BEAT);

/** The label a pick scrolls to (a rule's own, or the filters' for the leak). */
export function labelFor(id) {
  return id in BEAT_LABELS ? id : id === 'leak' ? 'filters' : 'start';
}
