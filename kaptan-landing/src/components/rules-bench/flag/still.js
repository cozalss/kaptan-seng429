// Reduced motion: the same mast and pennants printed as static SVG. A state change is a new print
// (the pennant is set at its slot, dipped, rolled or gathered at the foot), with no animation.

import { assertState, stateTarget } from './halyard.js';
import { pennantSvg } from './svg.js';

const mastSvg = ({ pole, halyard, top, base }) =>
  '<svg class="flag-still__mast" aria-hidden="true" focusable="false">' +
  `<circle cx="${pole}" cy="${top - 2.5}" r="2.8"/>` +
  `<path class="flag-still__pole" d="M${pole} ${top}V${base + 6}M${pole - 8} ${base + 6}H${pole + 16}"/>` +
  `<path class="flag-still__line" d="M${halyard} ${top}V${base - 10}"/></svg>`;

/**
 * @param {{ host: HTMLElement, ids: string[], layout: (w: number, h: number) => object, className: string }} o
 */
export function createStill({ host, ids, layout: layoutOf, className }) {
  const doc = host.ownerDocument;
  const root = doc.createElement('div');
  root.className = `flag-still ${className}`;
  root.setAttribute('aria-hidden', 'true');
  const states = Object.fromEntries(ids.map((id) => [id, 'down']));
  const items = ids.map((id) => {
    const el = doc.createElement('span');
    el.className = 'flag-still__pennant';
    el.dataset.pennantId = id;
    el.innerHTML = pennantSvg(id);
    root.appendChild(el);
    return el;
  });
  host.appendChild(root);

  function place() {
    const layout = layoutOf(host.clientWidth || 160, host.clientHeight || 600);
    const mast = root.querySelector('.flag-still__mast');
    if (mast) mast.remove();
    root.insertAdjacentHTML('afterbegin', mastSvg(layout));
    items.forEach((el, k) => {
      const state = states[ids[k]];
      const target = stateTarget(state, layout.spots[k]);
      el.dataset.state = state;
      el.style.left = `${layout.halyard}px`;
      el.style.top = `${target.y}px`;
      el.style.width = `${layout.length}px`;
      el.style.height = `${layout.hoist}px`;
    });
  }

  const win = doc.defaultView;
  const ro = win && win.ResizeObserver ? new win.ResizeObserver(place) : null;
  if (ro) ro.observe(host);
  place();

  return {
    setState(id, state) {
      assertState(state);
      if (!(id in states)) throw new TypeError(`Unknown pennant id: ${String(id)}`);
      states[id] = state;
      place();
    },
    destroy() {
      if (ro) ro.disconnect();
      root.remove();
    },
  };
}
