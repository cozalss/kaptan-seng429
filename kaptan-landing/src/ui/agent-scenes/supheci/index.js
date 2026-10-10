// Şüpheci's live plate: draft proposals pinned to the lookout's board and swept with the spyglass;
// a find is ringed and the proposal is cut back or vetoed — never enlarged. The scene contract (see
// ../SCENES.md): copy for the plate, a still for reduced motion, and create({ canvas }) →
// { setSize, render(elapsed), dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createSkepticRenderer } from './render.js';

export default Object.freeze({
  id: 'supheci',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'taslak öneri' }),
    Object.freeze({ key: 'b', text: 'açık arama' }),
    Object.freeze({ key: 'c', text: 'küçült / veto' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Canlı şema: Şüpheci taslak öneriyi dürbünle tarar; sızıntı ya da abartı bulursa öneriyi küçültür veya veto eder, hiçbir zaman büyütmez.',
  description:
    'Canlı şema: taslak öneriler sırayla panoya iğnelenir ve dürbünle taranır. Fiyat bildirimden önce yükselmişse (sızıntı) bulgu daire içine alınır ve büyüklük çubuğu bir çizgiyle kısaltılır; abartılı bir ifade bulunursa öneri çizilip veto edilir; açık yoksa öneri olduğu gibi geçer. Büyütme seçeneği çizilir ve üstü çizilir: Şüpheci bir öneriyi büyütemez.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createSkepticRenderer({ canvas, keys });
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
