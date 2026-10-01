// Wires up every overlay, then delegates clicks from the header, the menu and the agent cards via
// `document`, so this works even if the cards are rendered after initKaptanUI() runs.

import './overlay-base.css';
import './demo-drawer.css';
import './service-modal.css';
import './menu-drawer.css';
import './modals.css';
import { AGENTS } from '../data/agents.js';
import { createAboutModal } from './about-modal.js';
import { createDemoDrawer } from './demo-drawer.js';
import { createLegalModal } from './legal-modal.js';
import { createMenuDrawer } from './menu-drawer.js';
import { createServiceModal } from './service-modal.js';

// `open-booking` / `book-now` are the salon-era names of the header CTA; they still open the demo
// drawer so an older trigger (e.g. the hero while it is being rebuilt) never dead-ends.
const DEMO_ACTIONS = new Set(['open-demo', 'open-booking', 'book-now']);

function createOverlays({ mount, agents, site, lockScroll, unlockScroll, scrollTo }) {
  const aboutModal = createAboutModal({ mount, site, lockScroll, unlockScroll, scrollTo });
  const legalModal = createLegalModal({ mount, lockScroll, unlockScroll });
  const demoDrawer = createDemoDrawer({ mount, lockScroll, unlockScroll });
  const menuDrawer = createMenuDrawer({ mount, site, lockScroll, unlockScroll, scrollTo, openDemo: () => demoDrawer.open() });
  const agentModal = createServiceModal({ mount, agents, lockScroll, unlockScroll, scrollTo });
  return { aboutModal, legalModal, demoDrawer, menuDrawer, agentModal };
}

// An overlay opened from inside another overlay's panel stacks on top instead of closing its parent.
function stackOptionsFor(actionEl) {
  return actionEl.closest('.overlay__panel') ? { stack: true } : undefined;
}

/** Maps a `data-action` to the overlay it opens (null for unknown actions). */
export function overlayForAction(action, { menuDrawer, demoDrawer, aboutModal, legalModal }) {
  if (action === 'open-menu') return menuDrawer;
  if (DEMO_ACTIONS.has(action)) return demoDrawer;
  if (action === 'open-about') return aboutModal;
  if (action === 'open-legal') return legalModal;
  return null;
}

/**
 * @param {{
 *   agents?: ReadonlyArray<object>, site: object,
 *   lockScroll?: Function, unlockScroll?: Function, scrollTo?: Function,
 * }} options
 * @returns {{destroy: () => void}}
 */
export function initKaptanUI({ agents = AGENTS, site, lockScroll = () => {}, unlockScroll = () => {}, scrollTo = () => {} }) {
  const mount = document.getElementById('overlays');
  const overlays = createOverlays({ mount, agents, site, lockScroll, unlockScroll, scrollTo });

  function handleClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      overlayForAction(actionEl.dataset.action, overlays)?.open(actionEl, stackOptionsFor(actionEl));
      return;
    }
    const agentEl = event.target.closest('[data-service-id]');
    if (agentEl) overlays.agentModal.open(agentEl.dataset.serviceId, agentEl);
  }

  document.addEventListener('click', handleClick);

  return {
    destroy() {
      document.removeEventListener('click', handleClick);
      overlays.agentModal.destroy();
    },
  };
}
