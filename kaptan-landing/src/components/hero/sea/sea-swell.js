// The ink sea's one source of truth: layers, swell and the scroll story. The fragment shader is
// generated from these numbers (sea-shader.js) and the DOM that rides the sea (boat, captions,
// headline sway) reads the same functions, so ink and paper never drift apart. Pure, no DOM.
// Units: x runs 0 → aspect across the screen, y 0 (bottom) → 1 (top), time in seconds.

export const SEA = Object.freeze({
  // Far → near. horizon: rest height of the surface; amp: swell height in a full storm;
  // depth: 0 far … 1 near (parallax, camera travel, darker ink); tone: ink density of the body.
  layers: Object.freeze([
    Object.freeze({ horizon: 0.5, amp: 0.013, depth: 0.12, tone: 0.2 }),
    Object.freeze({ horizon: 0.44, amp: 0.021, depth: 0.3, tone: 0.34 }),
    Object.freeze({ horizon: 0.37, amp: 0.032, depth: 0.5, tone: 0.5 }),
    Object.freeze({ horizon: 0.27, amp: 0.048, depth: 0.74, tone: 0.72 }),
    Object.freeze({ horizon: 0.14, amp: 0.072, depth: 1, tone: 0.92 }),
  ]),
  // Three travelling sines per layer: wavenumber (per unit x), speed (rad/s), weight, and chop:
  // how much a full storm adds to that wave's weight (short, steep seas on top of the long swell).
  waves: Object.freeze([
    Object.freeze({ k: 2.6, speed: 0.62, weight: 1, chop: 0 }),
    Object.freeze({ k: 5.1, speed: -0.9, weight: 0.42, chop: 0.5 }),
    Object.freeze({ k: 9.3, speed: 1.45, weight: 0.18, chop: 0.32 }),
  ]),
  calm: 0.2, // share of the swell left once the storm has passed
  crest: 0.6, // how far a full storm peaks the crests and flattens the troughs (0 = plain sines)
  travelDrop: 0.3, // how far the nearest layer sinks as the camera moves in
  parallax: 0.05, // x shift per unit of pointer and depth
  boatLayer: 2,
  // The boat rides the slope and, in weather, rolls on its own; both are scaled with the storm.
  roll: Object.freeze({ storm: 3, calm: 1.2, speed: 1.15, maxTilt: 13 }),
});

