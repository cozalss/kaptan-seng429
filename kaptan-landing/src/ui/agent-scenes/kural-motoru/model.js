// Kural Motoru — the plate's timeline, as pure functions of the clock. Punched evidence cards
// (fictional) wait in a hopper; one at a time a card is fed under the reading bridge,
// whose pins drop onto its punch row; the slate writes the card's value against the written
// threshold, the telegraph's needle swings to the decided gate (E1–E4, or "eşik altı"), and the
// card runs along the rail to that gate and drops into its tray. Card No. 201 is fed twice in a
// loop and lands in the same tray both times — same input, same decision. When the loop's last
// card is in, the trays are emptied (the cards sink out of sight) before the first lands again,
// so the loop has no seam. Nothing here moves by chance and nothing touches the DOM:
// `frameAt(elapsed, state)` rewrites a preallocated state object that the renderer draws.

export const TAU = Math.PI * 2;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeIn = (t) => t * t;
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

/** The exits along the rail, left to right: four gates and the end of the rail. */
export const GATES = Object.freeze([
  Object.freeze({ id: 'e1', code: 'E1', mono: true, rule: Object.freeze(['10 seansta', '≥ %0,25 sermaye']), short: '≥ %0,25' }),
  Object.freeze({ id: 'e2', code: 'E2', mono: true, rule: Object.freeze(['sayısal', 'eşik yok']), short: 'eşik yok' }),
  Object.freeze({ id: 'e3', code: 'E3', mono: true, rule: Object.freeze(['yıllık gelirin', '≥ %10’u']), short: '≥ %10' }),
  Object.freeze({ id: 'e4', code: 'E4', mono: true, rule: Object.freeze(['sayısal', 'eşik yok']), short: 'eşik yok' }),
  Object.freeze({ id: 'alti', code: 'Eşik altı', mono: false, rule: Object.freeze(['karar yok']), short: 'karar yok' }),
]);
const GATE_INDEX = Object.freeze(Object.fromEntries(GATES.map((gate, i) => [gate.id, i])));
export const REJECT = GATE_INDEX.alti;

/**
 * The distinct inputs (fictional): each card's punch row, its printed field and the line the
 * slate writes — the field's value set against the rule's written threshold.
 */
export const INPUTS = Object.freeze(
  [
    {
      serial: 201,
      issuer: 'ÖRNEK ENERJİ A.Ş.',
      code: 'E1',
      field: 'Geri alım %0,31 · 10 seans',
      slate: '%0,31 ≥ %0,25',
      gate: 'e1',
      holes: [1, 0, 1, 1, 0, 0],
    },
    {
      serial: 202,
      issuer: 'ÖRNEK ALTYAPI A.Ş.',
      code: 'E3',
      field: 'Yıllık tutar / gelir %14',
      slate: '%14 ≥ %10',
      gate: 'e3',
      holes: [0, 1, 0, 1, 1, 0],
    },
    { serial: 203, issuer: 'ÖRNEK GIDA A.Ş.', code: 'E2', field: 'Yönetici pay alımı', slate: 'eşik yok', gate: 'e2', holes: [1, 1, 0, 0, 0, 1] },
    { serial: 204, issuer: 'ÖRNEK LOJİSTİK A.Ş.', code: 'E4', field: 'Finansal sonuç', slate: 'eşik yok', gate: 'e4', holes: [0, 0, 1, 0, 1, 1] },
    {
      serial: 205,
      issuer: 'ÖRNEK GIDA A.Ş.',
      code: 'E1',
      field: 'Geri alım %0,18 · 10 seans',
      slate: '%0,18 < %0,25',
      gate: 'alti',
      holes: [1, 0, 0, 1, 0, 1],
    },
  ].map((input, i) =>
    Object.freeze({ ...input, index: i, gateIndex: GATE_INDEX[input.gate], holes: Object.freeze(input.holes) }),
  ),
);

/** One loop's feed: input 0 (No. 201) goes through twice. */
const FEED_ORDER = Object.freeze([0, 1, 2, 0, 3, 4]);
export const REPEAT_INPUT = 0;

