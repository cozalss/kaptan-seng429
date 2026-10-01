// Sumi-e ink sea on paper, after SBS's "The Boat" (hand-inked layers moving in depth): five wave
// bands washed in indigo → black ink, dry-brush streaks, one continuous brush stroke on every crest,
// paper left bare as foam, ink spray torn off the crests, a stormy sky wash and slanted rain. All of
// it is weighted by uStorm (1 = black storm, 0 = pale calm). On the exit the ink dries back into the
// paper from the bottom up (uDry). The swell is generated from SEA (sea-swell.js), so the DOM boat
// rides exactly this water. GLSL 1.00 (WebGL 1 and 2).

import { EXIT, SEA, layerPhase } from './sea-swell.js';

const f = (value) => {
  const text = String(Number(value.toFixed(5)));
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
};

/**
 * GLSL for `vec4 layerAt(int i)` (horizon, amp, depth, tone of layer i) and
 * `float swell(float x, float i, float amp)`: the same peaked sum of sines as swell() in
 * sea-swell.js. The layers share one loop in the shader (one copy of the code to compile instead
 * of five unrolled ones), so their numbers are looked up here.
 */
export function swellFunction() {
  const weight = ({ weight: w, chop }) => `(${f(w)} + ${f(chop)} * s)`;
  const terms = SEA.waves
    .map((wave) => `${weight(wave)} * sin(${f(wave.k)} * stretch * x + ${f(wave.speed)} * uTime + phase * ${f(1 + wave.k * 0.1)})`)
    .join(' + ');
  const total = SEA.waves.map(weight).join(' + ');
  const { phase, stretch } = layerPhase(1);
  const lookup = SEA.layers
    .map(({ horizon, amp, depth, tone }, index) => `  if (i == ${index}) return vec4(${f(horizon)}, ${f(amp)}, ${f(depth)}, ${f(tone)});`)
    .join('\n');
  return `vec4 layerAt(int i) {
${lookup}
  return vec4(0.0);
}

float swell(float x, float i, float amp) {
  float s = clamp(uStorm, 0.0, 1.0);
  float phase = i * ${f(phase)};
  float stretch = 1.0 + i * ${f(stretch - 1)};
  float n = (${terms}) / (${total});
  n = mix(n, (n + 1.0) * (n + 1.0) * 0.5 - 1.0, ${f(SEA.crest)} * s);
  return amp * (${f(SEA.calm)} + ${f(1 - SEA.calm)} * s) * n;
}`;
}

/**
 * GLSL loop that paints every layer, far → near, over `ink` / `tint`: an anti-aliased wash that is
 * darkest under the crest and pales with depth, horizontal dry-brush streaks, paper splashes at the
 * crest, one continuous crest stroke measured as a distance to the curve (its width breathes with
 * noise, its hairs run dry along it), and ink spray flecks torn off the crests in the storm.
 */
