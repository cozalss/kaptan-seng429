// The ink sea's WebGL layer: one full-screen triangle and the generated fragment shader, in plain
// WebGL (no engine). The program is compiled without blocking the main thread: with
// KHR_parallel_shader_compile the driver builds it on its own threads and we poll
// COMPLETION_STATUS_KHR every 60 ms before touching it (a sync LINK_STATUS query on a fresh
// program was a 535–640 ms long task). The printed SVG sea stays up meanwhile. Each instance owns
// its own <canvas>, so a released context is simply thrown away and a later claim starts clean.
// Browser-only glue (verified in Chromium, not jsdom).

import { fragment, vertex } from './sea-shader.js';

// Paper, ink and the kaptan-laciverti wash, linear 0–1. Paper is exactly --color-paper (#f3f1ec),
// so the dried sea is indistinguishable from the page.
export const SEA_COLORS = Object.freeze({
  paper: [243 / 255, 241 / 255, 236 / 255],
  // a navy-black ink and a saturated indigo (--color-wash #2a4c8c): the storm reads as deep blue
  // ink, not grey, and still holds its bands on a washed-out projector
  ink: [0.035, 0.063, 0.16],
  indigo: [0.165, 0.298, 0.549],
});

const CONTEXT = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
const COMPILE_TIMEOUT_MS = 8000;
// Each status query is a sync round trip to the GPU process (4–35 ms while it compiles): ask rarely.
const POLL_MS = 60;
const UNIFORMS = ['uRes', 'uTime', 'uStorm', 'uTravel', 'uReveal', 'uDry', 'uDpr', 'uPointer', 'uPaper', 'uInk', 'uIndigo'];

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/** Resolves once the driver has finished the program; polls without blocking when it can. */
function whenCompiled(gl, program, win) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  if (!parallel) return Promise.resolve();
  const started = win.performance.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (gl.isContextLost()) reject(new Error('WebGL context lost while compiling'));
      else if (gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) resolve();
      else if (win.performance.now() - started > COMPILE_TIMEOUT_MS) resolve(); // fall through to the blocking check
      else win.setTimeout(poll, POLL_MS);
    };
    win.setTimeout(poll, POLL_MS);
  });
}

function fail(gl, program, shaders) {
  const log = [gl.getProgramInfoLog(program), ...shaders.map((shader) => gl.getShaderInfoLog(shader))].filter(Boolean).join('\n');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return new Error(`ink sea shader failed to link: ${log || 'unknown error'}`);
}

/** Uploads the one triangle that covers clip space. */
function bindTriangle(gl, program) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
}

/**
 * Canvas pixels per CSS px: the screen's DPR, capped, and lowered on big screens so one frame never
 * shades more than `budget` pixels (the sea is one heavy full-screen pass).
 */
export function seaPixelRatio({ width, height, dpr, maxDpr, budget, minDpr }) {
  const fit = Math.sqrt(budget / Math.max(1, width * height));
  return Math.max(minDpr, Math.min(dpr || 1, maxDpr, fit));
}

/**
 * @param {HTMLElement} host   the element the canvas is appended to
 * @param {{ maxDpr: number, budget: number, minDpr: number, octaves: number }} quality
 * @returns {Promise<{ canvas: HTMLCanvasElement, resize: () => void,
 *   render: (frame: { time: number, storm: number, travel: number, reveal: number, dry: number, pointer: {x: number, y: number} }) => void,
 *   destroy: () => void }>}
 */
export async function createSeaRenderer(host, { maxDpr, budget, minDpr, octaves }) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'hero-sea__canvas';
  const gl = canvas.getContext('webgl2', CONTEXT) || canvas.getContext('webgl', CONTEXT);
  if (!gl) throw new Error('no WebGL');

  const shaders = [compile(gl, gl.VERTEX_SHADER, vertex), compile(gl, gl.FRAGMENT_SHADER, fragment({ octaves }))];
  const program = gl.createProgram();
  shaders.forEach((shader) => gl.attachShader(program, shader));
  gl.linkProgram(program);
  await whenCompiled(gl, program, win);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw fail(gl, program, shaders);
  shaders.forEach((shader) => gl.deleteShader(shader));

  gl.useProgram(program);
  bindTriangle(gl, program);
  const at = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]));
  gl.uniform3fv(at.uPaper, SEA_COLORS.paper);
  gl.uniform3fv(at.uInk, SEA_COLORS.ink);
  gl.uniform3fv(at.uIndigo, SEA_COLORS.indigo);
  host.append(canvas);

  const resize = () => {
    const cssWidth = host.clientWidth || 1;
    const cssHeight = host.clientHeight || 1;
    const ratio = seaPixelRatio({ width: cssWidth, height: cssHeight, dpr: win.devicePixelRatio, maxDpr, budget, minDpr });
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(at.uRes, width, height);
    gl.uniform1f(at.uDpr, width / cssWidth);
  };
  resize();

  return {
    canvas,
    resize,
    render({ time, storm, travel, reveal, dry, pointer }) {
      gl.uniform1f(at.uTime, time);
      gl.uniform1f(at.uStorm, storm);
      gl.uniform1f(at.uTravel, travel);
      gl.uniform1f(at.uReveal, reveal);
      gl.uniform1f(at.uDry, dry);
      gl.uniform2f(at.uPointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