/** Seconds. A card's local clock u is 0 the moment it stops under the reading bridge. */
export const TIMING = Object.freeze({
  every: 3.2, // one card under the bridge every 3.2 s
  feed: 0.75, // hopper → bridge
  advance: 0.45, // the deck steps forward after a card leaves
  pinsDown: 0.12,
  pinsFor: 0.28,
  slateFrom: 0.42,
  slateFor: 0.38,
  swingAt: 0.86, // the needle swings to the decided gate
  swingFor: 0.42,
  pinsUp: 1.12,
  pinsUpFor: 0.18,
  leave: 1.38, // the card leaves the bridge
  travelBase: 0.35,
  speed: 3.2, // world units per second along the rail (plus the base)
  drop: 0.42,
  bracket: 0.5, // the "same decision" bracket inks in after the repeat lands
  wipeAfter: 0.7, // seconds after the loop's last landing that the trays start to empty
  wipeFor: 0.75,
  intro: 1.6,
  start: 2 * 3.2 - 0.75 - 0.35, // loop phase shown at elapsed 0: No. 203 about to be fed, No. 201 in its tray
});

export const LOOP = FEED_ORDER.length * TIMING.every;

/** Where the reader sits on the rail and where each gate is (world x; world.js lays the rest). */
export const RAIL = Object.freeze({
  reader: -1.75,
  gates: Object.freeze([-0.6, 0.38, 1.36, 2.34, 3.32]),
});

/** Seconds a card takes from the bridge to its gate (a steady machine pace). */
export function travelTime(gateIndex) {
  return TIMING.travelBase + (RAIL.gates[gateIndex] - RAIL.reader) / TIMING.speed;
}

/** u at which a card bound for `gateIndex` comes to rest in its tray. */
export function landU(gateIndex) {
  return TIMING.leave + travelTime(gateIndex) + TIMING.drop;
}

/** The loop's cards, each with its input, gate, and slot in its tray (0 back, 1 in front). */
export const CAST = Object.freeze(
  FEED_ORDER.map((inputIndex, k) => {
    const input = INPUTS[inputIndex];
    const slot = FEED_ORDER.slice(0, k).filter((j) => INPUTS[j].gateIndex === input.gateIndex).length;
    return Object.freeze({ index: k, input: inputIndex, gateIndex: input.gateIndex, slot, repeat: inputIndex === REPEAT_INPUT && slot > 0 });
  }),
);
export const MAX_SLOTS = 2;
/** The second pass of No. 201 (its tray's front slot). */
export const REPEAT_CARD = CAST.findIndex((card) => card.repeat);

/** Loop phase of card k's landing. */
export function landingPhase(k) {
  return wrap(k * TIMING.every + landU(CAST[k].gateIndex), LOOP);
}

const LAST_LANDING = (() => {
  // the landing that comes last before the first card's (scanning back from card 0's)
  const first = landingPhase(0);
  let best = 0;
  let gap = Infinity;
  for (let k = 1; k < CAST.length; k += 1) {
    const g = wrap(first - landingPhase(k), LOOP);
    if (g < gap) {
      gap = g;
      best = k;
    }
  }
  return best;
})();
/** Loop phase at which the trays start to empty (the "day" is ruled off). */
export const DAY_BREAK = wrap(landingPhase(LAST_LANDING) + TIMING.wipeAfter, LOOP);

export const STAGES = Object.freeze({ hidden: 0, hopper: 1, feed: 2, read: 3, travel: 4, drop: 5 });

/** A still worth printing (reduced motion): No. 201 twice in E1, No. 204 read, needle on E4. */
export const STILL_ELAPSED = 4 * TIMING.every + TIMING.swingAt + TIMING.swingFor + 0.02 - TIMING.start;


/** Card k's local time at loop time t, in [-(LOOP - LIVE), LIVE). */
const LIVE = 5; // u past which a card is no longer drawn as moving (it is in its tray)
export function cardClock(t, k) {
  return wrap(t - k * TIMING.every + (LOOP - LIVE), LOOP) - (LOOP - LIVE);
}

