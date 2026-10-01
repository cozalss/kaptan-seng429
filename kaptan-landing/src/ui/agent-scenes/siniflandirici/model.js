// Sınıflandırıcı — the plate's timeline, as pure functions of the clock. A day's worth of fictional
// disclosure slips (a loop of twelve) drifts in out of the distance; each is set down in front of
// the reader, read top to bottom, stamped with its type (E1–E4, Filtre or Diğer), then carried on
// an arc into its cubby of the six-hole locker, where one ink tally stroke records it. When the
// day's last slip is in, the tallies are ruled off and wiped, and the next day begins — so the
// loop has no seam. Nothing here touches the DOM: `frameAt(t, state)` rewrites a preallocated
// state object that the renderer draws.

export const TAU = Math.PI * 2;

/** The six cubbies, in locker order (2 columns × 3 rows, read like the portrait's locker). */
export const BINS = Object.freeze([
  Object.freeze({ id: 'e1', code: 'E1', mono: true, col: 0, row: 0 }),
  Object.freeze({ id: 'e2', code: 'E2', mono: true, col: 1, row: 0 }),
  Object.freeze({ id: 'e3', code: 'E3', mono: true, col: 0, row: 1 }),
  Object.freeze({ id: 'e4', code: 'E4', mono: true, col: 1, row: 1 }),
  Object.freeze({ id: 'filtre', code: 'Filtre', mono: false, col: 0, row: 2 }),
  Object.freeze({ id: 'diger', code: 'Diğer', mono: false, col: 1, row: 2 }),
]);
const BIN_INDEX = Object.freeze(Object.fromEntries(BINS.map((bin, i) => [bin.id, i])));

/**
 * One day of disclosures (fictional, "Temsili"). Most of what arrives is neither E1–E4: the mix
 * is weighted to "Diğer" and "Filtre" as a day's traffic is. Titles are illustrative only.
 */
