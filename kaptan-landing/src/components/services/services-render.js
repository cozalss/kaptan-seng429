import { el } from '../../lib/dom.js';
import { imageNameFromPath, pictureSet } from '../../lib/responsive-images.js';

const MEDIA_WIDTH = 900;
const MEDIA_HEIGHT = 1200;
// Mirrors .service-card__media: the portrait is sized by height (≤ 62vh, 3:4) on the pinned strip,
// ≈ 84vw wide in the phone stack.
export const SERVICE_IMAGE_SIZES = '(max-width: 767px) 84vw, 47vh';
// The splash panel crops the portrait into a frame ≈ 1.5× as wide.
export const WIDE_IMAGE_SIZES = '(max-width: 767px) 84vw, 72vh';

// The strip is a comic page, not a carousel: three panel formats. The first reader opens the crew
// on a wide splash; the LLM agents stand in standard panels; the two deterministic stages are tall
// narrow ruled plates, after a gutter beat where the strip changes register (wash → ink, paper →
// ledger). Each panel carries one small idle loop over its art (`life`, CSS only, paused off
// screen): a glint, a reading rule, a lantern's flicker — positions in % of the 3:4 portrait.
// `artX` is the portrait's horizontal focus when a narrow frame crops it.
// Presentation only: no facts here (src/data/agents.js holds them).
export const PANELS = Object.freeze({
  siniflandirici: { format: 'splash', life: { kind: 'glint', x: 84, y: 29 } },
  okuyucu: { format: 'standard', life: { kind: 'rule', x: 17, y: 73, w: 44 } },
  onemlilik: { format: 'standard', life: { kind: 'glint', x: 69, y: 21 } },
  kanit: { format: 'standard', life: { kind: 'rule', x: 30, y: 74, w: 30 } },
  supheci: { format: 'standard', life: { kind: 'glint', x: 95, y: 22 } },
  uyum: { format: 'standard', life: { kind: 'flicker', x: 13.6, y: 20.5 } },
  'kural-motoru': { format: 'plate', artX: 30, life: { kind: 'glint', x: 17, y: 64 } },
  'risk-kapisi': { format: 'plate', artX: 42, life: { kind: 'glint', x: 12, y: 47 } },
});
const DEFAULT_PANEL = Object.freeze({ format: 'standard', life: null });

/** The panel format and idle loop of an agent (standard, no loop, for one without an entry). */
export function panelFor(id) {
  return PANELS[id] ?? DEFAULT_PANEL;
}
// The two deterministic stages are ruled plates; each is stamped with the rules it applies.
const PLATE_CODES = Object.freeze({ 'kural-motoru': 'E1–E4', 'risk-kapisi': 'R01–R16' });
// Rule codes (E1–E4, R01–R16) are set in the one justified mono face (.rule-code).
const RULE_CODE = /(E\d(?:–E\d)?|R\d{2}(?:–R\d{2})?)/;

function createImage(name, agent, sizes) {
  const image = document.createElement('img');
  Object.assign(image, { alt: '', width: MEDIA_WIDTH, height: MEDIA_HEIGHT });
  image.setAttribute('loading', 'lazy');
  image.setAttribute('decoding', 'async');
  if (!name) {
    image.src = agent.image;
    return image;
  }
  const { sources, img } = pictureSet(name);
  Object.assign(image, { src: img.src, srcset: img.srcset, sizes });
  const picture = document.createElement('picture');
  sources.forEach(({ type, srcset }) => {
    const source = document.createElement('source');
    Object.assign(source, { type, srcset, sizes });
    picture.append(source);
  });
  picture.append(image);
  return picture;
}

/** "Girdi: bildirim · Çıktı: E1–E4" → { input: 'bildirim', output: 'E1–E4' } (null when malformed). */
export function parseAgentMeta(meta) {
  const match = /^Girdi:\s*(.+?)\s*·\s*Çıktı:\s*(.+)$/.exec(String(meta ?? ''));
  return match ? { input: match[1], output: match[2] } : null;
}

/** "4 / 8 · LLM ajanı" — the small folio at the head of a panel. */
export function agentFolio(index, total, kindLabel) {
  return `${index + 1} / ${total} · ${kindLabel}`;
}

/** Text with its rule codes wrapped in `.rule-code` spans (text nodes only, never HTML). */
export function withRuleCodes(text) {
  return String(text)
    .split(RULE_CODE) // capturing split: the codes sit at the odd indices
    .map((part, i) => (i % 2 ? el('span', 'rule-code', part) : document.createTextNode(part)))
    .filter((node) => node.textContent);
}

