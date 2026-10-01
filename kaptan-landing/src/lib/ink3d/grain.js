// Rice-paper tooth for an ink plate: sparse fibres and specks inked once into a transparent canvas
// the size of the plate, laid over each frame so the drawing sits in the paper rather than on glass.

import { INK, makeCanvas } from './ink.js';
import { seededRandom } from './random.js';

/**
 * @param {Document} doc
 * @param {number} width   device px
 * @param {number} height  device px
 * @param {{ seed?: number, density?: number }} [options] density: fibres per 1 000 device px²
 */
export function drawPaperGrain(doc, width, height, { seed = 1929, density = 1.1 } = {}) {
  const canvas = makeCanvas(doc, width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const random = seededRandom(seed);
  const fibres = Math.round((canvas.width * canvas.height * density) / 1000);
  ctx.lineCap = 'round';
  for (let i = 0; i < fibres; i += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const fibre = random() < 0.35;
    ctx.globalAlpha = fibre ? 0.05 + random() * 0.07 : 0.06 + random() * 0.1;
    ctx.strokeStyle = random() < 0.5 ? INK.indigo : INK.sumi;
    ctx.lineWidth = fibre ? 0.6 + random() * 0.6 : 0.8 + random() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (fibre) {
      const len = 4 + random() * 12;
      const a = random() * Math.PI * 2;
      ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    } else {
      ctx.lineTo(x + 0.4, y + 0.3);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}
