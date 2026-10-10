// Kural Motoru's live plate: punched evidence cards read under a bridge of pins, set against the
// written E1–E4 thresholds and sorted through fixed gates — the same card twice, the same gate
// twice. The scene contract (see ../SCENES.md): copy for the plate, a still for reduced motion,
// and create({ canvas }) → { setSize, render(elapsed), dispose }.

import { STILL_ELAPSED, createFrameState, frameAt } from './model.js';
import { createRuleEngineRenderer } from './render.js';

export default Object.freeze({
  id: 'kural-motoru',
  legend: Object.freeze([
    Object.freeze({ key: 'a', text: 'kanıt kartı' }),
    Object.freeze({ key: 'b', text: 'yazılı eşik' }),
    Object.freeze({ key: 'c', text: 'karar' }),
  ]),
  // spoken as the plate's text alternative: one sentence
  summary:
    'Canlı şema: kanıt kartları E1–E4 kurallarının yazılı eşiklerinden geçer ve aynı girdi her seferinde aynı kutuya düşer.',
  description:
    'Canlı şema: kanıt kartları sırayla okunur; değerleri E1–E4 kurallarının yazılı eşikleriyle karşılaştırılır (örneğin E1 için 10 seansta sermayenin en az %0,25’i) ve her kart kendi kapısından ilgili kutuya düşer, eşiği karşılamayan kart karar almaz. Aynı kart iki kez gelir ve iki kez de aynı kutuya düşer: aynı girdi, aynı karar. Hiçbir adım rastlantıya ya da bir dil modeline bağlı değildir.',
  stillElapsed: STILL_ELAPSED,
  /** @param {{ canvas: HTMLCanvasElement, keys?: Float32Array | null }} options (`keys`: see ../keys.js) */
  create({ canvas, keys = null }) {
    const renderer = createRuleEngineRenderer({ canvas, keys });
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