export function layerLoop() {
  return `
  for (int index = 0; index < ${SEA.layers.length}; index++) {
    vec4 layer = layerAt(index);
    float fi = float(index);
    float depth = layer.z;
    float sx = x + uPointer.x * depth * ${f(SEA.parallax)};
    // brush detail on the surface; in the calm the far crests keep more of it, so the horizon
    // reads as a hand-inked line rather than a ruled one
    float farCalm = (1.0 - smoothstep(0.1, 0.5, depth)) * (1.0 - uStorm);
    float detail = (fbm3(vec2(sx * 5.0 + uTime * (0.12 + depth * 0.2), fi * 3.7)) - 0.5) * 0.01 * (0.35 + uStorm + farCalm * 2.0);
    float h = layer.x - uTravel * ${f(SEA.travelDrop)} * depth + swell(sx, fi, layer.y) + detail;
    float d = h - uv.y;
    if (d > -0.07) {
      float sl = (swell(sx + 0.003, fi, layer.y) - swell(sx - 0.003, fi, layer.y)) / 0.006;
      float dist = d * inversesqrt(1.0 + sl * sl);
      float cover = smoothstep(-pixel, pixel, dist);
      // Wash: near-black under the crest in the storm, a pale indigo veil in the calm.
      float tone = mix(layer.w * 0.45, min(0.98, layer.w * 1.15 + 0.32), uStorm);
      float wash = tone * mix(1.0, mix(0.4, 0.7, uStorm), smoothstep(0.0, 0.08 + depth * 0.1, max(d, 0.0)));
      // Dry brush: the hairs run out of ink in broken horizontal strokes that leave the paper bare.
      float hair = noise(vec2(sx * 9.0 + fi * 5.1, uv.y * (160.0 + depth * 90.0)));
      float stroke = noise(vec2(sx * 1.1 - fi * 1.3, uv.y * (22.0 + depth * 14.0)));
      float bare = smoothstep(0.55, 0.75, hair) * smoothstep(0.35, 0.7, stroke) * smoothstep(0.02, 0.1, d);
      wash *= 1.0 - mix(0.85, 0.55, uStorm) * bare;
      wash *= 0.88 + 0.24 * noise(css * 0.35 + fi * 13.0);
      // Foam: paper splashes just under the crest while the storm lasts.
      float splash = smoothstep(0.8, 0.88, noise(vec2(sx * (22.0 + depth * 14.0) - uTime * 0.5, dist * 240.0)));
      splash *= (1.0 - smoothstep(0.004, 0.012 + depth * 0.012, dist)) * uStorm * step(0.004, dist);
      wash *= 1.0 - splash;
      // Crest: one continuous brush stroke around the curve; width breathes, hairs run dry along it.
      float halfW = (0.0016 + depth * 0.003) * (0.55 + noise(vec2(sx * 2.4 + fi * 2.3, uTime * 0.12))) * (0.8 + 0.5 * uStorm);
      float core = 1.0 - smoothstep(halfW - pixel, halfW + pixel, abs(dist - halfW * 0.6));
      float hairs = noise(vec2(sx * 16.0 + fi * 7.0, dist / halfW * 2.2));
      core *= 1.0 - 0.7 * smoothstep(0.62, 0.86, hairs) * smoothstep(0.3, 0.75, noise(vec2(sx * 1.7 + fi * 4.1, 3.0)));
      // Spray: ink flecks torn off the crests by the wind, only in the storm.
      float above = -dist;
      float fleck = noise(vec2(sx * 110.0 - uTime * 2.4, uv.y * 190.0 + uTime * 3.2));
      float spray = smoothstep(0.82, 0.9, fleck) * step(0.0, above) * (1.0 - smoothstep(0.0, 0.016 + depth * 0.04, above));
      spray *= smoothstep(0.45, 0.85, noise(vec2(sx * 3.2 - uTime * 0.5, fi * 1.9))) * uStorm * uStorm;
      float layerInk = mix(ink, wash, cover);
      layerInk = mix(layerInk, min(1.0, tone + 0.45), core);
      layerInk = max(layerInk, spray * (0.5 + depth * 0.4));
      tint = mix(tint, mix(depth, 1.0, 0.6 * uStorm), max(max(cover, core), spray));
      ink = layerInk;
    }
  }`;
}

/** GLSL for `float frontOffset(float x, float dry)`: the drying front's silhouette (sea-swell.js). */
export function frontFunction() {
  const terms = EXIT.front.map(({ amp, k, phase, drift }) => `${f(amp)} * sin(${f(k)} * x + ${f(phase)} + ${f(drift)} * dry)`).join(' + ');
  return `float frontOffset(float x, float dry) { return ${terms}; }`;
}

