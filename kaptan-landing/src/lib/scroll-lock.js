// Reason-counted scroll lock. Several parts of the page may hold scroll at once (the intro, an
// overlay); scrolling resumes only when every reason has been released. Counting per reason also
// covers one overlay replacing another (lock, lock, unlock → still locked).

function assertReason(reason) {
  if (typeof reason !== 'string' || reason.length === 0) {
    throw new TypeError('scroll lock: reason must be a non-empty string');
  }
}

/**
 * @param {{onLock: () => void, onUnlock: () => void}} handlers called on the transitions
 *   unlocked → locked and locked → unlocked only.
 * @returns {{lock: (reason: string) => void, unlock: (reason: string) => void,
 *   release: () => void, isLocked: () => boolean, reasons: () => string[]}}
 */
export function createScrollLock({ onLock, onUnlock }) {
  const counts = new Map();

  return {
    lock(reason) {
      assertReason(reason);
      const wasLocked = counts.size > 0;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
      if (!wasLocked) onLock();
    },
    unlock(reason) {
      assertReason(reason);
      const count = counts.get(reason);
      if (!count) return;
      if (count > 1) counts.set(reason, count - 1);
      else counts.delete(reason);
      if (counts.size === 0) onUnlock();
    },
    /** Drops every reason (fatal fallback: never leave the page unscrollable). */
    release() {
      if (counts.size === 0) return;
      counts.clear();
      onUnlock();
    },
    isLocked: () => counts.size > 0,
    reasons: () => [...counts.keys()],
  };
}
