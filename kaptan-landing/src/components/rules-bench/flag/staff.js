// Phones carry up to eight small pennants (four beside the titles, four in the appendix row). Only
// the ones near the viewport get a live cloth canvas, and never more than MAX_LIVE at once; every
// other one is the static print. A pennant swaps print → cloth just before it scrolls in (so a hoist
// fired as its article arrives is still animated) and back to print once it has left.

import { staffLayout } from './halyard.js';
import { createStage } from './stage.js';

export const MAX_LIVE = 2;
const AHEAD = '30% 0px';

const live = new Set();
const waiting = new Set(); // on screen, but every live slot is taken
let observer = null;
let watched = 0;

function promote() {
  for (const staff of waiting) {
    if (live.size >= MAX_LIVE) return;
    waiting.delete(staff);
    staff.goLive();
  }
}

function onEntries(entries) {
  entries.forEach(({ target, isIntersecting }) => {
    const staff = target.flagStaff;
    if (!staff) return;
    if (isIntersecting) {
      if (live.size < MAX_LIVE) staff.goLive();
      else waiting.add(staff);
    } else {
      waiting.delete(staff);
      staff.goStill();
    }
  });
  promote();
}

function watch(host) {
  const win = host.ownerDocument.defaultView;
  if (!observer) observer = new win.IntersectionObserver(onEntries, { rootMargin: AHEAD });
  observer.observe(host);
  watched += 1;
}

function unwatch(host) {
  if (!observer) return;
  observer.unobserve(host);
  watched -= 1;
  if (watched <= 0) {
    observer.disconnect();
    observer = null;
    watched = 0;
  }
}

/**
 * A staff pennant that is a cloth canvas only while it holds one of the shared live slots.
 * @param {{ host: HTMLElement, id: string, still: (o: object) => { setState: Function, destroy: Function } }} o
 */
export function createStaff({ host, id, still: makeStill }) {
  let state = 'down';
  let view = null;
  let isLive = false;

  const staff = {
    goLive() {
      if (isLive) return;
      if (view) view.destroy();
      isLive = true;
      live.add(staff);
      view = createStage({
        host, ids: [id], layout: staffLayout, grid: [10, 6], weight: 0.72, spacing: 2.7, pointer: false, className: 'flag-canvas',
      });
      view.setState(id, state); // the stage is not yet on screen: it settles there at once
    },
    goStill() {
      if (!isLive && view) return;
      if (view) view.destroy();
      isLive = false;
      live.delete(staff);
      view = makeStill({ host, ids: [id], layout: staffLayout, className: 'flag-still--staff' });
      view.setState(id, state);
      promote();
    },
  };

  host.flagStaff = staff;
  staff.goStill();
  watch(host);

  return {
    setState(_id, next) {
      view.setState(id, next); // validates
      state = next;
    },
    destroy() {
      unwatch(host);
      waiting.delete(staff);
      live.delete(staff);
      if (view) view.destroy();
      view = null;
      delete host.flagStaff;
      promote();
    },
  };
}

/** How many staff pennants hold a live canvas (for tests and QA). */
export function liveStaffs() {
  return live.size;
}
