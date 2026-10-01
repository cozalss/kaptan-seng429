import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceHistory, hashForService, serviceIdFromHash, whenPageInteractive } from './service-modal-history.js';

describe('serviceIdFromHash / hashForService', () => {
  it('reads the agent id from a #ajan- hash', () => {
    expect(serviceIdFromHash('#ajan-siniflandirici')).toBe('siniflandirici');
  });

  it('returns null for other hashes, an empty id, a malformed escape or a non-string', () => {
    expect(serviceIdFromHash('#ajanlar')).toBeNull();
    expect(serviceIdFromHash('#ajan-')).toBeNull();
    expect(serviceIdFromHash('#ajan-%E0%A4%A')).toBeNull();
    expect(serviceIdFromHash('')).toBeNull();
    expect(serviceIdFromHash(undefined)).toBeNull();
  });

  it('round-trips ids through the hash, escaping unsafe characters', () => {
    expect(hashForService('risk-kapisi')).toBe('#ajan-risk-kapisi');
    expect(serviceIdFromHash(hashForService('a b/ç'))).toBe('a b/ç');
  });
});

/** A minimal History + Location double whose back() fires popstate like a browser. */
function createFakeWindow(initialHash = '') {
  const listeners = new Set();
  const entries = [{ state: null, hash: initialHash }];
  let index = 0;
  const location = {
    pathname: '/',
    search: '?q=1',
    get hash() {
      return entries[index].hash;
    },
  };
  const hashOf = (url) => (url.includes('#') ? url.slice(url.indexOf('#')) : '');
  const firePop = () => listeners.forEach((listener) => listener(new Event('popstate')));
  const history = {
    get state() {
      return entries[index].state;
    },
    pushState: vi.fn((state, _title, url) => {
      entries.splice(index + 1);
      entries.push({ state, hash: hashOf(url) });
      index += 1;
    }),
    replaceState: vi.fn((state, _title, url) => {
      entries[index] = { state, hash: hashOf(url) };
    }),
    back: vi.fn(() => {
      index = Math.max(0, index - 1);
      firePop();
    }),
    forward: () => {
      index = Math.min(entries.length - 1, index + 1);
      firePop();
    },
  };
  return {
    location,
    history,
    entries,
    addEventListener: (type, listener) => type === 'popstate' && listeners.add(listener),
    removeEventListener: (type, listener) => type === 'popstate' && listeners.delete(listener),
    listenerCount: () => listeners.size,
  };
}

