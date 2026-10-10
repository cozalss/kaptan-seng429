// Önemlilik — the plate's timeline, as pure functions of the clock. The purser's balance hangs
// from the ship's spar. Each weighing (three fictional companies a loop) runs the same way: the
// amount Okuyucu found arrives as a small weight tagged "Tutar" and is set on the left pan — the
// beam tips left; Önemlilik takes the company's two ledgers ("Yıllık gelir", "Piyasa değeri") out
// of the chest and sets them on the right pan — the beam swings over and settles to a tilt the dial's
// needle shows. Then both loads are lifted off and carried on, and the empty beam comes level. The
// threshold mark on the dial belongs to the rules: the model never moves it, and the needle is too
// short to reach it. Nothing here touches the DOM: `frameAt(t, state)` rewrites a preallocated
// state object that the renderer draws.

export const TAU = Math.PI * 2;

/**
 * One loop of weighings (fictional). `weight` is the size of the amount's weight,
 * `rest` the beam's settled tilt (radians, right pan down). Values are illustrative only: the
 * plate shows a tilt, never a number.
 */
export const CAST = Object.freeze(
  [
    { issuer: 'ÖRNEK ENERJİ A.Ş.', weight: 1.0, rest: 0.25, books: [0.24, 0.2] },
    { issuer: 'ÖRNEK GIDA A.Ş.', weight: 1.22, rest: 0.11, books: [0.19, 0.17] },
    { issuer: 'ÖRNEK LOJİSTİK A.Ş.', weight: 0.82, rest: 0.18, books: [0.22, 0.18] },
  ].map((c, i) => Object.freeze({ ...c, books: Object.freeze(c.books), index: i })),
);

/** Where the rules drew their threshold on the dial (radians off plumb). Fixed: no agent moves it. */
export const THRESHOLD = 0.2;
/** The beam's stop: as far as a lone weight can tip it. */
export const STOP = 0.24;

/** Seconds within one weighing (its local clock u). */
export const TIMING = Object.freeze({
  every: 6.8, // one weighing every 6.8 s
  weightFrom: 0.15, // the amount's weight flies in from the left (from Okuyucu)
  weightFor: 1.2,
  bookFrom: Object.freeze([1.85, 2.4]), // the two ledgers leave the chest
  bookFor: 1.0,
  leaveAt: 5.35, // both loads are lifted off and carried on
  leaveFor: 1.05,
  labelFade: 0.45, // the chest's company slip changes between weighings
  intro: 1.6, // the plate inks in on first sight
  start: 0, // loop phase shown at elapsed 0: an empty, level balance
});

export const LOOP = CAST.length * TIMING.every;

/** The beam's spring: natural frequency (rad/s) and damping ratio. */
export const BEAM = Object.freeze({ omega: 3.5, zeta: 0.34 });

/** A still worth printing (reduced motion): the first weighing settled, both pans loaded. */
export const STILL_ELAPSED = TIMING.leaveAt - 0.25 - TIMING.start;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
export const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

const landAt = (from, length) => from + length;
export const WEIGHT_LAND = landAt(TIMING.weightFrom, TIMING.weightFor);
export const BOOK_LAND = Object.freeze(TIMING.bookFrom.map((from) => landAt(from, TIMING.bookFor)));

/**
 * The beam's target steps through one loop: [loop time, change in target tilt]. Sums to zero,
 * so the target is periodic. Weight on → tips to the left stop; first ledger → most of the way
 * right; second → the rest; loads off → level.
 */
export const STEPS = (() => {
  const steps = [];
  CAST.forEach((c, i) => {
    const t0 = i * TIMING.every;
    steps.push([t0 + WEIGHT_LAND, -STOP]);
    steps.push([t0 + BOOK_LAND[0], STOP + c.rest * 0.62]);
    steps.push([t0 + BOOK_LAND[1], c.rest * 0.38]);
    steps.push([t0 + TIMING.leaveAt + 0.15, -c.rest]);
  });
  return Object.freeze(steps.map((s) => Object.freeze(s)));
})();

const DECAY = BEAM.zeta * BEAM.omega;
const OMEGA_D = BEAM.omega * Math.sqrt(1 - BEAM.zeta * BEAM.zeta);

/** What is left of a unit step τ seconds after it (1 at τ = 0, → 0). */
export function residual(tau) {
  return Math.exp(-DECAY * tau) * (Math.cos(OMEGA_D * tau) + (DECAY / OMEGA_D) * Math.sin(OMEGA_D * tau));
}

/**
 * The beam's tilt at loop time t (radians, right pan down): the periodic target minus each step's
 * ringing residual. Continuous everywhere, the loop's seam included.
 */
export function beamAngle(t) {
  let theta = 0;
  for (let i = 0; i < STEPS.length; i += 1) {
    const [at, delta] = STEPS[i];
    const tau = wrap(t - at, LOOP);
    if (t >= at) theta += delta;
    theta -= delta * residual(tau);
  }
  return theta;
}

function createLoadState() {
  return { visible: false, fly: 0, leave: 0, alpha: 0 };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    elapsed: 0,
    intro: 1,
    camera: { yaw: 0, pitch: 0 },
    weighing: 0, // index into CAST
    u: 0, // seconds into this weighing
    theta: 0,
    weight: createLoadState(),
    books: [createLoadState(), createLoadState()],
    label: { weighing: 0, alpha: 1 },
  };
}

/** One load's life in a weighing: flies in over [from, from + length], leaves with the rest. */
function writeLoad(load, u, from, length) {
  load.visible = u >= from && u < TIMING.leaveAt + TIMING.leaveFor;
  load.fly = easeInOut(span(u, from, from + length));
  load.leave = smooth(span(u, TIMING.leaveAt, TIMING.leaveAt + TIMING.leaveFor));
  load.alpha = load.visible ? Math.min(smooth(span(u, from, from + 0.18)), 1 - smooth(span(load.leave, 0.55, 1))) : 0;
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
  state.camera.yaw = 0.045 * Math.sin((TAU * t) / LOOP);
  state.camera.pitch = 0.015 * Math.sin((2 * TAU * t) / LOOP);
  const weighing = Math.min(CAST.length - 1, Math.floor(t / TIMING.every));
  const u = t - weighing * TIMING.every;
  state.weighing = weighing;
  state.u = u;
  state.theta = beamAngle(t);
  writeLoad(state.weight, u, TIMING.weightFrom, TIMING.weightFor);
  for (let k = 0; k < state.books.length; k += 1) writeLoad(state.books[k], u, TIMING.bookFrom[k], TIMING.bookFor);
  // the chest's slip names the company being weighed: inked in as a weighing starts, out as it ends
  const fade = TIMING.labelFade;
  state.label.weighing = weighing;
  state.label.alpha = Math.min(smooth(span(u, 0, fade)), 1 - smooth(span(u, TIMING.every - fade, TIMING.every)));
  return state;
}
