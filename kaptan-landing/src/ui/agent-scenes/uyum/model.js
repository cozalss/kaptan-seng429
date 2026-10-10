// Uyum — the plate's timeline, as pure functions of the clock. Six fictional disclosures (one
// loop) drift in and are laid one at a time on a slanted reading desk under a hanging lantern. The
// lantern is turned up and its light shows what plain reading does not: on one slip an SPK measure
// stamp on the company file, on another an instruction written in pale ink between the lines. A
// clean slip gets a tick and goes on its way down the line; a slip under a measure is ringed and
// stopped; the slip with the hidden line has it struck, gets a flag pinned to it and is dropped
// through the grille of a sealed box whose counter reads "Emir: 0" the whole time — a malicious
// disclosure yields no order. Nothing here touches the DOM: `frameAt(t, state)` rewrites a
// preallocated state object that the renderer draws.

export const TAU = Math.PI * 2;

/** What the light finds on a slip: nothing (it goes on), an SPK measure, or a hidden instruction. */
export const VERDICTS = Object.freeze({ pass: 0, tedbir: 1, inject: 2 });

/** One loop of disclosures (fictional); titles are illustrative only. */
export const CAST = Object.freeze(
  [
    { verdict: 'pass', issuer: 'ÖRNEK GIDA A.Ş.', title: 'Genel kurul ilanı' },
    { verdict: 'pass', issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Pay geri alım işlemleri' },
    { verdict: 'tedbir', issuer: 'ÖRNEK LOJİSTİK A.Ş.', title: 'Yeni iş ilişkisi' },
    { verdict: 'pass', issuer: 'ÖRNEK ALTYAPI A.Ş.', title: 'Yönetim kurulu kararı' },
    { verdict: 'inject', issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Finansal rapor' },
    { verdict: 'pass', issuer: 'ÖRNEK GIDA A.Ş.', title: 'Adres değişikliği' },
  ].map((slip, i) => Object.freeze({ ...slip, index: i, kind: VERDICTS[slip.verdict], stops: slip.verdict !== 'pass' })),
);

/** Seconds. A slip's local clock u is 0 the moment it lies on the desk. */
export const TIMING = Object.freeze({
  every: 3.2, // one slip on the desk every 3.2 s
  stream: 8, // drifting in from the distance
  approach: 0.8, // from its place in line onto the desk
  litFrom: 0.1, // the lantern is turned up…
  litFor: 0.4,
  scanFrom: 0.3, // …a straightedge reads the slip top to bottom…
  scanTo: 1.2,
  revealStamp: 0.55, // …the light raises the measure stamp on the company file…
  revealHidden: 0.78, // …or the pale line between the lines
  revealFor: 0.45,
  markAt: 1.32, // tick, ring or strike
  markFor: 0.36,
  flagAt: 1.76, // the injection flag is pinned
  flagFor: 0.3,
  dimFrom: 2.08, // the lantern is turned down again
  liftAt: 2.3,
  exit: 1.9, // a clean slip goes on, down the line into the distance
  flight: 1.0, // a stopped slip is carried over the sealed box…
  drop: 0.55, // …and dropped through its grille
  glow: 1.3, // the counter's "0" is underlined as it lands
  intro: 1.6,
  start: 2.6, // loop phase shown at elapsed 0: the first slip is nearly on the desk
});

export const LOOP = CAST.length * TIMING.every;
export const LANDED = TIMING.liftAt + TIMING.flight + TIMING.drop;
/** Local time a slip leaves the plate, by whether it is stopped. */
export const goneAt = (stops) => (stops ? LANDED : TIMING.liftAt + TIMING.exit);

/** The still printed for reduced motion: the hidden line exposed and struck, the flag pinned. */
export const STILL_ELAPSED = 4 * TIMING.every + TIMING.flagAt + TIMING.flagFor + 0.02 - TIMING.start;

export const STAGES = Object.freeze({ hidden: 0, stream: 1, desk: 2, flight: 3, drop: 4, exit: 5 });

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
export const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

/** A slip's local time at loop time t, in [-stream, LOOP - stream). */
export function slipClock(t, index) {
  return wrap(t - index * TIMING.every + TIMING.stream, LOOP) - TIMING.stream;
}

function createSlipState() {
  return {
    stage: STAGES.hidden,
    alpha: 0,
    u: 0,
    stream: 0, // 0 far → 1 at its place in line
    lit: 0, // the lantern's light on it
    scan: 0, // reading straightedge, top → bottom
    reveal: 0, // what the light raises (stamp or hidden line)
    mark: 0, // Uyum's ink: tick (clean), ring (measure), strike (hidden line)
    flag: 0, // the injection flag, pinned
    fly: 0, // stopped: arc over the box
    drop: 0, // stopped: down through the grille
    exit: 0, // clean: on down the line
    flutter: 0,
  };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    elapsed: 0,
    intro: 1,
    camera: { yaw: 0, pitch: 0 },
    lantern: { lit: 0, sway: 0, flicker: 0 },
    slips: CAST.map(createSlipState),
    desk: -1, // the slip on the desk
    glow: 0, // the counter's underline after a stopped slip lands
    orders: 0, // "Emir: 0" — never anything else
  };
}

function writeDesk(slip, u, cast) {
  slip.lit = smooth(span(u, TIMING.litFrom, TIMING.litFrom + TIMING.litFor)) * (1 - smooth(span(u, TIMING.dimFrom, TIMING.liftAt)));
  slip.scan = smooth(span(u, TIMING.scanFrom, TIMING.scanTo));
  if (cast.kind === VERDICTS.tedbir) slip.reveal = smooth(span(u, TIMING.revealStamp, TIMING.revealStamp + TIMING.revealFor));
  else if (cast.kind === VERDICTS.inject) slip.reveal = smooth(span(u, TIMING.revealHidden, TIMING.revealHidden + TIMING.revealFor));
  slip.mark = span(u, TIMING.markAt, TIMING.markAt + TIMING.markFor);
  if (cast.kind === VERDICTS.inject) slip.flag = easeOut(span(u, TIMING.flagAt, TIMING.flagAt + TIMING.flagFor));
}

function writeSlip(slip, u, cast) {
  slip.u = u;
  slip.lit = 0;
  slip.scan = 0;
  slip.reveal = 0;
  slip.mark = 0;
  slip.flag = 0;
  slip.fly = 0;
  slip.drop = 0;
  slip.exit = 0;
  if (u < 0) {
    const v = Math.min(1, (u + TIMING.stream) / (TIMING.stream - TIMING.approach));
    slip.stage = STAGES.stream;
    slip.stream = easeOut(v);
    slip.alpha = smooth(span(v, 0, 0.22));
    return;
  }
  slip.stream = 1;
  if (u >= goneAt(cast.stops)) {
    slip.stage = STAGES.hidden;
    slip.alpha = 0;
    return;
  }
  slip.alpha = 1;
  writeDesk(slip, u, cast);
  if (u < TIMING.liftAt) {
    slip.stage = STAGES.desk;
    return;
  }
  if (!cast.stops) {
    slip.stage = STAGES.exit;
    const e = span(u, TIMING.liftAt, TIMING.liftAt + TIMING.exit);
    slip.exit = easeInOut(e);
    slip.alpha = 1 - smooth(span(e, 0.62, 1));
    return;
  }
  if (u < TIMING.liftAt + TIMING.flight) {
    slip.stage = STAGES.flight;
    slip.fly = easeInOut(span(u, TIMING.liftAt, TIMING.liftAt + TIMING.flight));
    return;
  }
  slip.stage = STAGES.drop;
  slip.fly = 1;
  slip.drop = easeIn(span(u, TIMING.liftAt + TIMING.flight, LANDED));
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
  // The camera breathes once per loop and the lantern sways three times, so the seam stays invisible.
  state.camera.yaw = 0.045 * Math.sin((TAU * t) / LOOP);
  state.camera.pitch = 0.015 * Math.sin((2 * TAU * t) / LOOP);
  state.lantern.sway = 0.035 * Math.sin((3 * TAU * t) / LOOP) + 0.012 * Math.sin((7 * TAU * t) / LOOP);
  state.lantern.flicker = 0.5 * Math.sin((41 * TAU * t) / LOOP) + 0.5 * Math.sin((67 * TAU * t) / LOOP + 1.3);
  state.lantern.lit = 0;
  state.desk = -1;
  state.glow = 0;
  state.orders = 0;
  for (let k = 0; k < CAST.length; k += 1) {
    const slip = state.slips[k];
    const cast = CAST[k];
    writeSlip(slip, slipClock(t, k), cast);
    slip.flutter = k * 1.7;
    if (slip.stage === STAGES.desk) {
      state.desk = k;
      state.lantern.lit = Math.max(state.lantern.lit, slip.lit);
    }
    if (cast.stops) {
      const since = slip.u - LANDED + 0.12;
      if (since > 0 && since < TIMING.glow) state.glow = Math.max(state.glow, Math.min(1, since * 5) * (1 - smooth(span(since, TIMING.glow * 0.55, TIMING.glow))));
    }
  }
  return state;
}
