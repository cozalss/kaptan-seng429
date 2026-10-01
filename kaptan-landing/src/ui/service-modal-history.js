// URL hash sync for the agent detail: opening it pushes `#ajan-<id>` so the
// browser's Back button closes it, and a deep link (or Forward) opens it. The
// page stays a single document — only the hash changes, via the History API,
// so no `hashchange` scroll jump and no new route.

const HASH_PREFIX = '#ajan-';
const STATE_KEY = 'kaptanAgent';

/** `#ajan-kanit` → `kanit`; anything else (or a malformed escape) → null. */
export function serviceIdFromHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(HASH_PREFIX)) return null;
  try {
    const id = decodeURIComponent(hash.slice(HASH_PREFIX.length));
    return id === '' ? null : id;
  } catch {
    return null;
  }
}

export function hashForService(id) {
  return `${HASH_PREFIX}${encodeURIComponent(id)}`;
}

/**
 * @param {{win?: Window, onRequestOpen: (id: string) => void, onRequestClose: () => void}} options
 * `onRequestOpen` / `onRequestClose` are called when history navigation
 * (Back / Forward) asks for the detail to open or close.
 * @returns {{initialId: () => string|null, opened: (id: string) => void, switched: (id: string) => void, closed: () => void, destroy: () => void}}
 * `opened` / `closed` report UI-driven changes so the URL follows the dialog.
 */
export function createServiceHistory({ win = window, onRequestOpen, onRequestClose }) {
  // The service id of the history entry *we* pushed, while it is the current
  // one — only then may closing step Back (never out of the site).
  let pushedId = null;
  // While the detail is open the browser must not restore a scroll position on Back: the page
  // under it may have moved on purpose (a turn to another agent brings that agent's card into view).
  let heldRestoration = null;
  let releaseTimer = 0;
  const RELEASE_MS = 400;

  function holdScroll() {
    win.clearTimeout?.(releaseTimer);
    if (heldRestoration !== null || !('scrollRestoration' in win.history)) return;
    heldRestoration = win.history.scrollRestoration;
    win.history.scrollRestoration = 'manual';
  }

  function releaseScroll() {
    if (heldRestoration === null) return;
    win.clearTimeout?.(releaseTimer);
    // after the traversal has settled (the restore step runs around popstate)
    const restore = () => {
      if (heldRestoration === null) return;
      win.history.scrollRestoration = heldRestoration;
      heldRestoration = null;
    };
    if (typeof win.setTimeout === 'function') releaseTimer = win.setTimeout(restore, RELEASE_MS);
    else restore();
  }

  const currentId = () => serviceIdFromHash(win.location.hash);
  const stateId = () => win.history.state?.[STATE_KEY] ?? null;

  function opened(id) {
    holdScroll();
    if (currentId() === id) return; // deep link / Forward: the entry is already ours
    win.history.pushState({ [STATE_KEY]: id }, '', hashForService(id));
    pushedId = id;
  }

  /** Another agent on the open detail: the current entry is renamed, never a new one pushed. */
  function switched(id) {
    if (currentId() === id) return;
    const ours = pushedId !== null && stateId() === pushedId;
    win.history.replaceState(ours ? { [STATE_KEY]: id } : win.history.state, '', hashForService(id));
    if (ours) pushedId = id;
  }

  function closed() {
    releaseScroll();
    if (currentId() === null) {
      pushedId = null; // closed by Back: the URL is already clean
      return;
    }
    if (pushedId !== null && stateId() === pushedId) {
      pushedId = null;
      win.history.back();
      return;
    }
    // A deep-linked entry: stepping back would leave the site, so just clean the URL.
    pushedId = null;
    win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}`);
  }

  function handlePopState() {
    const id = currentId();
    pushedId = id !== null && stateId() === id ? id : null;
    if (id === null) onRequestClose();
    else onRequestOpen(id);
  }

  win.addEventListener('popstate', handlePopState);

  return {
    initialId: currentId,
    opened,
    switched,
    closed,
    destroy: () => {
      win.removeEventListener('popstate', handlePopState);
      win.clearTimeout?.(releaseTimer);
      if (heldRestoration !== null) win.history.scrollRestoration = heldRestoration;
      heldRestoration = null;
    },
  };
}

/** Runs `callback` once `#main` is interactive (the intro keeps it `inert` until the page opens). */
export function whenPageInteractive(callback, doc = document) {
  const main = doc.getElementById('main');
  if (!main || !main.hasAttribute('inert')) {
    callback();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (main.hasAttribute('inert')) return;
    observer.disconnect();
    callback();
  });
  observer.observe(main, { attributes: true, attributeFilter: ['inert'] });
  return () => observer.disconnect();
}