export const vertex = /* glsl */ `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/** @param {{ octaves?: number }} [options] fewer octaves on phones */
export function fragment({ octaves = 4 } = {}) {
  return /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uStorm;
uniform float uTravel;
uniform float uReveal;
uniform float uDry;
uniform float uDpr;
uniform vec2 uPointer;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uIndigo;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 q = fract(p);
  vec2 u = q * q * (3.0 - 2.0 * q);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < ${octaves}; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}

float fbm3(vec2 p) {
  float v = 0.5 * noise(p);
  v += 0.25 * noise(p * 2.03 + vec2(17.1, 9.2));
  v += 0.125 * noise(p * 4.1 + vec2(3.3, 41.7));
  return v / 0.875;
}

${swellFunction()}

${frontFunction()}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 css = frag / uDpr; // texture noise is sized in CSS px, so it reads the same at any DPR
  vec2 uv = frag / uRes;
  float x = uv.x * (uRes.x / uRes.y);
  float pixel = 1.0 / uRes.y;

  // Sky: a grey wash that gathers into heavy cloud with the storm, darker toward the top.
  float cloud = fbm(vec2(x * 1.3 + uTime * 0.018, uv.y * 2.4 - uTime * 0.008));
  float ink = smoothstep(0.4, 0.88, cloud) * (0.05 + 0.3 * uStorm) * smoothstep(0.25, 1.0, uv.y);
  ink += 0.1 * uStorm * smoothstep(0.6, 1.0, uv.y);
  // Weather above the sea (cloud, and the rain below) never outlives the drying ink.
  float weather = 1.0 - smoothstep(0.0, 0.5, uDry);
  ink *= weather;
  float tint = 0.0;

  ${layerLoop()}

  // Rain: slanted strokes of uneven length; denser, heavier and more wind-driven in the storm.
  float slant = x + uv.y * (0.22 + 0.16 * uStorm);
  float columns = mix(40.0, 66.0, uStorm);
  float column = floor(slant * columns);
  float lane = fract(slant * columns);
  float fall = uv.y * (3.0 + hash(vec2(column, 2.0)) * 3.0) + uTime * (6.0 + hash(vec2(column, 5.0)) * 4.0) + hash(vec2(column, 9.0)) * 20.0;
  float drop = step(mix(0.9, 0.8, uStorm), noise(vec2(column * 1.7, fall)));
  ink = max(ink, smoothstep(0.92, 1.0, lane) * drop * uStorm * 0.5 * weather);

  // Intro: the ink bleeds into the paper, bottom first, along a ragged front.
  float field = fbm3(uv * 3.2) * 0.55 + (1.0 - uv.y) * 0.45;
  float front = uReveal * 1.25;
  float shown = 1.0 - smoothstep(front - 0.1, front, field);
  float wet = smoothstep(front - 0.1, front - 0.02, field) * (1.0 - smoothstep(front - 0.02, front, field));
  ink = ink * shown + wet * 0.18 * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));

  // Exit: the ink dries back into the paper from the bottom along a ragged front. The front is
  // shaped at three scales: warped lobes where the wash pulls back, then a feathered band in which
  // the ink survives only along the paper's fibres and tooth (sized in CSS px), so strokes and
  // washes break up into dry-brush hairs instead of being cut. Below it: bare paper, exactly the
  // page colour, with a faint darker tide line on the wet side where the ink gathers as it dries.
  float dried = 0.0;
  if (uDry > 0.0) {
    float wobble = (fbm3(css * vec2(0.012, 0.03) + 5.0) - 0.5) * ${f(EXIT.wobble * 2)};
    float edge = uv.y + frontOffset(x, uDry) + wobble;
    float fibres = noise(css * vec2(0.05, 0.85)) * 0.6 + noise(css * 0.55) * 0.4;
    float k = (uDry - edge) / ${f(EXIT.feather)} + (fibres - 0.5) * 1.6;
    dried = smoothstep(0.0, 1.0, k);
    float tide = smoothstep(-0.7, 0.0, k) * (1.0 - smoothstep(0.0, 0.4, k));
    ink = min(1.0, ink * (1.0 + 0.45 * tide));
  }

  // Paper: tooth and fibres, printed ink multiplied in. On the exit the texture and the vignette
  // flatten out first, so the paper left behind is exactly the page.
  float plain = smoothstep(0.0, 0.2, uDry);
  float grain = noise(css * 0.9) * 0.5 + noise(css * 0.21) * 0.5;
  float fibre = noise(vec2(css.x * 0.015, css.y * 0.7));
  vec3 paper = mix(uPaper * (0.975 + grain * 0.04) - fibre * 0.012, uPaper, plain);
  vec3 inkColor = mix(uIndigo, uInk, clamp(tint, 0.0, 1.0));
  vec3 color = mix(paper, inkColor, clamp(ink, 0.0, 1.0));
  vec2 c = uv - 0.5;
  color *= 1.0 - 0.07 * dot(c, c) * (1.0 - plain);
  gl_FragColor = vec4(mix(color, uPaper, dried), 1.0);
}
`;
}
