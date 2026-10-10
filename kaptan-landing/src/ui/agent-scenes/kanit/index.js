// Kanıt's live plate: past events drawn from the event memory by their headings only — their later
// returns stay covered — laid in a row; once the choice is closed, the code lifts the covers and
// keeps the tally. The scene contract (see ../SCENES.md): copy for the plate, a still for reduced
// motion, and create({ canvas }) → { setSize, render(elapsed), dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createEvidenceRenderer } from './render.js';

export default Object.freeze({
  id: 'kanit',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'olay hafızası' }),
    Object.freeze({ key: 'b', text: 'başlıkla seçim' }),
    Object.freeze({ key: 'c', text: 'kod: istatistik' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Canlı şema: Kanıt olay hafızasından benzer geçmiş olayları yalnızca başlıklarına bakarak seçer; örtülü getirileri seçimden sonra kod açar ve sayar.',
  description:
    'Canlı şema: bir olay kartı gelir; olay hafızasının çekmecelerinden benzer geçmiş olayların kartları çıkar. Her kartın alt yarısı — sonraki getiri — örtülüdür; Kanıt kartları yalnızca başlıklarına bakarak seçer ve sıraya dizer. Seçim kapandıktan sonra örtüleri kod kaldırır ve istatistiği kod tutar.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createEvidenceRenderer({ canvas, keys });
    const state = createFrameState();
    return {
      setSize: renderer.setSize,
      render(elapsed) {
        renderer.render(frameAt(elapsed, state));
      },
      dispose: renderer.dispose,
    };
  },
});
