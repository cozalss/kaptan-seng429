// Risk Kapısı's live plate: proposal barges pass sixteen rule bollards R01–R16 on a canal; a rule
// may cut a stack down or turn a barge back, never enlarge it; once a loop the kill switch on the
// gate unmoors the queue while the harbour stays tied up. The scene contract (see ../SCENES.md):
// copy for the plate, a still for reduced motion, and create({ canvas }) → { setSize, render, dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createGateRenderer } from './render.js';

export default Object.freeze({
  id: 'risk-kapisi',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'öneri kuyruğu' }),
    Object.freeze({ key: 'b', text: 'kurallar R01–R16' }),
    Object.freeze({ key: 'c', text: 'kill switch' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Temsili canlı şema: öneriler R01–R16 kurallarının önünden geçer; kurallar bir öneriyi yalnızca küçültür ya da reddeder, kill switch açık emirleri iptal eder ama pozisyon satmaz.',
  description:
    'Temsili canlı şema: kurgusal öneriler, yükü bir kâğıt destesi olan mavnalar olarak kanalda R01–R16 numaralı on altı kural babasının önünden geçer. Bir kural yükü yalnızca keserek küçültür ya da mavnayı geri çevirir; hiçbir kural yükü büyütmez. Geçenler kapıda aynen ya da küçültülmüş olarak damgalanır. Döngüde bir kez kill switch çekilir (zirveden −%5): kuyrukta bekleyen mavnaların halatları çözülür, açık emirler iptal edilir; limandaki mavnalar bağlı kalır, pozisyon satılmaz.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createGateRenderer({ canvas, keys });
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
