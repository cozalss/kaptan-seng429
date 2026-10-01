import { describe, expect, it, vi } from 'vitest';
import { isFirstVisit, playIntro, prefersSaveData, shouldPlayCinematic } from './aperture.js';

function memory(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}

describe('shouldPlayCinematic', () => {
  it('plays only on a first visit with full motion and no data saving', () => {
    expect(shouldPlayCinematic({ reduced: false, firstVisit: true, saveData: false })).toBe(true);
  });

  it.each([
    ['reduced motion', { reduced: true, firstVisit: true, saveData: false }],
    ['a repeat visit', { reduced: false, firstVisit: false, saveData: false }],
    ['save-data', { reduced: false, firstVisit: true, saveData: true }],
  ])('skips the intro under %s', (_label, input) => {
    expect(shouldPlayCinematic(input)).toBe(false);
  });
});

describe('prefersSaveData', () => {
  it('reads navigator.connection.saveData and defaults to false', () => {
    expect(prefersSaveData({ connection: { saveData: true } })).toBe(true);
    expect(prefersSaveData({ connection: { saveData: false } })).toBe(false);
    expect(prefersSaveData({})).toBe(false);
    expect(prefersSaveData(undefined)).toBe(false);
  });
});

describe('isFirstVisit', () => {
  it('is true until the intro has been marked as seen in this session', () => {
    expect(isFirstVisit(memory())).toBe(true);
    expect(isFirstVisit(memory({ 'kaptan:intro-seen': '1' }))).toBe(false);
  });
});

describe('playIntro (quick path)', () => {
  it('hides the loader, opens the page and starts the hero intro when not cinematic', async () => {
    document.body.innerHTML = '<div data-loader></div>';
    const loader = document.querySelector('[data-loader]');
    const onOpen = vi.fn();
    const heroIntro = vi.fn();
    await playIntro({ loader, stage: null, header: null, heroIntro, cinematic: false, onOpen });
    expect(loader.classList.contains('is-done')).toBe(true);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(heroIntro).toHaveBeenCalledOnce();
  });
});