export const CAST = Object.freeze(
  [
    { bin: 'diger', issuer: 'ÖRNEK GIDA A.Ş.', title: 'Genel kurul ilanı' },
    { bin: 'e1', issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Pay geri alım işlemleri' },
    { bin: 'diger', issuer: 'ÖRNEK LOJİSTİK A.Ş.', title: 'Yönetim kurulu kararı' },
    { bin: 'filtre', issuer: 'ÖRNEK ALTYAPI A.Ş.', title: 'Tedbir bildirimi' },
    { bin: 'e3', issuer: 'ÖRNEK ALTYAPI A.Ş.', title: 'Yeni iş ilişkisi' },
    { bin: 'diger', issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Adres değişikliği' },
    { bin: 'e2', issuer: 'ÖRNEK GIDA A.Ş.', title: 'Yönetici pay alımı' },
    { bin: 'filtre', issuer: 'ÖRNEK LOJİSTİK A.Ş.', title: 'Tedbir bildirimi' },
    { bin: 'diger', issuer: 'ÖRNEK ALTYAPI A.Ş.', title: 'Genel kurul ilanı' },
    { bin: 'e4', issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Finansal rapor' },
    { bin: 'diger', issuer: 'ÖRNEK GIDA A.Ş.', title: 'Denetçi seçimi' },
    { bin: 'filtre', issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Tedbir bildirimi' },
  ].map((slip, i) => Object.freeze({ ...slip, index: i, binIndex: BIN_INDEX[slip.bin] })),
);

/** Seconds. A slip's local clock u is 0 the moment it is set down in front of the reader. */
export const TIMING = Object.freeze({
  every: 2.4, // one slip arrives every 2.4 s
  stream: 8, // drifting in from the distance
  approach: 0.8, // from the line onto the easel, once the reader is free
  readFrom: 0.2,
  readTo: 1.0,
  stampAt: 1.06,
  stampFor: 0.24,
  liftAt: 1.6,
  flight: 1.05,
  slide: 0.55,
  land: 2.85, // the tally stroke inks in as the slip enters its cubby
  tallyInk: 0.32,
  dayBreak: 1.2, // loop phase at which a day is ruled off (between two landings)
  strike: 0.45,
  wipeFrom: 0.4,
  wipeFor: 0.6,
  intro: 1.6, // the plate inks in on first sight
  start: 2.25, // loop phase shown at elapsed 0: the reader already has a slip coming
});

export const LOOP = CAST.length * TIMING.every;
const GONE = TIMING.liftAt + TIMING.flight + TIMING.slide;

/** A still worth printing (reduced motion): the E2 slip stamped, half a day tallied. */
export const STILL_ELAPSED = 6 * TIMING.every + TIMING.stampAt + TIMING.stampFor + 0.05 - TIMING.start;

export const STAGES = Object.freeze({ hidden: 0, stream: 1, read: 2, flight: 3, slide: 4 });

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

/** A slip's local time at loop time t, in [-stream, LOOP - stream). */
export function slipClock(t, index) {
  return wrap(t - index * TIMING.every + TIMING.stream, LOOP) - TIMING.stream;
}

/** The stamp's press: overshoots to the paper, then settles (0 → 1). */
export function stampPress(u) {
  const p = span(u, TIMING.stampAt, TIMING.stampAt + TIMING.stampFor);
  return p;
}

function createSlipState() {
  return {
    stage: STAGES.hidden,
    alpha: 0,
    stream: 0, // 0 far → 1 at the reader
    read: 0, // reading rule, top → bottom
    stamp: 0, // press progress
    fly: 0, // arc to the cubby mouth
    slide: 0, // mouth → inside
    flutter: 0, // seed phase for the drift wobble
    u: 0,
  };
}

function createTallyState() {
  return { marks: 0, ink: 1, strike: 0, alpha: 1, day: 0 };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    elapsed: 0,
    intro: 1,
    camera: { yaw: 0, pitch: 0 },
    slips: CAST.map(createSlipState),
    tallies: BINS.map(createTallyState),
    target: -1, // the bin the slip in hand is bound for (its plaque answers)
    targetGlow: 0,
  };
}

function writeSlip(slip, u) {
  slip.u = u;
  slip.read = 0;
  slip.stamp = 0;
  slip.fly = 0;
  slip.slide = 0;
  if (u < 0) {
    // drifts in to its place in line (reached TIMING.approach before it is set down)
    const v = Math.min(1, (u + TIMING.stream) / (TIMING.stream - TIMING.approach));
    slip.stage = STAGES.stream;
    slip.stream = easeOut(v);
    slip.alpha = smooth(span(v, 0, 0.22));
    return;
  }
  slip.stream = 1;
  if (u >= GONE) {
    slip.stage = STAGES.hidden;
    slip.alpha = 0;
    return;
  }
  slip.read = smooth(span(u, TIMING.readFrom, TIMING.readTo));
  slip.stamp = stampPress(u);
  slip.alpha = 1;
  if (u < TIMING.liftAt) {
    slip.stage = STAGES.read;
    return;
  }
  slip.fly = easeInOut(span(u, TIMING.liftAt, TIMING.liftAt + TIMING.flight));
  if (u < TIMING.liftAt + TIMING.flight) {
    slip.stage = STAGES.flight;
    return;
  }
  slip.stage = STAGES.slide;
  slip.fly = 1;
  slip.slide = easeOut(span(u, TIMING.liftAt + TIMING.flight, GONE));
  slip.alpha = 1 - smooth(span(u, GONE - 0.22, GONE));
}

/** Phase of slip k's landing, measured from the day's break. */
export function landingPhase(index) {
  return wrap(index * TIMING.every + TIMING.land - TIMING.dayBreak, LOOP);
}

/** Tally strokes per bin at day phase tau (seconds since the day's break). */
export function writeTallies(tallies, tau) {
  const closing = tau < TIMING.wipeFrom + TIMING.wipeFor;
  for (let b = 0; b < tallies.length; b += 1) {
    const tally = tallies[b];
    tally.marks = 0;
    tally.ink = 1;
    tally.strike = 0;
    tally.alpha = 1;
    tally.day = 0;
  }
  for (let k = 0; k < CAST.length; k += 1) {
    const tally = tallies[CAST[k].binIndex];
    const at = landingPhase(k);
    if (at <= tau) {
      tally.marks += 1;
      tally.ink = clamp01((tau - at) / TIMING.tallyInk);
    } else if (closing) {
      // yesterday's page: every stroke still there, being ruled off and wiped
      tally.marks += 1;
      tally.day = -1;
    }
  }
  if (!closing) return tallies;
  const strike = smooth(span(tau, 0, TIMING.strike));
  const alpha = 1 - smooth(span(tau, TIMING.wipeFrom, TIMING.wipeFrom + TIMING.wipeFor));
  for (let b = 0; b < tallies.length; b += 1) {
    if (tallies[b].day !== -1) continue;
    tallies[b].strike = strike;
    tallies[b].alpha = alpha;
    tallies[b].ink = 1;
  }
  return tallies;
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
  // The camera breathes once per loop, so the seam stays invisible.
  state.camera.yaw = 0.05 * Math.sin((TAU * t) / LOOP);
  state.camera.pitch = 0.018 * Math.sin((2 * TAU * t) / LOOP);
  state.target = -1;
  state.targetGlow = 0;
  for (let k = 0; k < CAST.length; k += 1) {
    const slip = state.slips[k];
    writeSlip(slip, slipClock(t, k));
    slip.flutter = k * 1.7;
    if (slip.stamp > 0 && slip.stage !== STAGES.hidden && slip.u < GONE - 0.2) {
      state.target = CAST[k].binIndex;
      state.targetGlow = Math.min(slip.stamp, 1 - span(slip.u, GONE - 0.5, GONE - 0.2));
    }
  }
  writeTallies(state.tallies, wrap(t - TIMING.dayBreak, LOOP));
  return state;
}
