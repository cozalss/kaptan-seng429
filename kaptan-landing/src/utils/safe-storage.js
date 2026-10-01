// window.localStorage can throw synchronously just from being *accessed*
// (Safari/Firefox "block all cookies", some corporate policies, sandboxed
// iframes) — before any try/catch around a call even runs. It can also be
// accessible but throw on every write (private-mode quirks, quota policies).
// safeStorage() always returns *something* Storage-shaped: the real
// localStorage when it actually works, otherwise an in-memory fallback that
// is lost on reload but never throws or crashes boot.

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    get length() {
      return map.size;
    },
  };
}

const PROBE_KEY = '__kaptan_storage_probe__';

function canWrite(storage) {
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {'localStorage' | 'sessionStorage'} [kind] which Web Storage area (default localStorage)
 * @returns {Storage} `window[kind]` when it can actually be accessed
 * and written to, otherwise a same-shaped in-memory Storage fallback.
 */
export function safeStorage(kind = 'localStorage') {
  try {
    const storage = kind === 'sessionStorage' ? window.sessionStorage : window.localStorage;
    if (storage && canWrite(storage)) return storage;
  } catch {
    // Accessing the storage area itself threw (SecurityError) — fall through.
  }
  return createMemoryStorage();
}
