// Paints the inked sea (rota-sea.js) and the waypoint landmarks (rota-landmarks.js) into the
// chart's <svg data-rota-sea>: indigo washes deepening toward the reader, wash pools, a horizon,
// brush-stroke crests with a rough paper edge from one static turbulence filter (never animated),
// then the landmarks in paper, wash and sumi. Rebuilt only when the chart is resized.

import { LANDMARKS } from './rota-landmarks.js';
import { seaBands, washPools } from './rota-sea.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WASH_COLOR = '#2b4261'; // --color-wash, SEA_COLORS.indigo in the hero
const INK_COLOR = '#121318'; // --color-sumi, SEA_COLORS.ink
const PAPER_COLOR = '#f3f1ec'; // --color-paper
export const HORIZON = 22; // px below the chart top: the sea begins under the title

function el(name, attributes = {}, children = []) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  node.append(...children);
  return node;
}

function stop(offset, color, opacity) {
  return el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity });
}

function defs() {
  const rough = el('filter', { id: 'rota-sea-rough', x: '-2%', y: '-20%', width: '104%', height: '140%' }, [
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.05 0.09', numOctaves: 2, seed: 7, result: 'grain' }),
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'grain', scale: 3.4, xChannelSelector: 'R', yChannelSelector: 'G' }),
  ]);
  const bleed = el('filter', { id: 'rota-sea-bleed', x: '-10%', y: '-30%', width: '120%', height: '160%' }, [
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.014', numOctaves: 3, seed: 11, result: 'n' }),
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 22, xChannelSelector: 'R', yChannelSelector: 'G' }),
  ]);
  const fade = el('linearGradient', { id: 'rota-sea-fade-g', x1: 0, y1: 0, x2: 0, y2: 1 }, [
    stop(0, '#fff', 0.2),
    stop(0.02, '#fff', 1),
    stop(0.985, '#fff', 1),
    stop(1, '#fff', 0.6),
  ]);
  const mask = el('mask', { id: 'rota-sea-fade', maskContentUnits: 'objectBoundingBox' }, [
    el('rect', { width: 1, height: 1, fill: 'url(#rota-sea-fade-g)' }),
  ]);
  // Each band's wash is strongest under its crest and thins toward the next one (pigment settling).
  const wash = el('linearGradient', { id: 'rota-sea-wash', x1: 0, y1: 0, x2: 0, y2: 1 }, [
    stop(0, WASH_COLOR, 1),
    stop(0.45, WASH_COLOR, 0.55),
    stop(1, WASH_COLOR, 0),
  ]);
  return el('defs', {}, [rough, bleed, fade, mask, wash]);
}

const path = (d, attributes) => el('path', { d, ...attributes });

/** The sea itself: washes, pools, horizon and crests. */
function water(width, height) {
  const bands = seaBands({ width, height, horizon: HORIZON });
  const washes = bands.map((band) => path(band.wash, { fill: 'url(#rota-sea-wash)', 'fill-opacity': band.washOpacity }));
  const pools = washPools({ width, height, horizon: HORIZON }).flatMap((pool) => [
    path(pool.d, { fill: WASH_COLOR, 'fill-opacity': pool.opacity }),
    path(pool.d, { fill: 'none', stroke: WASH_COLOR, 'stroke-opacity': pool.opacity * 1.6, 'stroke-width': 2.4 }),
  ]);
  const crests = bands.flatMap((band) => [
    ...band.crests.map((d) => path(d, { fill: INK_COLOR, 'fill-opacity': (0.5 + 0.45 * band.t).toFixed(2) })),
    ...band.ripples.map((d) => path(d, { fill: INK_COLOR, 'fill-opacity': 0.3 })),
  ]);
  const horizon = path(`M -20 ${HORIZON} L ${Math.round(width + 20)} ${HORIZON - 1}`, {
    fill: 'none',
    stroke: INK_COLOR,
    'stroke-opacity': 0.7,
    'stroke-width': 1.2,
  });
  return { bands, nodes: [el('g', {}, washes), el('g', { filter: 'url(#rota-sea-bleed)' }, pools), el('g', { filter: 'url(#rota-sea-rough)' }, [horizon, ...crests])] };
}

/** One landmark, drawn by its builder at (x, y, s) shifted into the sea's own space. */
function landmark({ index, x, y, s, options }, dx) {
  const draw = LANDMARKS[index];
  if (!draw) return null;
  const mark = draw(x + dx, y, s, options);
  return el('g', { class: 'rota__landmark', 'data-landmark': index + 1 }, [
    ...mark.paper.map((d) => path(d, { fill: PAPER_COLOR })),
    ...mark.wash.map((d) => path(d, { fill: WASH_COLOR, 'fill-opacity': 0.5 })),
    el('g', { filter: 'url(#rota-sea-rough)' }, mark.ink.map((d) => path(d, { fill: INK_COLOR }))),
    ...mark.figures.map((figure) => {
      const text = el('text', { x: Math.round(figure.x), y: Math.round(figure.y), class: 'rota__sounding' });
      text.textContent = figure.text;
      return text;
    }),
  ]);
}

/**
 * @param {SVGSVGElement | null} svg
 * @param {{ landmarks?: { index: number, x: number, y: number, s: number, options?: object }[],
 *   offsetX?: number }} [options]  landmarks in the chart's space; offsetX = chart left − sea left
 * @returns {boolean} whether a sea was drawn
 */
export function renderSea(svg, { landmarks = [], offsetX = 0 } = {}) {
  if (!svg) return false;
  const { width, height } = svg.getBoundingClientRect();
  const sea = width > 0 && height > 0 ? water(width, height) : { bands: [] };
  if (sea.bands.length === 0) {
    svg.replaceChildren();
    return false;
  }
  svg.setAttribute('viewBox', `0 0 ${Math.round(width)} ${Math.round(height)}`);
  const marks = landmarks.map((item) => landmark(item, offsetX)).filter(Boolean);
  svg.replaceChildren(defs(), el('g', { mask: 'url(#rota-sea-fade)' }, sea.nodes), el('g', {}, marks));
  return true;
}
