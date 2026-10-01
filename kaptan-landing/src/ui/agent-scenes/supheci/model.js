// Şüpheci — the plate's timeline, as pure functions of the clock. Three fictional draft proposals
// (a loop) are lifted one by one from the drafts crate and pinned to the lookout's board. The
// spyglass sweeps each one. In the first it finds the price already up before the disclosure
// (sızıntı): the find is ringed in ink and the size bar is cut back by a ruled line (küçült). The
// second is clean: it passes as it is, and the plate's joke — a ghosted "büyüt" extension of the
// bar — is drawn and struck out, because Şüpheci can never enlarge a proposal. In the third it finds
// a puffed-up phrase (abartı): the slip is struck through and stamped Veto. Each slip then leaves to
// the right, carrying its marks. Nothing here touches the DOM: `frameAt(t, state)` rewrites a
// preallocated state object that the renderer draws.

export const TAU = Math.PI * 2;

/**
 * Where things sit on a slip, in its own [-1, 1]² space (x right, y down). The sprite is printed
 * to this layout and the spyglass aims at it.
 */
export const LAYOUT = Object.freeze({
  chart: Object.freeze({ x0: -0.88, x1: -0.08, y0: -0.16, y1: 0.5, disclose: 0.74 }),
  notes: Object.freeze({ x0: 0.08, x1: 0.88, head: -0.08, lines: Object.freeze([0.07, 0.21, 0.35, 0.48]) }),
  bar: Object.freeze({ x0: -0.46, x1: 0.88, y: 0.76, h: 0.11 }),
});

/** Spyglass waypoints (slip coordinates). */
export const SPOTS = Object.freeze({
  home: Object.freeze([-0.6, -0.5]),
  leak: Object.freeze([-0.38, 0.12]), // the climb before the disclosure line
  puff: Object.freeze([0.34, 0.21]), // the overstated phrase on the second note line
  bar: Object.freeze([0.12, 0.76]),
});

/**
 * The loop's three drafts (fictional, "Temsili"). `size` is the proposed size as a fraction of
 * the bar; `finding` what the sweep turns up; `verdict` what Şüpheci does with it.
 */
export const CAST = Object.freeze(
  [
    {
      kind: 'leak',
      verdict: 'kucult',
      finding: 'sızıntı',
      issuer: 'ÖRNEK ENERJİ A.Ş.',
      code: 'E1',
      title: 'Pay geri alım işlemleri',
      size: 0.8,
      path: [SPOTS.home, [0.4, -0.46], SPOTS.leak],
    },
    {
      kind: 'clean',
      verdict: 'aynen',
      finding: '',
      issuer: 'ÖRNEK GIDA A.Ş.',
      code: 'E2',
      title: 'Yönetici pay alımı',
      size: 0.56,
      path: [SPOTS.home, [-0.5, 0.18], [0.46, 0.2], SPOTS.bar],
    },
    {
      kind: 'puff',
      verdict: 'veto',
      finding: 'abartı',
      issuer: 'ÖRNEK ALTYAPI A.Ş.',
      code: 'E3',
      title: 'Yeni iş ilişkisi',
      phrase: 'kesin yükselir!',
      size: 0.7,
      path: [SPOTS.home, [-0.5, 0.18], SPOTS.puff],
    },
  ].map((slip, i) =>
    Object.freeze({ phrase: '', ...slip, index: i, path: Object.freeze(slip.path.map((p) => Object.freeze([...p]))) }),
  ),
);

