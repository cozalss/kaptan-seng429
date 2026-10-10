// Önemlilik's live plate: the purser's balance on the spar. The amount Okuyucu found is set on one
// pan as a tagged weight, the company's ledgers (annual revenue, market value) on the other; the
// beam settles to a tilt the dial's needle shows. The threshold on the dial is the rules' mark and
// the needle never reaches it — Önemlilik weighs, it does not decide. The scene contract (see
// ../SCENES.md): copy for the plate, a still for reduced motion, and create({ canvas }) →
// { setSize, render(elapsed), dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createBalanceRenderer } from './render.js';

export default Object.freeze({
  id: 'onemlilik',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'tutar' }),
    Object.freeze({ key: 'b', text: 'finansallar' }),
    Object.freeze({ key: 'c', text: 'tartı' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Canlı şema: tutar terazinin bir kefesine, şirketin yıllık geliri ve piyasa değeri öbürüne konur; ibre eşiğe hiç değmez, çünkü eşiğe kurallar karar verir.',
  description:
    'Canlı şema: bildirimdeki tutar küçük bir ağırlık olarak terazinin sol kefesine konur; şirketin defterleri — yıllık gelir ve piyasa değeri — sandıktan alınıp sağ kefeye konur. Terazi yalnızca bir eğimle ve kadrandaki ibreyle tartar; kadrandaki eşik çizgisini kurallar çizmiştir ve ibre ona hiç değmez: Önemlilik tartar, eşiğe karar vermez.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createBalanceRenderer({ canvas, keys });
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
