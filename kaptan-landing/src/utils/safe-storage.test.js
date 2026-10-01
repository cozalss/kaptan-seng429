import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from './safe-storage.js';

describe('safeStorage', () => {
  let originalDescriptor;

  beforeEach(() => {
    originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    window.localStorage.clear();
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('returns the real localStorage when it works normally', () => {
    const storage = safeStorage();
    storage.setItem('a', '1');
    expect(storage.getItem('a')).toBe('1');
    expect(storage).toBe(window.localStorage);
  });

  it('never leaves the storage probe key behind', () => {
    safeStorage();
    expect(window.localStorage.getItem('__kaptan_storage_probe__')).toBeNull();
  });

  it('falls back to an in-memory store when accessing window.localStorage throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });

    const storage = safeStorage();
    expect(() => storage.setItem('x', 'y')).not.toThrow();
    expect(storage.getItem('x')).toBe('y');
  });

  it('falls back to an in-memory store when localStorage exists but every write throws', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {},
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: throwing });

    const storage = safeStorage();
    expect(storage).not.toBe(throwing);
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
  });

  it('the in-memory fallback supports removeItem, clear, key and length', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    const storage = safeStorage();
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    expect(storage.length).toBe(2);
    expect(storage.key(0)).toBe('a');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
    storage.clear();
    expect(storage.length).toBe(0);
  });

  it('each in-memory fallback call returns an independent store', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    const first = safeStorage();
    first.setItem('shared', '1');
    const second = safeStorage();
    expect(second.getItem('shared')).toBeNull();
  });
});

describe('safeStorage("sessionStorage")', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns the real sessionStorage when it works', () => {
    expect(safeStorage('sessionStorage')).toBe(window.sessionStorage);
  });

  it('falls back to memory when sessionStorage throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const storage = safeStorage('sessionStorage');
    expect(storage).not.toBe(window.sessionStorage);
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
  });
});
