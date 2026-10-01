// Fills the colophon (and any [data-timeline] plate) from SITE and MILESTONES so project facts live in
// one place (src/config/site.js, src/data/milestones.js). The markup carries a static fallback; this
// only refines it: past milestones struck through, the next one circled by hand, real links.

import { MILESTONES, formatMilestoneDate, nextMilestoneIndex } from '../../data/milestones.js';

const NEXT_SUFFIX = ' · sıradaki';
const PENDING_SUFFIX = ' · yakında';
const NEW_TAB_NOTE = ' (yeni sekmede açılır)';
const SVG_NS = 'http://www.w3.org/2000/svg';
// A pen circle drawn round a date: one loop that overshoots where it began.
const RING_PATH = 'M150 9 C 108 1 38 5 15 23 C -3 38 16 61 72 65 C 134 69 193 58 196 35 C 198 15 158 5 112 9';

/** The hand-drawn ink ring around the next milestone's date (decorative). */
export function createInkRing() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'timeline__ring');
  svg.setAttribute('viewBox', '-4 -4 208 78');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', RING_PATH);
  path.setAttribute('data-ink-ring', '');
  svg.append(path);
  return svg;
}

/** The schedule plate as a `dl`: label → date; past rows struck through, the next one circled ("· sıradaki"). */
export function renderTimeline(list, milestones = MILESTONES, today = new Date()) {
  const next = nextMilestoneIndex(milestones, today);
  const rows = milestones.flatMap((milestone, index) => {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = milestone.label;
    detail.textContent = formatMilestoneDate(milestone.date);
    const time = document.createElement('time');
    time.dateTime = milestone.date;
    time.append(...detail.childNodes);
    detail.append(time);
    if (index < next || next === -1) {
      term.classList.add('is-past');
      detail.classList.add('is-past');
    }
    if (index === next) {
      term.classList.add('is-next');
      detail.classList.add('is-next');
      term.append(document.createTextNode(NEXT_SUFFIX));
      detail.append(createInkRing());
    }
    return [term, detail];
  });
  list.replaceChildren(...rows);
}

/**
 * One project link: a real, new-tab link when SITE has its URL, otherwise a muted non-link
 * ("… · yakında") — never a dead "#".
 */
export function bindProjectLink(node, url) {
  const label = node.dataset.linkLabel ?? node.textContent.trim();
  if (typeof url === 'string' && /^https:\/\//.test(url)) {
    const link = document.createElement('a');
    link.className = node.className;
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.siteLink = node.dataset.siteLink;
    link.dataset.linkLabel = label;
    const note = document.createElement('span');
    note.className = 'visually-hidden';
    note.textContent = NEW_TAB_NOTE;
    link.append(label, note);
    link.classList.remove('is-pending');
    node.replaceWith(link);
    return link;
  }
  node.classList.add('is-pending');
  node.dataset.linkLabel = label;
  node.textContent = `${label}${PENDING_SUFFIX}`;
  return node;
}

/** Applies SITE values to [data-timeline] and every [data-site-link="<links key>"]. */
export function bindSiteContent(site, root = document, today = new Date()) {
  root.querySelectorAll('[data-timeline]').forEach((node) => renderTimeline(node, MILESTONES, today));
  root.querySelectorAll('[data-site-link]').forEach((node) => bindProjectLink(node, site.links?.[node.dataset.siteLink]));
}