/** Seconds. A slip's local clock u is 0 the moment it is pinned to the board. */
export const TIMING = Object.freeze({
  period: 7.2, // one draft every 7.2 s
  approach: 1.0, // from the crate onto the board
  sweepFrom: 0.6,
  sweepTo: 3.1,
  ringFrom: 3.2, // the find is ringed in ink
  ringFor: 0.5,
  tagAt: 3.5,
  tagFor: 0.3,
  verdictFrom: 3.95, // the cut line, or the strike
  verdictFor: 0.5,
  wipeFrom: 4.5, // küçült: the cut-off part of the bar is wiped
  wipeFor: 0.5,
  stampAt: 4.55, // veto
  stampFor: 0.22,
  clearAt: 3.2, // aynen: nothing found
  clearFor: 0.3,
  ghostFrom: 3.7, // the ghosted "büyüt" extension…
  ghostFor: 0.5,
  ghostStrikeFrom: 4.45, // …struck out
  ghostStrikeFor: 0.35,
  ghostFadeFrom: 5.5,
  ghostFadeFor: 0.5,
  returnFrom: 5.1, // the spyglass goes back to its first mark
  returnTo: 6.3,
  leaveFrom: 6.0, // passed on to the right
  leaveFor: 1.0,
  intro: 1.6,
  start: 0.8, // elapsed 0 shows the first draft 0.8 s before it is pinned
});

export const LOOP = CAST.length * TIMING.period;
const LEAVE_END = TIMING.leaveFrom + TIMING.leaveFor;

/** A still worth printing (reduced motion): the leak ringed, the bar cut back. */
export const STILL_ELAPSED = 5.0 + TIMING.start;

export const STAGES = Object.freeze({ hidden: 0, approach: 1, board: 2, leave: 3 });

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

/** A slip's local time at loop time t, in [-approach, LOOP - approach). */
export function slipClock(t, index) {
  return wrap(t - index * TIMING.period + TIMING.approach, LOOP) - TIMING.approach;
}

function createSlipState() {
  return {
    stage: STAGES.hidden,
    u: 0,
    alpha: 0,
    move: 0, // approach or leave progress
    ring: 0,
    tag: 0,
    cut: 0,
    wipe: 0,
    strike: 0,
    stamp: 0,
    clear: 0,
    ghost: 0,
    ghostStrike: 0,
    size: 0, // the proposal's size right now (fraction of the bar)
  };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    elapsed: 0,
    intro: 1,
    camera: { yaw: 0, pitch: 0 },
    slips: CAST.map(createSlipState),
    spy: { fx: SPOTS.home[0], fy: SPOTS.home[1], view: 0, bob: 0, slip: 0 },
  };
}

/** Marks and size of a slip at local time u (u ≥ 0). */
function writeMarks(slip, cast, u) {
  if (cast.finding) {
    slip.ring = span(u, TIMING.ringFrom, TIMING.ringFrom + TIMING.ringFor);
    slip.tag = smooth(span(u, TIMING.tagAt, TIMING.tagAt + TIMING.tagFor));
  }
  if (cast.verdict === 'kucult') {
    slip.cut = span(u, TIMING.verdictFrom, TIMING.verdictFrom + TIMING.verdictFor);
    slip.wipe = smooth(span(u, TIMING.wipeFrom, TIMING.wipeFrom + TIMING.wipeFor));
    slip.size = cast.size * (1 - 0.5 * slip.wipe);
  } else if (cast.verdict === 'veto') {
    slip.strike = span(u, TIMING.verdictFrom, TIMING.verdictFrom + TIMING.verdictFor);
    slip.stamp = span(u, TIMING.stampAt, TIMING.stampAt + TIMING.stampFor);
    slip.size = cast.size * (1 - smooth(slip.strike));
  } else {
    slip.clear = smooth(span(u, TIMING.clearAt, TIMING.clearAt + TIMING.clearFor));
    const fade = smooth(span(u, TIMING.ghostFadeFrom, TIMING.ghostFadeFrom + TIMING.ghostFadeFor));
    slip.ghost = smooth(span(u, TIMING.ghostFrom, TIMING.ghostFrom + TIMING.ghostFor)) * (1 - fade);
    slip.ghostStrike = span(u, TIMING.ghostStrikeFrom, TIMING.ghostStrikeFrom + TIMING.ghostStrikeFor);
  }
}

