import { describe, expect, test } from 'vitest';
import { createPageTurn, leafFrame } from './page-turn.js';

describe('leafFrame', () => {
  test('lies closed on the right page at 0 and flat on the left at 1, unshaded', () => {
    expect(leafFrame(0)).toMatchObject({ angle: 180, back: 0, front: 0 });
    expect(leafFrame(1)).toMatchObject({ angle: 0, back: 0, front: 0 });
    expect(leafFrame(0).cast).toBeCloseTo(0, 6);
  });

  test('shades the face that is up while the leaf stands, most at the vertical', () => {
    const rising = leafFrame(0.25);
    expect(rising.angle).toBe(135);
    expect(rising.back).toBeGreaterThan(0);
    expect(rising.front).toBe(0);
    const falling = leafFrame(0.75);
    expect(falling.front).toBeCloseTo(rising.back, 6);
    expect(falling.back).toBe(0);
    expect(leafFrame(0.5).cast).toBeGreaterThan(rising.cast);
  });

  test('clamps progress outside 0..1', () => {
    expect(leafFrame(-2)).toEqual(leafFrame(0));
    expect(leafFrame(3)).toEqual(leafFrame(1));
  });
});

describe('createPageTurn', () => {
  test('starts closed, follows its progress and clears everything on destroy', () => {
    const book = document.createElement('div');
    const leaf = document.createElement('div');
    const turn = createPageTurn({ leaf, book });
    expect(leaf.style.transform).toBe('rotateY(180.00deg)');
    expect(book.classList.contains('is-closed')).toBe(true);

    turn.state.progress = 0.5;
    turn.apply();
    expect(leaf.style.transform).toBe('rotateY(90.00deg)');
    expect(book.classList.contains('is-closed')).toBe(false);
    expect(Number(book.style.getPropertyValue('--shade-cast'))).toBeGreaterThan(0);

    turn.destroy();
    expect(leaf.style.transform).toBe('');
    expect(book.style.getPropertyValue('--shade-front')).toBe('');
    expect(book.classList.contains('is-closed')).toBe(false);
  });
});
