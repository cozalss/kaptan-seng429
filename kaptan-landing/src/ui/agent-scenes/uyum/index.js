// Uyum's live plate: disclosures read one by one under a lantern whose light raises an SPK measure
// stamp or an instruction hidden in pale ink; the hidden line is struck, the slip flagged and dropped
// into a sealed box whose counter reads "Emir: 0". The scene contract (see ../SCENES.md): copy for
// the plate, a still for reduced motion, and create({ canvas }) → { setSize, render(elapsed), dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createUyumRenderer } from './render.js';

export default Object.freeze({
  id: 'uyum',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'gelen bildirim' }),
    Object.freeze({ key: 'b', text: 'fenerin altında' }),
    Object.freeze({ key: 'c', text: 'mühürlü kutu' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Temsili canlı şema: Uyum her bildirimde SPK tedbirini ve satır arasına gizlenmiş talimatı arar; şüpheli bildirim mühürlü kutuya düşer ve sayaç hep "Emir: 0" gösterir.',
  description:
    'Temsili canlı şema: kurgusal bildirimler sırayla fenerin altındaki okuma masasına konur. Fenerin ışığı, şirket dosyasındaki SPK tedbir damgasını ya da satır arasına soluk mürekkeple gizlenmiş bir talimatı açığa çıkarır. Temiz bildirim işaretlenip yoluna devam eder; tedbirli bildirim durdurulur; gizli satırın üstü çizilir, bildirime bayrak takılır ve mühürlü kutuya düşürülür. Kutunun önündeki sayaç hep "Emir: 0" gösterir: kötü niyetli bir bildirimden emir çıkmaz.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createUyumRenderer({ canvas, keys });
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