function ioCell(key, value) {
  const cell = el('span', 'service-card__io');
  cell.append(el('span', 'service-card__io-key', key), el('span', 'service-card__io-value'));
  cell.lastChild.append(...withRuleCodes(value));
  return cell;
}

function createMeta(meta) {
  const row = el('span', 'service-card__meta');
  const io = parseAgentMeta(meta);
  if (!io) {
    row.textContent = meta;
    return row;
  }
  row.append(ioCell('Girdi', io.input), ioCell('Çıktı', io.output));
  return row;
}

/** Screen-reader name of an agent card: what it is, what goes in and out, what a press does. */
export function agentCardLabel(agent) {
  return `${agent.name}, ${agent.category}. ${agent.meta}. Ayrıntıları gör`;
}

function createFolio(agent, index, total) {
  const folio = el('span', 'service-card__category', agentFolio(index, total, agent.kindLabel ?? agent.category));
  const code = PLATE_CODES[agent.id];
  if (!code) return folio;
  const head = el('span', 'service-card__head');
  head.append(folio, el('span', 'service-card__code rule-code', code));
  return head;
}

/** The idle loop laid over a portrait (decoration: aria-hidden), mapped onto the 3:4 art box. */
function createLife(life) {
  const layer = el('span', 'service-card__life');
  layer.setAttribute('aria-hidden', 'true');
  layer.append(el('span', 'life__rain'));
  if (life) {
    const mark = el('span', `life__${life.kind}`);
    mark.style.setProperty('--x', `${life.x}%`);
    mark.style.setProperty('--y', `${life.y}%`);
    if (life.w) mark.style.setProperty('--w', `${life.w}%`);
    layer.append(mark);
  }
  return layer;
}

function createCard(agent, index, total) {
  const panel = panelFor(agent.id);
  const isWide = panel.format === 'splash';
  const classes = ['services__item', `services__item--${agent.kind}`, `services__item--${panel.format}`];
  const item = el('li', classes.join(' '));
  if (panel.artX !== undefined) {
    item.style.setProperty('--art-x', `${panel.artX}%`);
    item.style.setProperty('--art-fx', String(panel.artX / 100));
  }
  const card = el('button', 'service-card');
  card.type = 'button';
  card.dataset.serviceId = agent.id;
  card.dataset.agentKind = agent.kind;
  card.setAttribute('aria-label', agentCardLabel(agent));

  const media = el('span', 'service-card__media');
  media.append(createImage(imageNameFromPath(agent.image), agent, isWide ? WIDE_IMAGE_SIZES : SERVICE_IMAGE_SIZES), createLife(panel.life));
  const frame = el('span', 'service-card__frame');
  // The caption box laid over the art: the character's own line (what it will not do).
  frame.append(media, el('span', 'service-card__voice caption-panel', agent.notDoes));

  const text = el('span', 'service-card__text');
  text.append(el('span', 'service-card__name', agent.name), createMeta(agent.meta));

  card.append(createFolio(agent, index, total), frame, text);
  item.append(card);
  return item;
}

/**
 * The gutter beat between the readers and the deciders: an ink panel ("Altısı okur. / İkisi
 * hükmeder.", the chapter's lead said once more as a beat) whose ledger runs on under the two
 * ruled plates. Only for the crew as it is (six LLM agents, then two deterministic stages).
 */
function createBeat() {
  const beat = el('li', 'services__beat');
  beat.setAttribute('aria-hidden', 'true'); // the lead caption already says it
  beat.append(el('span', 'services__beat-line', 'Altısı okur.'), el('span', 'services__beat-line services__beat-line--indent', 'İkisi hükmeder.'));
  return beat;
}

/** Where the beat goes: before the first deterministic panel, when six readers precede two deciders. */
export function beatIndex(agents) {
  const first = agents.findIndex((agent) => agent.kind === 'rule');
  const rules = agents.filter((agent) => agent.kind === 'rule').length;
  return first === 6 && rules === 2 ? first : -1;
}

/** Renders the crew as comic-strip panels into the pinned horizontal track. */
export function renderServices(track, agents) {
  if (!track) return;
  const panels = agents.map((agent, index) => createCard(agent, index, agents.length));
  const at = beatIndex(agents);
  if (at >= 0) panels.splice(at, 0, createBeat());
  track.replaceChildren(...panels);
}
