// Kanıt — the plate's timeline, as pure functions of the clock. A fictional event card is set on
// the easel; then, three times, a drawer of the event memory (a card-catalogue chest) slides out,
// a past event's index card rises from it, Kanıt reads its heading only — its lower half, the
// later return, is covered by an indigo paper mask — and lays it in the row. When the choice is
// ruled closed, and only then, the code's counter lifts the masks one by one and inks each return
// as a bar on its tally, then the summary. The row is wiped and the next event comes in: two
// rounds per loop, so the loop has no seam. Choose first, uncover later — never the other way.
// Nothing here touches the DOM: `frameAt(t, state)` rewrites a preallocated state object.

export const TAU = Math.PI * 2;

/** Cards laid in the row per event. */
export const PICKS = 3;

/** Drawers of the chest: 3 columns × 4 rows, read left to right, top to bottom. */
export const DRAWER_COLS = 3;
export const DRAWER_ROWS = 4;
export const DRAWERS = DRAWER_COLS * DRAWER_ROWS;

/**
 * Two events per loop (fictional); each with three similar past events picked from the
 * memory. `drawer` is where a card is kept; `result` is the fictional later return as a bar on the
 * code's tally (−1…1, no unit, no number is ever printed); `curve` is its little ink line.
 */
export const ROUNDS = Object.freeze(
  [
    {
      query: { issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Pay geri alım işlemleri', code: 'E1' },
      picks: [
        { drawer: 4, issuer: 'ÖRNEK GIDA A.Ş.', title: 'Pay geri alım işlemleri', result: 0.55 },
        { drawer: 9, issuer: 'ÖRNEK LOJİSTİK A.Ş.', title: 'Geri alım programı', result: -0.3 },
        { drawer: 6, issuer: 'ÖRNEK ALTYAPI A.Ş.', title: 'Pay geri alım işlemleri', result: 0.2 },
      ],
    },
    {
      query: { issuer: 'ÖRNEK ALTYAPI A.Ş.', title: 'Yeni iş ilişkisi', code: 'E3' },
      picks: [
        { drawer: 7, issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Yeni iş ilişkisi', result: -0.15 },
        { drawer: 3, issuer: 'ÖRNEK GIDA A.Ş.', title: 'İhale sonucu', result: 0.4 },
        { drawer: 11, issuer: 'ÖRNEK LOJİSTİK A.Ş.', title: 'Yeni iş ilişkisi', result: 0.1 },
      ],
    },
  ].map((round, r) =>
    Object.freeze({
      index: r,
      query: Object.freeze({ ...round.query, sheet: r * (PICKS + 1) }),
      picks: Object.freeze(round.picks.map((pick, i) => Object.freeze({ ...pick, slot: i, sheet: r * (PICKS + 1) + 1 + i }))),
    }),
  ),
);

/** Seconds, local to a round (r = 0 the moment the round's event card starts in). */
export const TIMING = Object.freeze({
  round: 15.6,
  queryIn: 0.9, // the event card slides onto the easel
  queryReadFrom: 0.95,
  queryReadTo: 1.75,
  pickFrom: 2.0, // first drawer starts out
  pickEvery: 2.3,
  drawerOut: 0.5,
  rise: 0.55, // the card lifts out of the drawer to the reading place
  headRead: 0.5, // the heading — and only the heading — is read
  flight: 0.95, // on to its slot in the row
  drawerIn: 0.5, // the drawer closes while the card flies
  closeAt: 9.3, // the choice is ruled closed
  closeFor: 0.5,
  revealFrom: 10.1, // only then: the code lifts the masks
  revealEvery: 1.0,
  rod: 0.3,
  unmask: 0.45,
  bar: 0.35,
  sumAt: 13.3,
  sumFor: 0.45,
  wipeFrom: 14.3,
  wipeFor: 0.9,
  intro: 1.6,
  start: 3.4, // loop phase shown at elapsed 0: a drawer is already out
});

export const LOOP = ROUNDS.length * TIMING.round;

/** A still worth printing (reduced motion): the choice closed, the first mask lifted, two still on. */
export const STILL_ELAPSED = TIMING.revealFrom + TIMING.rod + TIMING.unmask + TIMING.bar + 0.1 - TIMING.start;

export const STAGES = Object.freeze({ hidden: 0, rise: 1, read: 2, flight: 3, placed: 4 });

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
export const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

/** When pick i's drawer starts out (round-local seconds). */
export const pickStart = (i) => TIMING.pickFrom + i * TIMING.pickEvery;
/** When pick i lands in its slot. */
export const pickLands = (i) => pickStart(i) + TIMING.drawerOut + TIMING.rise + TIMING.headRead + TIMING.flight;
/** When the code starts to lift mask j. */
export const revealStart = (j) => TIMING.revealFrom + j * TIMING.revealEvery;

function createCardState() {
  return {
    stage: STAGES.hidden,
    alpha: 0,
    rise: 0, // out of the drawer → the reading place
    read: 0, // a reading rule over the heading only
    tick: 0, // the heading accepted
    fly: 0, // reading place → slot
    mask: 0, // 0 covered → 1 lifted off (by the code, after the choice)
    bar: 0, // its return inked on the code's tally
  };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    r: 0, // round-local time
    round: 0,
    elapsed: 0,
    intro: 1,
    fade: 1, // the round's wipe (cards, masks, tally)
    camera: { yaw: 0, pitch: 0 },
    query: { alpha: 0, arrive: 0, read: 0 },
    drawer: -1, // the drawer standing open (one at a time)
    open: 0,
    cards: Array.from({ length: PICKS }, createCardState),
    close: 0, // the choice ruled closed
    reveal: -1, // the mask the code's rod is on
    rod: 0,
    crank: 0, // the counter's wheel turns while it works
    sum: 0,
  };
}

function writeCard(card, r, i) {
  const s = pickStart(i) + TIMING.drawerOut;
  card.rise = 0;
  card.read = 0;
  card.tick = 0;
  card.fly = 0;
  card.alpha = 0;
  card.stage = STAGES.hidden;
  const j = revealStart(i);
  card.mask = smooth(span(r, j + TIMING.rod, j + TIMING.rod + TIMING.unmask));
  card.bar = easeOut(span(r, j + TIMING.rod + TIMING.unmask, j + TIMING.rod + TIMING.unmask + TIMING.bar));
  if (r < s) return;
  card.alpha = 1;
  card.rise = easeOut(span(r, s, s + TIMING.rise));
  if (r < s + TIMING.rise) {
    card.stage = STAGES.rise;
    return;
  }
  const readAt = s + TIMING.rise;
  card.read = smooth(span(r, readAt, readAt + TIMING.headRead * 0.8));
  card.tick = smooth(span(r, readAt + TIMING.headRead * 0.7, readAt + TIMING.headRead));
  if (r < readAt + TIMING.headRead) {
    card.stage = STAGES.read;
    return;
  }
  const flyAt = readAt + TIMING.headRead;
  card.fly = easeInOut(span(r, flyAt, flyAt + TIMING.flight));
  card.stage = r < flyAt + TIMING.flight ? STAGES.flight : STAGES.placed;
}

/** The drawer standing open at round time r, and how far (0 shut → 1 out). */
export function writeDrawer(state, r, round) {
  state.drawer = -1;
  state.open = 0;
  for (let i = 0; i < PICKS; i += 1) {
    const s = pickStart(i);
    const shut = s + TIMING.drawerOut + TIMING.rise + TIMING.headRead;
    if (r < s || r > shut + TIMING.drawerIn) continue;
    state.drawer = ROUNDS[round].picks[i].drawer;
    state.open = r < shut ? easeOut(span(r, s, s + TIMING.drawerOut)) : 1 - smooth(span(r, shut, shut + TIMING.drawerIn));
  }
  return state;
}

/**
 * The frame at `elapsed` seconds since the plate was first shown.
 * @param {number} elapsed
 * @param {ReturnType<typeof createFrameState>} state
 */
export function frameAt(elapsed, state = createFrameState()) {
  const t = wrap(elapsed + TIMING.start, LOOP);
  const round = Math.min(ROUNDS.length - 1, Math.floor(t / TIMING.round));
  const r = t - round * TIMING.round;
  state.t = t;
  state.r = r;
  state.round = round;
  state.elapsed = elapsed;
  state.intro = smooth(span(elapsed, 0, TIMING.intro));
  // The camera breathes once per loop, so the seam stays invisible.
  state.camera.yaw = 0.04 * Math.sin((TAU * t) / LOOP);
  state.camera.pitch = 0.015 * Math.sin((2 * TAU * t) / LOOP);
  state.fade = 1 - smooth(span(r, TIMING.wipeFrom, TIMING.wipeFrom + TIMING.wipeFor));
  const q = state.query;
  q.arrive = easeOut(span(r, 0, TIMING.queryIn));
  q.alpha = smooth(span(r, 0, TIMING.queryIn * 0.6)) * state.fade;
  q.read = smooth(span(r, TIMING.queryReadFrom, TIMING.queryReadTo));
  writeDrawer(state, r, round);
  for (let i = 0; i < PICKS; i += 1) writeCard(state.cards[i], r, i);
  state.close = smooth(span(r, TIMING.closeAt, TIMING.closeAt + TIMING.closeFor));
  state.reveal = -1;
  state.rod = 0;
  for (let j = 0; j < PICKS; j += 1) {
    const s = revealStart(j);
    const end = s + TIMING.rod + TIMING.unmask;
    if (r < s || r > end) continue;
    state.reveal = j;
    // out to the mask, then back with it
    state.rod = r < s + TIMING.rod ? smooth(span(r, s, s + TIMING.rod)) : 1 - smooth(span(r, end - 0.2, end));
  }
  // the wheel turns a third of a revolution per mask (whole turn per round: no seam at the wipe)
  let turn = 0;
  for (let j = 0; j < PICKS; j += 1) turn += smooth(span(r, revealStart(j), revealStart(j) + TIMING.rod + TIMING.unmask)) / PICKS;
  state.crank = turn * TAU;
  state.sum = smooth(span(r, TIMING.sumAt, TIMING.sumAt + TIMING.sumFor));
  return state;
}
