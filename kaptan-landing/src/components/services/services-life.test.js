import { describe, expect, test } from 'vitest';
import { initServicesLife, measurePanelCentres } from './services-life.js';

function fakeWin() {
  const observers = [];
  return {
    observers,
    IntersectionObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.targets = [];
        observers.push(this);
      }

      observe(el) {
        this.targets.push(el);
      }

      disconnect() {
        this.targets = [];
      }
    },
  };
}

describe('initServicesLife', () => {
  test('the loops run only while the chapter is on screen, and stop for good on undo', () => {
    const section = document.createElement('section');
    const win = fakeWin();
    const undo = initServicesLife({ section, win });
    const [io] = win.observers;
    expect(io.targets).toEqual([section]);
    io.cb([{ isIntersecting: true }]);
    expect(section.classList.contains('is-live')).toBe(true);
    io.cb([{ isIntersecting: false }]);
    expect(section.classList.contains('is-live')).toBe(false);
    io.cb([{ isIntersecting: true }]);
    undo();
    expect(section.classList.contains('is-live')).toBe(false);
    expect(io.targets).toEqual([]);
  });

  test('without IntersectionObserver nothing runs (the loops stay paused)', () => {
    const section = document.createElement('section');
    const undo = initServicesLife({ section, win: {} });
    expect(section.classList.contains('is-live')).toBe(false);
    expect(() => undo()).not.toThrow();
  });
});

describe('measurePanelCentres', () => {
  test('writes each panel centre along the strip', () => {
    const item = document.createElement('li');
    Object.defineProperty(item, 'offsetLeft', { value: 100 });
    Object.defineProperty(item, 'offsetWidth', { value: 461 });
    measurePanelCentres([item]);
    expect(item.style.getPropertyValue('--cx')).toBe('331px');
  });
});
