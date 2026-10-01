// Risk Kapısı — the plate's timeline, as pure functions of the clock. A canal runs across the plate
// past sixteen numbered bollards, R01–R16, to an iron lock gate. Proposal barges (their cargo a
// stack of paper: the proposal's size) wait moored in a short queue, cast off and pass the rules one
// by one. A rule may swing its gauge arm across the canal and shear the stack down to its limit
// (küçült) — never up; one barge a loop is stopped by a boom and turned back (reddet); the rest
// pass as they are (aynen). Once a loop, with the row clear, the kill switch on the gate is thrown:
// the barges waiting in the queue are unmoored and drift off (açık emirler iptal), while the two
// barges tied up in the harbour beyond the gate stay as they are (pozisyon satılmaz). Then the
// lever is set back and the queue refills — the loop has no seam. Nothing here touches the DOM:
// `frameAt(t, state)` rewrites a preallocated state object that the renderer draws.

export const TAU = Math.PI * 2;

/** The sixteen rules along the back quay, R01–R16 (codes only: what each checks is not drawn). */
export const RULE_COUNT = 16;
export const RULES = Object.freeze(Array.from({ length: RULE_COUNT }, (_, i) => `R${String(i + 1).padStart(2, '0')}`));

/** Where things are along the canal (world x) and across it (world z, + toward the viewer). */
export const CANAL = Object.freeze({
  ruleFrom: -2.5, // R01
  ruleStep: 1 / 3, // R16 at +2.5
  gate: 3.0,
  queue: Object.freeze([-3.2, -4.5]), // the two moorings of the queue: next out, then behind it
  enter: -8.8, // a barge appears here, far off on the left
  exitFrom: 5.3, // a passed barge fades out between these
  exitTo: 6.3,
  main: 0.2, // the lane barges sail in
  back: -0.5, // the far lane: a turned-back barge leaves along it; the harbour lies in it
  halfLength: 0.55, // a barge's half length (bow to centre)
});

/** World x of rule i's bollard. */
export const ruleX = (i) => CANAL.ruleFrom + i * CANAL.ruleStep;

export const FATES = Object.freeze({ aynen: 0, kucult: 1, reddet: 2, iptal: 3 });
/** Verdict stamps, in FATES order. */
export const VERDICTS = Object.freeze(['Aynen', 'Küçült', 'Reddet', 'İptal']);

/**
 * One loop's barges (fictional, "Temsili"). `size` is the stack's height as a share of the largest
 * proposal; a cut lowers it to `to` at rule `rule` (an index into RULES) and never raises it.
 */
export const CAST = Object.freeze(
  [
    { fate: 'aynen', size: 0.5, cuts: [] },
    { fate: 'kucult', size: 0.92, cuts: [{ rule: 3, to: 0.62 }] },
    { fate: 'reddet', size: 0.78, cuts: [], reject: 11 },
    { fate: 'kucult', size: 1.0, cuts: [{ rule: 1, to: 0.74 }, { rule: 13, to: 0.5 }] },
    { fate: 'aynen', size: 0.42, cuts: [] },
    { fate: 'iptal', size: 0.7, cuts: [] },
    { fate: 'iptal', size: 0.58, cuts: [] },
  ].map((barge, i) =>
    Object.freeze({
      ...barge,
      index: i,
      fateIndex: FATES[barge.fate],
      cuts: Object.freeze(barge.cuts.map((cut) => Object.freeze(cut))),
      reject: barge.reject ?? -1,
    }),
  ),
);

/** The two barges tied up in the harbour beyond the gate: never moved, never cut. */
export const HARBOUR = Object.freeze([
  Object.freeze({ x: 3.9, size: 0.56, seed: 1.3 }),
  Object.freeze({ x: 5.15, size: 0.72, seed: 2.9 }),
]);

