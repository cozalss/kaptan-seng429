// Okuyucu's live plate: on a slanted reading desk the free text of a disclosure is read line by
// line; the amount, the counterparty and the term lift off the page as paper tags and are pinned
// into the three fields of a ruled form. The form's ratio row stays empty and struck through — the
// merge node computes ratios. The scene contract (see ../SCENES.md): copy for the plate, a still
// for reduced motion, and create({ canvas }) → { setSize, render(elapsed), dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createReaderRenderer } from './render.js';

export default Object.freeze({
  id: 'okuyucu',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'metin' }),
    Object.freeze({ key: 'b', text: 'alan' }),
    Object.freeze({ key: 'c', text: 'form' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Canlı şema: bir bildirimin metninden tutar, karşı taraf ve süre birer etiket olarak alınıp forma iğnelenir; oran satırı boş kalır.',
  description:
    'Canlı şema: bir bildirimin serbest metni eğik bir okuma masasında satır satır okunur; tutar, karşı taraf ve süre metinden birer kâğıt etiket olarak kalkar ve yandaki formun üç alanına iğnelenir. Formdaki oran satırı boş ve üstü çizili kalır: oranı birleştirme düğümü hesaplar. Dolan form yığına konur, sıradaki sayfa gelir.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createReaderRenderer({ canvas, keys });
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