/** Deck position of a waiting card (0 = front of the hopper), continuous while the deck steps. */
export function deckPosition(u) {
  const p = (-u - TIMING.feed) / TIMING.every; // cards ahead of it, counting the bridge
  const s = Math.floor(p);
  const adv = TIMING.advance / TIMING.every;
  return s + smooth(span(p - s, 1 - adv, 1));
}

function createCardState() {
  return {
    stage: STAGES.hidden,
    alpha: 0,
    deck: 0, // hopper position (0 front)
    feed: 0, // 0 hopper → 1 under the bridge
    travel: 0, // 0 bridge → 1 over its gate
    drop: 0, // 0 on the rail → 1 in the tray
    u: 0,
  };
}

function createTrayCardState() {
  return { card: -1, alpha: 0, sink: 0 };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    elapsed: 0,
    intro: 1,
    camera: { yaw: 0, pitch: 0 },
    cards: CAST.map(createCardState),
    trays: GATES.map(() => Array.from({ length: MAX_SLOTS }, createTrayCardState)),
    pins: 0, // 0 up → 1 resting on the card under the bridge
    pinCard: -1, // which card the pins read (its holes let pins through)
    slate: { card: -1, write: 0, verdict: 0, alpha: 0 },
    needle: 0, // radians, dial convention (0 → right, π/2 → up)
    target: -1, // the gate the card in hand is bound for (its plaque is underlined)
    targetInk: 0,
    flap: { gate: -1, open: 0 },
    bracket: { ink: 0, alpha: 0 },
  };
}

/** Needle angle for a gate: E1–E4 across the dial's upper half, "eşik altı" straight down. */
export function needleAngle(gateIndex) {
  if (gateIndex === REJECT) return -Math.PI / 2;
  return Math.PI - (gateIndex + 0.5) * (Math.PI / 4);
}

/** Interpolates two angles along the shorter way round. */
export function lerpAngle(a, b, f) {
  const d = wrap(b - a + Math.PI, TAU) - Math.PI;
  return a + d * f;
}

function writeCard(card, u, gateIndex) {
  card.u = u;
  card.deck = 0;
  card.feed = 0;
  card.travel = 0;
  card.drop = 0;
  card.alpha = 1;
  if (u < -TIMING.feed) {
    card.stage = STAGES.hopper;
    card.deck = deckPosition(u);
    card.alpha = 1 - smooth(span(card.deck, 1.6, 2.4));
    if (card.alpha <= 0) card.stage = STAGES.hidden;
    return;
  }
  if (u < 0) {
    card.stage = STAGES.feed;
    card.feed = easeInOut(span(u, -TIMING.feed, 0));
    return;
  }
  card.feed = 1;
  if (u < TIMING.leave) {
    card.stage = STAGES.read;
    return;
  }
  const travel = travelTime(gateIndex);
  if (u < TIMING.leave + travel) {
    card.stage = STAGES.travel;
    card.travel = easeInOut(span(u, TIMING.leave, TIMING.leave + travel));
    return;
  }
  card.travel = 1;
  if (u < landU(gateIndex)) {
    card.stage = STAGES.drop;
    card.drop = easeIn(span(u, TIMING.leave + travel, landU(gateIndex)));
    return;
  }
  card.stage = STAGES.hidden; // it is in its tray now (see writeTrays)
  card.alpha = 0;
}

/** The trays at day phase tau (seconds since the trays were last emptied). */
export function writeTrays(trays, tau) {
  const emptying = tau < TIMING.wipeFor;
  const sink = smooth(span(tau, 0, TIMING.wipeFor));
  for (let g = 0; g < trays.length; g += 1) {
    for (let s = 0; s < MAX_SLOTS; s += 1) {
      trays[g][s].card = -1;
      trays[g][s].alpha = 0;
      trays[g][s].sink = 0;
    }
  }
  let repeatLanded = -1;
  for (let k = 0; k < CAST.length; k += 1) {
    const { gateIndex, slot } = CAST[k];
    const at = wrap(landingPhase(k) - DAY_BREAK, LOOP);
    const entry = trays[gateIndex][slot];
    if (at <= tau) {
      entry.card = k;
      entry.alpha = 1;
      if (CAST[k].repeat) repeatLanded = tau - at;
    } else if (emptying) {
      // yesterday's cards, sinking out of sight
      entry.card = k;
      entry.alpha = 1 - smooth(span(tau, TIMING.wipeFor * 0.35, TIMING.wipeFor));
      entry.sink = sink;
      if (CAST[k].repeat) repeatLanded = Infinity;
    }
  }
  return repeatLanded;
}