/** Seconds. */
export const TIMING = Object.freeze({
  loop: 36,
  every: 4.2, // a barge casts off from the queue every 4.2 s
  first: 0.6, // loop time the first barge casts off
  speed: 0.85, // world units a second through the rules
  ramp: 0.8, // seconds to get under way (and to stop, when stopped)
  shift: 1.5, // moving up one place in the queue
  lag: 0.8, // once the barge ahead has cleared its berth
  arrive: 2.6, // from far off into the queue
  castOff: 0.45, // the mooring line is let go before a barge moves
  tie: 0.5, // and made fast once it has stopped
  cut: 0.32, // the stack sheared down
  slab: 1.3, // the sheared slab slides off and sinks
  armOut: 1.1, // a gauge arm swings out this long before the bow reaches it
  armSwing: 0.45,
  armHold: 0.6, // and stays out after the cut
  stampFor: 0.24,
  brake: 1.1, // the turned-back barge stops before the boom
  hold: 1.1, // stands at the boom, stamped
  turn: 2.3, // turns about into the far lane
  leave: 3.6, // and sails back out, fading
  kill: 27.4, // the kill switch is thrown
  throw: 0.45,
  unmoor: 0.55, // the queue's lines are let go after the throw
  drift: 3.2, // and the barges drift off, fading
  reset: 31.6, // the lever is set back by hand
  resetFor: 1.1,
  intro: 1.6, // the plate inks in on first sight
  start: 2.2, // loop phase shown at elapsed 0
});

export const LOOP = TIMING.loop;
const TURN_BACK = 0.5; // how far the turned-back barge backs off while it warps round
const NORMAL = CAST.filter((b) => b.fate !== 'iptal').length; // 5 barges sail; 2 are cancelled

/** The loop time barge k casts off from the head of the queue (cancelled ones never do). */
export const departure = (k) => TIMING.first + k * TIMING.every;

/** A still worth printing (reduced motion): a barge stopped at the boom and stamped, the large proposal just cut. */
export const STILL_ELAPSED = 14.8 - TIMING.start;

export const STAGES = Object.freeze({ hidden: 0, arrive: 1, moored: 2, shift: 3, sail: 4, stop: 5, turn: 6, leave: 7, drift: 8 });

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

/** Distance run `s` seconds after casting off: a smooth start, then the cruising speed. */
export function run(s) {
  const { speed, ramp } = TIMING;
  if (s <= 0) return 0;
  return s < ramp ? (speed * s * s) / (2 * ramp) : speed * (s - ramp / 2);
}

/** Seconds after casting off at which the run reaches distance d (inverse of run). */
export function runTime(d) {
  const { speed, ramp } = TIMING;
  if (d <= 0) return 0;
  return d < (speed * ramp) / 2 ? Math.sqrt((2 * ramp * d) / speed) : d / speed + ramp / 2;
}

/** Seconds after casting off at which the bow reaches world x (sailing from the head of the queue). */
export const bowTime = (x) => runTime(x - CANAL.halfLength - CANAL.queue[0]);

/** Where the turned-back barge stops (its centre) and when its stages begin, from its cast-off. */
export function rejectPlan(rule) {
  const { speed, brake, hold, turn } = TIMING;
  const stopX = ruleX(rule) - 0.16 - CANAL.halfLength;
  const brakeLen = (speed * brake) / 2;
  const brakeAt = runTime(stopX - brakeLen - CANAL.queue[0]);
  const stopAt = brakeAt + brake;
  return { stopX, brakeAt, brakeLen, stopAt, turnAt: stopAt + hold, leaveAt: stopAt + hold + turn };
}

/**
 * The queue's timetable for barge k (seconds of loop time, may run below 0 for the loop's first
 * barges, which arrive during the previous loop's refill): when it arrives at which mooring, and
 * when it moves up. Pure; the frame code reads it.
 */
export function queuePlan(k) {
  const refill = TIMING.reset + TIMING.resetFor - LOOP; // the queue refills once the lever is set back
  if (k === 0) return { arriveAt: refill - 0.3, slot: 0, shiftAt: Infinity };
  if (k === 1) return { arriveAt: refill + 0.6, slot: 1, shiftAt: departure(0) + TIMING.lag };
  // the rest arrive at the back of the queue as the barge two ahead casts off
  const arriveAt = departure(k - 2) + 0.4;
  const shiftAt = k - 1 < NORMAL ? departure(k - 1) + TIMING.lag : Infinity;
  return { arriveAt, slot: 1, shiftAt };
}

