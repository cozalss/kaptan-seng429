// The agent detail: shared across every agent card, its content is (re)rendered each time
// `.open(agentId, trigger)` is called. It is laid out as a full plate page of the book: the running
// head "Bölüm 2 · Tayfa — 04 Kanıt", the portrait large as an inked plate, the name in Bodoni caps,
// the input/output line, the description, what the agent never does as a caption panel, and a way
// on to the route. The card's inked plate and the agent's name fly over into it as the page turns in
// (service-modal-motion.js). The URL follows it as
// `#ajan-<id>` so Back closes it and a deep link opens it (service-modal-history.js). The dialog
// is named by the visible agent-name heading. Internal names keep the "service" prefix of the
// shared overlay/motion/CSS infrastructure.

import { findAgent } from '../data/agents.js';
import { imageNameFromPath, pictureSet } from '../lib/responsive-images.js';
import { h } from './dom.js';
import { createOverlay } from './overlay.js';
import { createAgentScene } from './agent-scenes/index.js';
import { CLOSE_DURATION_MS, createDetailMotion, motionMode } from './service-modal-motion.js';
import { createServiceHistory, whenPageInteractive } from './service-modal-history.js';
import { createAgentPager, pagerStep } from './service-modal-pager.js';
import { AGENTS } from '../data/agents.js';

const TITLE_ID = 'service-modal-title';
const JOURNEY_TARGET = '#yolculuk';
// Asks the Tayfa strip to bring an agent's card into view (services-motion.js answers it).
export const REVEAL_AGENT_EVENT = 'kaptan:reveal-agent';
// Mirrors the detail layout: half the viewport beside the text, full width on phones.
const DETAIL_IMAGE_SIZES = '(min-width: 768px) 52vw, 100vw';

function buildMedia() {
  const image = h('img', { class: 'service-modal__image', alt: '' });
  const media = h('picture', { class: 'service-modal__media' }, image);
  return { media, image };
}

/** Rebuilds the <source>s for the current agent's image, falling back to a
 * plain <img src> when the path isn't one of the generated responsive sets
 * (e.g. a test fixture path) — never throws while rendering. */
function renderMedia(media, image, agent) {
  for (const source of media.querySelectorAll('source')) source.remove();
  const name = imageNameFromPath(agent.image);
  if (!name) {
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.src = agent.image;
    return;
  }
  const { sources, img } = pictureSet(name);
  for (const { type, srcset } of sources) {
    media.insertBefore(h('source', { type, srcset, sizes: DETAIL_IMAGE_SIZES }), image);
  }
  image.sizes = DETAIL_IMAGE_SIZES;
  image.src = img.src;
  image.srcset = img.srcset;
}

function buildContent(pager) {
  const closeButton = h(
    'button',
    { type: 'button', class: 'overlay__close', 'aria-label': 'Ajan detayını kapat' },
    '✕'
  );
  // The page's running head: "[ticks] Tayfa 4 / 8  ← 03 Önemlilik · 05 Şüpheci →  Bölüm 2 · Tayfa — 04 Kanıt".
  const headTitle = h('span', { class: 'service-modal__head-title' });
  // Left slot: the crew's folio in the book's folio language (one tick per agent, the one shown
  // inked, "Tayfa 4 / 8"), as the chapters' running heads show the page (lib/folio.js).
  const folio = h('span', { class: 'running-head__folio service-modal__folio', 'aria-hidden': 'true' });
  const label = h('div', { class: 'running-head service-modal__label' }, folio, pager.el, headTitle);
  const { media, image } = buildMedia();
  // The heading masks its inner line, which rises into view on open.
  const nameLine = h('span', { class: 'service-modal__name-line' });
  const name = h('h2', { class: 'service-modal__name', id: TITLE_ID }, nameLine);
  const meta = h('p', { class: 'service-modal__meta' });
  const description = h('p', { class: 'service-modal__description' });
  const notDoesText = h('span', { class: 'service-modal__not-text' });
  const notDoes = h(
    'p',
    { class: 'caption-panel service-modal__not' },
    h('span', { class: 'caption-panel__meta service-modal__not-label' }, 'Ne yapmaz'),
    notDoesText,
  );
  const ctaButton = h(
    'button',
    { type: 'button', class: 'pill service-modal__cta' },
    h('span', { class: 'pill__label' }, 'Rotada görün'),
    h('span', { class: 'pill__chip', 'aria-hidden': 'true' }),
  );
  return { closeButton, label, folio, headTitle, media, image, nameLine, name, meta, description, notDoes, notDoesText, ctaButton };
}

