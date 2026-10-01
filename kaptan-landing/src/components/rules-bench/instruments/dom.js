// Tiny DOM/SVG builders shared by the instruments. Browser glue: no state, no timers.

const SVG_NS = 'http://www.w3.org/2000/svg';
let uid = 0;

/** A document-unique id for labels, clip paths and patterns. */
export const nextId = (prefix) => `${prefix}-${(uid += 1)}`;

/** Creates an element; `attrs.text` sets textContent, `attrs.class` the class list. */
function build(el, attrs, parent) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null) continue;
    if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value);
  }
  if (parent) parent.append(el);
  return el;
}

export const h = (tag, attrs, parent) => build(document.createElement(tag), attrs, parent);
export const s = (tag, attrs, parent) => build(document.createElementNS(SVG_NS, tag), attrs, parent);

/** The drawing surface: decorative (the real control and the sentence carry the meaning). */
export function artSvg(parent, width, height) {
  return s(
    'svg',
    { class: 'inst__svg', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' },
    parent,
  );
}

/** A small ink stamp ("Öneri adayı"); CSS presses it in when the figure's rule fires. */
export function stamp(parent, x, y, lines, width = 92) {
  const lineH = 13;
  const height = 10 + lines.length * lineH;
  const g = s('g', { class: 'inst__stamp', transform: `translate(${x} ${y})` }, parent);
  const inner = s('g', { class: 'inst__stamp-ink' }, g);
  s('rect', { x: 0, y: 0, width, height, class: 'inst__stamp-frame' }, inner);
  s('rect', { x: 3, y: 3, width: width - 6, height: height - 6, class: 'inst__stamp-frame is-thin' }, inner);
  lines.forEach((line, i) =>
    s('text', { x: width / 2, y: 5 + lineH * (i + 1) - 2, class: 'inst__stamp-text', text: line }, inner),
  );
  return g;
}

/** Threshold rule: a dashed pencil line, and an ink line that draws over it when the rule fires. */
export function thresholdLine(parent, d) {
  s('path', { d, class: 'inst__thr' }, parent);
  return s('path', { d, class: 'inst__thr-ink', pathLength: '1' }, parent);
}

/** Clip + hatch pattern for the part of a wash that passes the threshold line. */
export function overHatch(svg, clipRect) {
  const clip = nextId('inst-clip');
  const hatch = nextId('inst-hatch');
  const defs = s('defs', null, svg);
  s('rect', clipRect, s('clipPath', { id: clip }, defs));
  const pat = s('pattern', { id: hatch, width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  s('line', { x1: 0, y1: 0, x2: 0, y2: 4, class: 'inst__hatch' }, pat);
  return { 'clip-path': `url(#${clip})`, fill: `url(#${hatch})` };
}