/**
 * The frame at `elapsed` seconds since the plate was first shown.
 * @param {number} elapsed
 * @param {ReturnType<typeof createFrameState>} state
 */
export function frameAt(elapsed, state = createFrameState()) {
  const t = wrap(elapsed + TIMING.start, LOOP);
  state.t = t;
  state.elapsed = elapsed;
  state.intro = smooth(span(elapsed, 0, TIMING.intro));
  // the camera breathes once per loop, so the seam stays invisible
  state.camera.yaw = 0.035 * Math.sin((TAU * t) / LOOP);
  state.camera.pitch = 0.012 * Math.sin((2 * TAU * t) / LOOP);
  for (let k = 0; k < CAST.length; k += 1) writeCard(state.cards[k], cardClock(t, k), CAST[k].gateIndex);

  // the card under the bridge (or the one that just left it) runs the pins, slate and needle
  const c = Math.floor(t / TIMING.every) % CAST.length;
  const u = t - c * TIMING.every;
  const prev = (c + CAST.length - 1) % CAST.length;
  const down = smooth(span(u, TIMING.pinsDown, TIMING.pinsDown + TIMING.pinsFor));
  const up = smooth(span(u, TIMING.pinsUp, TIMING.pinsUp + TIMING.pinsUpFor));
  state.pins = down * (1 - up);
  state.pinCard = c;
  state.needle = lerpAngle(
    needleAngle(CAST[prev].gateIndex),
    needleAngle(CAST[c].gateIndex),
    smooth(span(u, TIMING.swingAt, TIMING.swingAt + TIMING.swingFor)),
  );
  const slate = state.slate;
  if (u < TIMING.slateFrom - 0.1) {
    // the last ruling is wiped off as the next card stops
    slate.card = prev;
    slate.write = 1;
    slate.verdict = 1;
    slate.alpha = 1 - smooth(span(u, 0, TIMING.slateFrom - 0.1));
  } else {
    slate.card = c;
    slate.write = span(u, TIMING.slateFrom, TIMING.slateFrom + TIMING.slateFor);
    slate.verdict = smooth(span(u, TIMING.swingAt, TIMING.swingAt + TIMING.swingFor));
    slate.alpha = 1;
  }
  // the bound-for gate: its plaque is underlined from the verdict until the card is in
  state.target = -1;
  state.targetInk = 0;
  state.flap.gate = -1;
  state.flap.open = 0;
  for (let k = 0; k < CAST.length; k += 1) {
    const card = state.cards[k];
    const g = CAST[k].gateIndex;
    if (card.stage === STAGES.read && card.u >= TIMING.swingAt) {
      state.target = g;
      state.targetInk = smooth(span(card.u, TIMING.swingAt, TIMING.swingAt + TIMING.swingFor));
    } else if (card.stage === STAGES.travel || card.stage === STAGES.drop) {
      state.target = g;
      state.targetInk = 1;
    }
    // the gate's flap opens as the card arrives over it and swings shut once it is through
    const atGate = TIMING.leave + travelTime(g);
    if (card.u > atGate - 0.12 && card.u < landU(g) + 0.3) {
      state.flap.gate = g;
      state.flap.open = Math.min(span(card.u, atGate - 0.12, atGate), 1 - span(card.u, landU(g), landU(g) + 0.3));
    }
  }
  const sinceRepeat = writeTrays(state.trays, wrap(t - DAY_BREAK, LOOP));
  state.bracket.ink = sinceRepeat === Infinity ? 1 : sinceRepeat < 0 ? 0 : smooth(span(sinceRepeat, 0.15, 0.15 + TIMING.bracket));
  state.bracket.alpha = sinceRepeat === Infinity ? state.trays[CAST[REPEAT_CARD].gateIndex][1].alpha : 1;
  return state;
}