describe('createServiceHistory', () => {
  let win;
  let onRequestOpen;
  let onRequestClose;
  let history;

  function start(initialHash) {
    win = createFakeWindow(initialHash);
    history = createServiceHistory({ win, onRequestOpen, onRequestClose });
  }

  beforeEach(() => {
    onRequestOpen = vi.fn();
    onRequestClose = vi.fn();
  });

  it('exposes the deep-linked service id', () => {
    start('#ajan-kanit');
    expect(history.initialId()).toBe('kanit');
  });

  it('pushes #ajan-<id> on open, and steps Back on close', () => {
    start('');
    history.opened('risk-kapisi');
    expect(win.history.pushState).toHaveBeenCalledWith({ kaptanAgent: 'risk-kapisi' }, '', '#ajan-risk-kapisi');
    expect(win.location.hash).toBe('#ajan-risk-kapisi');

    history.closed();
    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(win.location.hash).toBe('');
    // The popstate that back() fires finds nothing to open.
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onRequestOpen).not.toHaveBeenCalled();
  });

  it('never pushes again when the entry already names the service (deep link, Forward)', () => {
    start('#ajan-risk-kapisi');
    history.opened('risk-kapisi');
    expect(win.history.pushState).not.toHaveBeenCalled();
  });

  it('closing a deep-linked detail cleans the URL in place instead of leaving the site', () => {
    start('#ajan-risk-kapisi');
    history.opened('risk-kapisi');
    history.closed();
    expect(win.history.back).not.toHaveBeenCalled();
    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/?q=1');
    expect(win.location.hash).toBe('');
  });

  it('closing after Back already cleaned the URL does nothing', () => {
    start('');
    history.opened('risk-kapisi');
    win.history.back(); // the user pressed Back
    history.closed(); // the dialog reports its close afterwards
    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it('Back asks for a close and Forward asks to reopen, which then closes with Back again', () => {
    start('');
    history.opened('risk-kapisi');
    win.history.back();
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    win.history.forward();
    expect(onRequestOpen).toHaveBeenCalledWith('risk-kapisi');
    history.opened('risk-kapisi');
    expect(win.history.pushState).toHaveBeenCalledTimes(1);

    history.closed();
    expect(win.history.back).toHaveBeenCalledTimes(2);
  });

  it('switching services from one pushed entry to another pushes a new entry', () => {
    start('');
    history.opened('a');
    history.opened('b');
    expect(win.entries.map((e) => e.hash)).toEqual(['', '#ajan-a', '#ajan-b']);
  });

  it('turning to another agent inside the detail replaces the entry, so Back still closes it', () => {
    start('');
    history.opened('a');
    history.switched('b');
    history.switched('c');
    expect(win.entries.map((e) => e.hash)).toEqual(['', '#ajan-c']);
    expect(win.history.state).toEqual({ kaptanAgent: 'c' });
    history.closed();
    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(win.location.hash).toBe('');
  });

  it('turning inside a deep-linked detail renames it in place and closes without leaving the site', () => {
    start('#ajan-a');
    history.opened('a');
    history.switched('b');
    expect(win.location.hash).toBe('#ajan-b');
    expect(win.history.pushState).not.toHaveBeenCalled();
    history.closed();
    expect(win.history.back).not.toHaveBeenCalled();
    expect(win.location.hash).toBe('');
  });

  it('a turn to the agent already in the URL changes nothing', () => {
    start('');
    history.opened('a');
    win.history.replaceState.mockClear();
    history.switched('a');
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it('holds the browser scroll restoration while the detail is open, and gives it back after', () => {
    vi.useFakeTimers();
    start('');
    win.history.scrollRestoration = 'auto';
    win.setTimeout = setTimeout;
    win.clearTimeout = clearTimeout;
    history.opened('a');
    expect(win.history.scrollRestoration).toBe('manual');
    history.closed();
    expect(win.history.scrollRestoration).toBe('manual'); // the Back traversal must not restore
    vi.advanceTimersByTime(500);
    expect(win.history.scrollRestoration).toBe('auto');
    vi.useRealTimers();
  });

  it('destroy() stops listening for popstate', () => {
    start('');
    expect(win.listenerCount()).toBe(1);
    history.destroy();
    expect(win.listenerCount()).toBe(0);
  });

  it('defaults to the real window', () => {
    window.history.replaceState(null, '', '/');
    const real = createServiceHistory({ onRequestOpen, onRequestClose });
    real.opened('x');
    expect(window.location.hash).toBe('#ajan-x');
    real.destroy();
    window.history.replaceState(null, '', '/');
  });
});

describe('whenPageInteractive', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('runs at once when there is no #main or it is not inert', () => {
    const callback = vi.fn();
    whenPageInteractive(callback);
    expect(callback).toHaveBeenCalledTimes(1);

    document.body.innerHTML = '<main id="main"></main>';
    whenPageInteractive(callback);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('waits for the intro to lift inert from #main', async () => {
    document.body.innerHTML = '<main id="main" inert></main>';
    const main = document.getElementById('main');
    const callback = vi.fn();
    whenPageInteractive(callback);

    main.setAttribute('data-x', '1');
    main.setAttribute('inert', '');
    await Promise.resolve();
    expect(callback).not.toHaveBeenCalled();

    main.removeAttribute('inert');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled before the page opens', async () => {
    document.body.innerHTML = '<main id="main" inert></main>';
    const callback = vi.fn();
    const cancel = whenPageInteractive(callback);
    cancel();
    document.getElementById('main').removeAttribute('inert');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).not.toHaveBeenCalled();
  });
});