function createBargeState() {
  return {
    stage: STAGES.hidden,
    alpha: 0,
    x: 0,
    z: CANAL.main,
    yaw: 0, // heading: 0 sails toward +x, π back toward −x
    size: 0, // the stack's height (share of the largest proposal)
    slabFrom: 0, // a sheared slab: its bottom and top (sizes) and how far it has gone (0 → 1)
    slabTo: 0,
    slab: -1,
    rope: 0, // the mooring line: 1 made fast, 0 let go
    ropeX: 0, // the post it is (or was last) made fast to
    stamp: 0, // the verdict stamp's press (0 → 1)
    verdict: -1, // index into VERDICTS
    wake: 0, // how fast it moves (0 → 1), for the wake strokes
    bob: 0,
  };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    elapsed: 0,
    intro: 1,
    camera: { yaw: 0, pitch: 0 },
    barges: CAST.map(createBargeState),
    rules: Array.from({ length: RULE_COUNT }, () => ({ check: 0, arm: 0, armSize: 0, boom: 0, mark: 0 })),
    lever: 0, // the kill switch: 0 up (set), 1 thrown
    kill: 0, // how far the queue's unmooring has gone, for the harbour's lines to answer
  };
}

/** The stack's height and any slab being shed, `s` seconds after cast-off. */
function writeCargo(barge, cast, s) {
  barge.size = cast.size;
  barge.slab = -1;
  let prev = cast.size;
  for (let c = 0; c < cast.cuts.length; c += 1) {
    const cut = cast.cuts[c];
    const at = bowTime(ruleX(cut.rule));
    if (s < at) break;
    const p = smooth(span(s, at, at + TIMING.cut));
    barge.size = prev + (cut.to - prev) * p;
    if (s < at + TIMING.slab) {
      barge.slabFrom = cut.to;
      barge.slabTo = prev;
      barge.slab = span(s, at, at + TIMING.slab);
    }
    prev = cut.to;
  }
}

/** The barge's place in the queue (or on its way into it) at loop time τ. */
function writeQueued(barge, plan, tau) {
  const { queue } = CANAL;
  const arriveEnd = plan.arriveAt + TIMING.arrive;
  barge.z = CANAL.main;
  barge.yaw = 0;
  if (tau < arriveEnd) {
    const p = span(tau, plan.arriveAt, arriveEnd);
    barge.stage = STAGES.arrive;
    barge.x = CANAL.enter + (queue[plan.slot] - CANAL.enter) * easeOut(p);
    barge.alpha = smooth(span(p, 0, 0.35));
    barge.wake = 1 - p;
    barge.rope = 0;
    barge.ropeX = queue[plan.slot];
    return;
  }
  barge.alpha = 1;
  if (tau < plan.shiftAt) {
    barge.stage = STAGES.moored;
    barge.x = queue[plan.slot];
    barge.ropeX = queue[plan.slot];
    barge.rope = smooth(span(tau, arriveEnd, arriveEnd + TIMING.tie));
    barge.wake = 0;
    return;
  }
  const shiftEnd = plan.shiftAt + TIMING.castOff + TIMING.shift;
  if (tau < shiftEnd) {
    const p = smooth(span(tau, plan.shiftAt + TIMING.castOff, shiftEnd));
    barge.stage = STAGES.shift;
    barge.x = queue[1] + (queue[0] - queue[1]) * p;
    barge.ropeX = queue[1];
    barge.rope = 1 - smooth(span(tau, plan.shiftAt, plan.shiftAt + TIMING.castOff));
    barge.wake = Math.sin(Math.PI * p);
    return;
  }
  barge.stage = STAGES.moored;
  barge.x = queue[0];
  barge.ropeX = queue[0];
  barge.rope = smooth(span(tau, shiftEnd, shiftEnd + TIMING.tie));
  barge.wake = 0;
}