/** Letters in the longest word of a name ("Risk Kapısı" → 6). */
export function longestWord(text) {
  return Math.max(1, ...String(text).split(/\s+/).map((word) => word.length));
}

/**
 * Brings the card of the agent last shown into view under the closing page: the pinned strip
 * answers the event itself (it knows its scroll maths); anywhere else the card is scrolled to.
 */
function revealCard(agentId, doc = document) {
  const card = findCard(agentId);
  if (!card) return null;
  const event = new CustomEvent(REVEAL_AGENT_EVENT, { detail: { id: agentId, card }, cancelable: true });
  if (doc.dispatchEvent(event)) card.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  return card;
}

/** The detail's folio: a tick per agent (those before inked, the shown one long), "Tayfa n / N". */
export function renderFolio(slot, crew, id) {
  const at = crew.findIndex((agent) => agent.id === id);
  const ticks = h('span', { class: 'folio-ticks' });
  crew.forEach((_, i) => {
    const tick = h('i');
    if (i < at) tick.className = 'is-done';
    else if (i === at) tick.className = 'is-current is-done';
    ticks.append(tick);
  });
  slot.replaceChildren(ticks, h('span', { class: 'folio-page' }, `Tayfa ${at + 1} / ${crew.length}`));
}

function findCard(agentId) {
  return [...document.querySelectorAll('[data-service-id]')].find((el) => el.dataset.serviceId === agentId) ?? null;
}

/** Runs a motion step; false if it threw (motion is decoration: the dialog is already settled). */
function attemptMotion(step) {
  try {
    step();
    return true;
  } catch (error) {
    console.error('[kaptan] agent detail motion failed', error);
    return false;
  }
}

/**
 * @param {{
 *   mount: Element, agents?: ReadonlyArray<object>, lockScroll?: Function, unlockScroll?: Function,
 *   scrollTo?: Function, syncUrl?: boolean, createMotion?: typeof createDetailMotion,
 * }} options `syncUrl` (default true) mirrors the open agent in `#ajan-<id>`.
 * @returns {{open: (agentId: string, trigger?: Element) => void, close: () => void, isOpen: () => boolean, panel: HTMLElement, destroy: () => void}}
 */
