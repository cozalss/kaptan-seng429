// Sınıflandırıcı's live plate: disclosure slips read, stamped with their type and filed into the
// six-hole locker. The scene contract (see ../SCENES.md): copy for the plate, a still for reduced
// motion, and create({ canvas }) → { setSize, render(elapsed), dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createClassifierRenderer } from './render.js';

export default Object.freeze({
  id: 'siniflandirici',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'gelen bildirim' }),
    Object.freeze({ key: 'b', text: 'okuma ve etiket' }),
    Object.freeze({ key: 'c', text: 'raf' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Temsili canlı şema: kurgusal bildirim fişleri okunur, türü damgalanır (E1–E4, Filtre ya da Diğer) ve raftaki kendi gözüne konur.',
  description:
    'Temsili canlı şema: kurgusal bildirim fişleri sırayla okunur, her birine türü damgalanır — E1, E2, E3, E4, Filtre ya da Diğer — ve altı gözlü raftaki kendi gözüne konur; her gözün üstünde günün çetelesi tutulur.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createClassifierRenderer({ canvas, keys });
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