/** Weight of a wave in a storm of strength `storm` (0–1). */
export function waveWeight(wave, storm) {
  return wave.weight + wave.chop * storm;
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoothstep = (t) => t * t * (3 - 2 * t);
const window01 = (value, start, end) => clamp01((value - start) / (end - start));
const mix = (a, b, t) => a + (b - a) * t;

/** Per-layer phase and stretch, so the five surfaces never move in lockstep. */
export function layerPhase(index) {
  return { phase: index * 1.7, stretch: 1 + index * 0.14 };
}

/**
 * Storm crest shape of a normalised swell n ∈ [-1, 1]: sharp peaks, broad troughs, the way wind
 * piles water up. Stays within [-1, 1]. Mirrored in GLSL by swellFunction().
 */
export function peak(n, storm) {
  return mix(n, ((n + 1) * (n + 1)) / 2 - 1, SEA.crest * clamp01(storm));
}

/** Swell of layer `index` at x (without the shader's small brush detail). */
export function swell(x, t, index, storm) {
  const layer = SEA.layers[index];
  if (!layer) return 0;
  const { phase, stretch } = layerPhase(index);
  const s = clamp01(storm);
  const strength = layer.amp * (SEA.calm + (1 - SEA.calm) * s);
  let sum = 0;
  let total = 0;
  SEA.waves.forEach((wave) => {
    const weight = waveWeight(wave, s);
    sum += weight * Math.sin(wave.k * stretch * x + wave.speed * t + phase * (1 + wave.k * 0.1));
    total += weight;
  });
  return strength * peak(sum / total, s);
}

/** Height of layer `index`'s surface at x, with camera travel and pointer parallax. */
export function surface(x, t, index, { storm = 1, travel = 0, pointerX = 0 } = {}) {
  const layer = SEA.layers[index];
  if (!layer) return 0;
  const shifted = x + pointerX * layer.depth * SEA.parallax;
  return layer.horizon - travel * SEA.travelDrop * layer.depth + swell(shifted, t, index, storm);
}

/** Surface slope (dy/dx) by central difference. */
export function slope(x, t, index, options, h = 0.002) {
  return (surface(x + h, t, index, options) - surface(x - h, t, index, options)) / (2 * h);
}

/**
 * Scroll share at which each caption hands over to the next, where the outro (boat to centre
 * stage) runs, and over which share the storm blows itself out (1 → 0).
 */
export const STORY_BEATS = Object.freeze({
  captions: Object.freeze([0.22, 0.44, 0.64]),
  outro: Object.freeze([0.62, 0.76]),
  storm: Object.freeze([0.02, 0.66]),
});

/**
 * Scroll story of the hero, from its progress in [0, 1]: storm 1 → 0, the camera moving in,
 * which caption (0, 1, 2) is being told (-1 once the outro has taken over), and the outro
 * (0 → 1: the boat sails to the middle of a calm sea).
 */
export function storyAt(progress) {
  const p = clamp01(progress);
  const beat = STORY_BEATS.captions.findIndex((end) => p < end);
  return {
    storm: 1 - smoothstep(window01(p, STORY_BEATS.storm[0], STORY_BEATS.storm[1])),
    travel: smoothstep(window01(p, 0, 0.92)),
    caption: beat,
    outro: smoothstep(window01(p, STORY_BEATS.outro[0], STORY_BEATS.outro[1])),
  };
}

/**
 * The exit: the ink dries back into paper from the bottom up, the boat drifting on and drying with
 * it. `u` is the scroll position in viewports relative to the moment the stage is released
 * (negative while it is still held, 1 once it has scrolled fully away).
 *  - dry: mean height of the drying front in canvas units from the bottom.
 *  - leave: 0 → 1, the boat's drift from centre stage.
 * The front eases in while the stage is still held (reaching `atRelease` with the slope it then
 * keeps), then rises `rate`× faster than the stage scrolls away, so it always stays a margin above
 * the stage's bottom edge (the sea never shows a straight cut-off edge) and the last water dries
 * just as the next chapter's opener comes up from below: no blank stretch, no strip left behind.
 *  - front: the front's silhouette, a few slow sines whose phases move as it rises (mirrored in the
 *    shader, so the boat can dry exactly where its water does).
 *  - feather: width of the band in which ink survives only along the paper fibres.
 *  - ragged: how far below `dry` ink can still survive (silhouette + fine wobble + feathered band).
 */
export const EXIT = Object.freeze({
  atRelease: 0.27,
  rate: 2.1,
  full: 1.1,
  front: Object.freeze([
    Object.freeze({ amp: 0.08, k: 3.1, phase: 1.3, drift: 2.0 }),
    Object.freeze({ amp: 0.045, k: 7.3, phase: 0.4, drift: -3.1 }),
    Object.freeze({ amp: 0.02, k: 13.7, phase: 2.1, drift: 4.3 }),
  ]),
  wobble: 0.02,
  feather: 0.045,
  ragged: 0.25,
});

/** Viewports before the release at which the front starts (its ease-in meets `rate` smoothly). */
export const EXIT_START = (-2 * EXIT.atRelease) / EXIT.rate;

export function exitAt(u) {
  if (!(u > EXIT_START)) return { dry: 0, leave: 0 };
  const lead = (u - EXIT_START) / -EXIT_START;
  const dry = u < 0 ? EXIT.atRelease * lead * lead : Math.min(EXIT.full, EXIT.atRelease + EXIT.rate * u);
  return { dry, leave: dry / EXIT.full };
}

/** Offset of the drying front's silhouette at x (canvas units, positive = lower). */
export function frontOffset(x, dry) {
  return EXIT.front.reduce((sum, { amp, k, phase, drift }) => sum + amp * Math.sin(k * x + phase + drift * dry), 0);
}

/** Height of the drying front at x, before the fine wobble and the feathered band. */
export function frontAt(x, dry) {
  return dry - frontOffset(x, dry);
}

/** Height (canvas units from the bottom) below which the drying front has left bare paper only. */
export function fullyDryBelow(dry) {
  return dry - EXIT.ragged;
}

/** The boat's roll in weather (degrees), on top of the slope it rides. */
export function roll(t, storm) {
  const { storm: stormy, calm, speed } = SEA.roll;
  const amplitude = mix(calm, stormy, clamp01(storm));
  return amplitude * (Math.sin(t * speed) * 0.75 + Math.sin(t * speed * 2.3 + 1.1) * 0.25);
}

/**
 * Where the boat sits, in CSS px of a `width` × `height` viewport: its keel on the boat layer at
 * `xShare` of the width, tilted with the slope plus its own roll (degrees, clockwise positive like
 * CSS), clamped so it never capsizes.
 */
export function boatPose({ xShare, t, width, height, ...options }) {
  const aspect = width / height;
  const x = xShare * aspect;
  const y = surface(x, t, SEA.boatLayer, options);
  const tilt = (-Math.atan(slope(x, t, SEA.boatLayer, options)) * 180) / Math.PI + roll(t, options.storm ?? 1);
  const max = SEA.roll.maxTilt;
  return { left: xShare * width, top: (1 - y) * height, angle: Math.max(-max, Math.min(max, tilt)) };
}