/** A barge under way from the head of the queue, `s` seconds after it cast off. */
function writeSailing(barge, cast, s) {
  barge.ropeX = CANAL.queue[0];
  barge.rope = 0;
  barge.alpha = 1;
  barge.z = CANAL.main;
  barge.yaw = 0;
  writeCargo(barge, cast, s);
  if (cast.reject >= 0) {
    writeTurnedBack(barge, cast, s);
    return;
  }
  barge.stage = STAGES.sail;
  barge.x = CANAL.queue[0] + run(s);
  barge.wake = Math.min(1, s / TIMING.ramp);
  barge.alpha = 1 - smooth(span(barge.x, CANAL.exitFrom, CANAL.exitTo));
  const at = bowTime(CANAL.gate);
  if (s >= at) {
    barge.verdict = cast.fateIndex;
    barge.stamp = span(s, at, at + TIMING.stampFor);
  }
  if (barge.alpha <= 0) barge.stage = STAGES.hidden;
}

/** The one barge a loop that is stopped at a boom, stamped and turned back along the far lane. */
function writeTurnedBack(barge, cast, s) {
  const plan = rejectPlan(cast.reject);
  if (s < plan.brakeAt) {
    barge.stage = STAGES.sail;
    barge.x = CANAL.queue[0] + run(s);
    barge.wake = Math.min(1, s / TIMING.ramp);
    return;
  }
  if (s < plan.turnAt) {
    const b = Math.min(1, (s - plan.brakeAt) / TIMING.brake);
    // decelerates evenly to a stop at stopX
    barge.stage = STAGES.stop;
    barge.x = plan.stopX - plan.brakeLen * (1 - b) * (1 - b);
    barge.wake = 1 - b;
    if (s >= plan.stopAt - 0.1) {
      barge.verdict = FATES.reddet;
      barge.stamp = span(s, plan.stopAt - 0.1, plan.stopAt - 0.1 + TIMING.stampFor);
    }
    return;
  }
  barge.verdict = FATES.reddet;
  barge.stamp = 1;
  const r = (CANAL.main - CANAL.back) / 2;
  const cz = (CANAL.main + CANAL.back) / 2;
  if (s < plan.leaveAt) {
    // warped round where it stands, backing off a little, into the far lane
    const th = Math.PI * smooth(span(s, plan.turnAt, plan.leaveAt));
    barge.stage = STAGES.turn;
    barge.x = plan.stopX - TURN_BACK * 0.5 * (1 - Math.cos(th));
    barge.z = cz + r * Math.cos(th);
    barge.yaw = th;
    barge.wake = 0.6 * Math.sin(th);
    return;
  }
  const l = s - plan.leaveAt;
  barge.stage = STAGES.leave;
  barge.yaw = Math.PI;
  barge.z = CANAL.back;
  barge.x = plan.stopX - TURN_BACK - run(l);
  barge.wake = Math.min(1, l / TIMING.ramp);
  barge.alpha = 1 - smooth(span(l, TIMING.leave * 0.45, TIMING.leave));
  if (l >= TIMING.leave) barge.stage = STAGES.hidden;
}

/** A queued barge when the kill switch is thrown: its line let go, it drifts back and is gone. */
function writeCancelled(barge, plan, tau) {
  const start = TIMING.kill + TIMING.throw + TIMING.unmoor;
  writeQueued(barge, plan, Math.min(tau, start));
  if (tau < TIMING.kill + TIMING.throw) return;
  barge.rope = 1 - smooth(span(tau, TIMING.kill + TIMING.throw, start));
  if (tau < start) return;
  const p = span(tau, start, start + TIMING.drift);
  barge.stage = STAGES.drift;
  barge.x -= 0.9 * easeOut(p) + 0.12 * p;
  barge.z += 0.12 * smooth(p);
  barge.yaw = -0.22 * smooth(p);
  barge.wake = 0.3 * Math.sin(Math.PI * p);
  barge.verdict = FATES.iptal;
  barge.stamp = span(tau, start + 0.05, start + 0.05 + TIMING.stampFor);
  barge.alpha = 1 - smooth(span(p, 0.45, 1));
  if (p >= 1) barge.stage = STAGES.hidden;
}

