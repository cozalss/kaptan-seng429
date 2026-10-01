// Tiny hyperscript-style element helper. Never uses innerHTML: text children
// always become real text nodes, so nothing here can be tricked into parsing
// markup from data.

const SVG_NS = 'http://www.w3.org/2000/svg';
// Enough SVG for the wordmark <use> and the demo storyboard's ink drawings.
const SVG_TAGS = new Set(['svg', 'use', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'text']);

function applyAttr(element, key, value) {
  if (value == null || value === false) return;
  if (key === 'class' || key === 'className') {
    element.setAttribute('class', value);
    return;
  }
  if (key.startsWith('on') && typeof value === 'function') {
    element.addEventListener(key.slice(2).toLowerCase(), value);
    return;
  }
  element.setAttribute(key, value === true ? '' : String(value));
}

function applyAttrs(element, attrs) {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    applyAttr(element, key, value);
  }
}

function appendChild(element, child) {
  if (child == null || child === false) return;
  if (child instanceof Node) {
    element.appendChild(child);
    return;
  }
  element.appendChild(document.createTextNode(String(child)));
}

function appendChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    appendChild(element, child);
  }
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>|null} [attrs]
 * @param {...(Node|string|number|null|undefined|false)} children
 * @returns {HTMLElement|SVGElement}
 */
export function h(tag, attrs = null, ...children) {
  const element = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  applyAttrs(element, attrs);
  appendChildren(element, children);
  return element;
}