function writeSlip(slip, cast, u) {
  slip.u = u;
  slip.move = 0;
  slip.ring = 0;
  slip.tag = 0;
  slip.cut = 0;
  slip.wipe = 0;
  slip.strike = 0;
  slip.stamp = 0;
  slip.clear = 0;
  slip.ghost = 0;
  slip.ghostStrike = 0;
  slip.size = cast.size;
  if (u < 0) {
    slip.stage = STAGES.approach;
    slip.move = easeInOut(span(u, -TIMING.approach, 0));
    slip.alpha = 1;
    return;
  }
  if (u >= LEAVE_END) {
    slip.stage = STAGES.hidden;
    slip.alpha = 0;
    writeMarks(slip, cast, LEAVE_END);
    return;
  }
  writeMarks(slip, cast, u);
  slip.alpha = 1;
  if (u < TIMING.leaveFrom) {
    slip.stage = STAGES.board;
    return;
  }
  slip.stage = STAGES.leave;
  slip.move = easeInOut(span(u, TIMING.leaveFrom, LEAVE_END));
  slip.alpha = 1 - smooth(span(u, LEAVE_END - 0.35, LEAVE_END));
}

/** Where the spyglass looks (slip coordinates) at time u of the slip on the board; into `out`. */
export function focusAt(cast, u, out) {
  const path = cast.path;
  const last = path[path.length - 1];
  if (u < TIMING.sweepFrom) {
    out[0] = path[0][0];
    out[1] = path[0][1];
    return out;
  }
  if (u < TIMING.sweepTo) {
    const segs = path.length - 1;
    const p = span(u, TIMING.sweepFrom, TIMING.sweepTo) * segs;
    const i = Math.min(segs - 1, Math.floor(p));
    // each leg is run in the first 80 % of its time, then the glass dwells
    const e = smooth(clamp01((p - i) / 0.8));
    out[0] = path[i][0] + (path[i + 1][0] - path[i][0]) * e;
    out[1] = path[i][1] + (path[i + 1][1] - path[i][1]) * e;
    return out;
  }
  const back = smooth(span(u, TIMING.returnFrom, TIMING.returnTo));
  out[0] = last[0] + (path[0][0] - last[0]) * back;
  out[1] = last[1] + (path[0][1] - last[1]) * back;
  return out;
}

const focus = [0, 0];

/**
 * The frame at `elapsed` seconds since the plate was first shown.
 * @param {number} elapsed
 * @param {ReturnType<typeof createFrameState>} state
 */
export function frameAt(elapsed, state = createFrameState()) {
  const t = wrap(elapsed - TIMING.start, LOOP);
  state.t = t;
  state.elapsed = elapsed;
  state.intro = smooth(span(elapsed, 0, TIMING.intro));
  // The camera breathes once per loop, so the seam stays invisible.
  state.camera.yaw = 0.035 * Math.sin((TAU * t) / LOOP);
  state.camera.pitch = 0.012 * Math.sin((2 * TAU * t) / LOOP);
  for (let k = 0; k < CAST.length; k += 1) writeSlip(state.slips[k], CAST[k], slipClock(t, k));
  // the spyglass serves the slip whose turn it is
  const active = Math.min(CAST.length - 1, Math.floor(t / TIMING.period));
  const u = t - active * TIMING.period;
  focusAt(CAST[active], u, focus);
  const spy = state.spy;
  spy.slip = active;
  spy.fx = focus[0];
  spy.fy = focus[1];
  spy.view = smooth(span(u, 0.2, 0.6)) * (1 - smooth(span(u, 5.5, 5.95)));
  // once a find is ringed, the glass lowers its field so the ring can be read
  if (CAST[active].finding) spy.view *= 1 - 0.85 * smooth(span(u, TIMING.ringFrom, TIMING.ringFrom + 0.4));
  // a lookout's hand is never quite still: a slow bob, nine times a loop
  spy.bob = Math.sin((9 * TAU * t) / LOOP);
  return state;
}