/** Barge k at loop time t (rewrites `barge`). */
export function writeBarge(barge, k, t) {
  const cast = CAST[k];
  const plan = queuePlan(k);
  // the barge's own window of loop time starts at its arrival
  const tau = wrap(t - plan.arriveAt, LOOP) + plan.arriveAt;
  barge.stage = STAGES.hidden;
  barge.alpha = 0;
  barge.size = cast.size;
  barge.slab = -1;
  barge.stamp = 0;
  barge.verdict = -1;
  barge.wake = 0;
  barge.bob = 0.012 * Math.sin(t * 1.6 + k * 2.1);
  if (cast.fate === 'iptal') {
    if (tau > TIMING.kill + TIMING.throw + TIMING.unmoor + TIMING.drift) return barge;
    writeCancelled(barge, plan, tau);
    return barge;
  }
  const d = departure(k);
  if (tau < d) {
    writeQueued(barge, plan, tau);
    // the line is let go just before it casts off
    if (barge.stage === STAGES.moored) barge.rope *= 1 - smooth(span(tau, d - TIMING.castOff, d));
    return barge;
  }
  writeSailing(barge, cast, tau - d);
  return barge;
}

/** The rules' marks: each tag ticked as a bow passes it, arms swung out to cut, the boom down. */
export function writeRules(rules, t) {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    rule.check = 0;
    rule.arm = 0;
    rule.armSize = 0;
    rule.boom = 0;
    rule.mark = 0;
  }
  for (let k = 0; k < CAST.length; k += 1) {
    const cast = CAST[k];
    if (cast.fate === 'iptal') continue;
    const s = wrap(t - departure(k), LOOP);
    const last = cast.reject >= 0 ? cast.reject : RULE_COUNT - 1;
    for (let i = 0; i <= last; i += 1) {
      const at = bowTime(ruleX(i));
      const since = s - at;
      if (since > -0.05 && since < 0.9) rules[i].check = Math.max(rules[i].check, 1 - span(since, 0.25, 0.9));
    }
    for (let c = 0; c < cast.cuts.length; c += 1) {
      const cut = cast.cuts[c];
      const at = bowTime(ruleX(cut.rule));
      const out = smooth(span(s, at - TIMING.armOut, at - TIMING.armOut + TIMING.armSwing));
      const back = smooth(span(s, at + TIMING.armHold, at + TIMING.armHold + TIMING.armSwing));
      const arm = Math.min(out, 1 - back);
      if (arm > rules[cut.rule].arm) {
        rules[cut.rule].arm = arm;
        rules[cut.rule].armSize = cut.to;
      }
      rules[cut.rule].mark = Math.max(rules[cut.rule].mark, arm);
    }
    if (cast.reject >= 0) {
      const plan = rejectPlan(cast.reject);
      const down = smooth(span(s, plan.brakeAt - 0.5, plan.brakeAt));
      const up = smooth(span(s, plan.leaveAt - 0.4, plan.leaveAt + 0.3));
      const boom = Math.min(down, 1 - up);
      rules[cast.reject].boom = boom;
      rules[cast.reject].mark = Math.max(rules[cast.reject].mark, boom);
    }
  }
  return rules;
}

/** The kill switch: thrown once a loop, then set back by hand. */
export function leverAt(t) {
  const thrown = easeOut(span(t, TIMING.kill, TIMING.kill + TIMING.throw));
  const reset = smooth(span(t, TIMING.reset, TIMING.reset + TIMING.resetFor));
  return thrown * (1 - reset);
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
  for (let k = 0; k < CAST.length; k += 1) writeBarge(state.barges[k], k, t);
  writeRules(state.rules, t);
  state.lever = leverAt(t);
  const unmoor = TIMING.kill + TIMING.throw;
  state.kill = span(t, unmoor, unmoor + TIMING.unmoor) * (1 - span(t, TIMING.reset, TIMING.reset + TIMING.resetFor));
  return state;
}