export function createServiceModal({ mount, agents, lockScroll, unlockScroll, scrollTo = () => {}, syncUrl = true, createMotion = createDetailMotion }) {
  let currentAgent = null;
  // the agent whose card opened the page (a turn makes the close land on the last one shown)
  let openedFrom = null;
  // a turn's content swap still waiting for its moment in the motion (run at once on close)
  let pendingRender = null;
  let fadeOnClose = false;
  let history = null;
  const crew = agents ?? AGENTS;

  const overlay = createOverlay({
    mount,
    id: 'service-modal',
    label: 'Ajan detayı',
    labelledBy: TITLE_ID,
    variant: 'detail',
    lockScroll,
    unlockScroll,
    onClose: handleClose,
    closeDurationMs: CLOSE_DURATION_MS,
  });
  const pager = createAgentPager({ onStep: (direction) => step(direction) });
  const { closeButton, label, folio, headTitle, media, image, nameLine, name, meta, description, notDoes, notDoesText, ctaButton } = buildContent(pager);
  closeButton.addEventListener('click', () => overlay.close());

  ctaButton.addEventListener('click', () => {
    if (!currentAgent) return;
    fadeOnClose = true; // the page scrolls on: no morph back onto the card
    overlay.close();
    scrollTo(JOURNEY_TARGET);
  });

  // The close button is sticky in the panel's top-right corner (see
  // service-modal.css), outside the text column; it stays first in DOM order
  // so it is still the first focus stop.
  const body = h('div', { class: 'service-modal__body' }, name, meta, description, notDoes, ctaButton);
  // The agent's live plate (agent-scenes/): under the text on the right, below it on phones.
  // Hidden for an agent without one — never an empty frame.
  const sceneHost = h('div', { class: 'agent-scene service-modal__scene', hidden: true });
  const content = h('div', { class: 'service-modal__content' }, label, media, body, sceneHost);
  overlay.panel.append(closeButton, content);
  let scene = null;
  let sceneTimer = 0;

  function dropScene() {
    clearTimeout(sceneTimer);
    scene?.destroy();
    scene = null;
    sceneHost.hidden = true;
    content.classList.remove('service-modal__content--scene');
  }

  function mountScene(agent) {
    dropScene();
    scene = createAgentScene({ host: sceneHost, agentId: agent.id, reduced: motionMode() === 'reduced' });
    sceneHost.hidden = !scene;
    content.classList.toggle('service-modal__content--scene', Boolean(scene));
  }

  const startScene = () => scene?.start();

  const motion = createMotion({
    panel: overlay.panel,
    scrim: overlay.panel.parentElement.querySelector('.overlay__scrim'),
    media,
    image,
    title: nameLine,
    head: [label, closeButton],
    meta,
    description,
    caption: notDoes,
    cta: ctaButton,
    scene: sceneHost,
    onSceneIn: startScene,
  });

  function handleClose() {
    const fade = fadeOnClose;
    fadeOnClose = false;
    pendingRender?.();
    if (!fade && currentAgent && currentAgent.id !== openedFrom) {
      // turned to another agent: the strip under the wash scrolls to its card, which takes the focus
      // back and receives the plate
      const card = revealCard(currentAgent.id);
      if (card) {
        card.focus({ preventScroll: true });
        motion.retarget?.(card);
      }
    }
    scene?.stop();
    // freed once the page has turned away (a reopen within that time rebuilds it anyway)
    clearTimeout(sceneTimer);
    sceneTimer = setTimeout(() => {
      if (!overlay.isOpen()) dropScene();
    }, CLOSE_DURATION_MS);
    attemptMotion(() => motion.close({ fade }));
    history?.closed();
  }

  function renderAgent(agent) {
    currentAgent = agent;
    renderMedia(media, image, agent);
    image.alt = `${agent.name} ajanı için temsili görsel`;
    headTitle.replaceChildren(h('strong', null, 'Bölüm 2'), ` · Tayfa — ${agent.number} ${agent.name}`);
    nameLine.textContent = agent.name;
    // The caps are sized so the longest word always fits the text column (service-modal.css).
    name.style.setProperty('--name-chars', String(longestWord(agent.name)));
    meta.textContent = agent.meta;
    description.textContent = agent.description;
    notDoesText.textContent = agent.notDoes;
    renderFolio(folio, crew, agent.id);
    const focused = document.activeElement;
    pager.render(crew, agent.id);
    // the end of the crew: the focused way went disabled, hand the focus to the other one
    if (focused instanceof HTMLButtonElement && focused.disabled && pager.el.contains(focused)) {
      pager.el.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    mountScene(agent);
  }

  const indexOf = (id) => crew.findIndex((agent) => agent.id === id);

  /** Turns the open page to the agent `direction` places along the crew (no wrap). */
  function step(direction) {
    if (!currentAgent || !overlay.isOpen()) return;
    const next = crew[indexOf(currentAgent.id) + direction];
    if (next) open(next.id);
  }

  // ← / → turn the page wherever the focus is on it (a page turner that went disabled at the end
  // of the crew drops the focus to the body, so the listener sits on the document while open)
  const onKey = (event) => {
    if (!overlay.isOpen() || event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof Element && target !== document.body && !overlay.panel.contains(target)) return;
    const direction = pagerStep(event);
    if (!direction) return;
    event.preventDefault();
    step(direction);
  };
  document.addEventListener('keydown', onKey);

  const find = (id) => (agents ? findAgent(id, agents) : findAgent(id));

  function open(agentId, trigger) {
    const agent = find(agentId);
    if (!agent) return;
    const wasOpen = overlay.isOpen();
    if (!wasOpen) {
      pendingRender = null;
      renderAgent(agent);
      openedFrom = agent.id;
      overlay.open(trigger);
      if (!attemptMotion(() => motion.open(trigger))) startScene();
      history?.opened(agent.id);
      return;
    }
    if (agent === currentAgent) return;
    // a turn on the open page: the new agent is set down in place
    const direction = indexOf(agent.id) < indexOf(currentAgent?.id) ? -1 : 1;
    const render = () => {
      if (pendingRender !== render) return;
      pendingRender = null;
      renderAgent(agent);
    };
    pendingRender = render;
    currentAgent = agent;
    if (!motion.swap || !attemptMotion(() => motion.swap({ direction, render }))) {
      render();
      startScene();
    }
    history?.switched(agent.id);
  }

  let cancelDeepLink = () => {};
  if (syncUrl) {
    history = createServiceHistory({
      onRequestOpen: (id) => open(id, findCard(id) ?? undefined),
      onRequestClose: () => overlay.close(),
    });
    const deepLinkId = history.initialId();
    if (deepLinkId && find(deepLinkId)) {
      cancelDeepLink = whenPageInteractive(() => {
        if (!overlay.isOpen()) open(deepLinkId, findCard(deepLinkId) ?? undefined);
      });
    }
  }

  function destroy() {
    document.removeEventListener('keydown', onKey);
    cancelDeepLink();
    history?.destroy();
    dropScene();
    motion.destroy();
  }

  return { open, close: overlay.close, isOpen: overlay.isOpen, panel: overlay.panel, destroy };
}
