// Sancak Tezgâhı · the rule instruments (engineer B). One entry point for the glue:
//
//   createInstrument({ host, rule, reduced, onChange }) → { autoplay(), set(value), destroy() }
//
//   rule      'E1' | 'E2' | 'E3' | 'E4' | 'leak' | 'screen'
//   onChange  ({ rule, fired, value, text, ...extra }) on every change (also once for the preset).
//             E1/E3: value = % (number), extra.margin. E2/E4: value = boolean.
//             leak:   value = rise %, fired = the filter acts, extra.result = leakFilter() output.
//             screen: value = { tradable, noMeasure, inUniverse }, fired = a gate is shut,
//                     extra.result = screenGates() output.
//   autoplay  once: walks from just below the threshold across it (E2/E4 flip to "Evet", the screen
//             slip sails through). Reduced motion: jumps to the crossed state, no animation.
//             Any visitor input before or during it cancels it; the instrument is theirs.

import { E3_SPEC } from './balance.js';
import { disclosureInstrument } from './disclosure.js';
import { gatesInstrument } from './gates.js';
import { E1_SPEC } from './ledger.js';
import { LEAK_SPEC } from './leak.js';
import { sliderInstrument } from './slider.js';

const SLIDERS = { E1: E1_SPEC, E3: E3_SPEC, leak: LEAK_SPEC };

export function createInstrument(options) {
  const { host, rule } = options;
  if (!host) throw new Error('createInstrument: host element missing');
  if (rule === 'E2' || rule === 'E4') return disclosureInstrument(options);
  if (rule === 'screen') return gatesInstrument(options);
  const spec = SLIDERS[rule];
  if (!spec) throw new Error(`createInstrument: unknown rule "${rule}"`);
  return sliderInstrument(options, spec);
}
