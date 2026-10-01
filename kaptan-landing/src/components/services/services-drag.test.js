import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDragGesture } from './services-drag.js';

function pointer(type, target, { x = 0, pointerType = 'mouse', button = 0 } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
  return event;
}

function click(target) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('createDragGesture', () => {
  let pin;
  let card;
  let onDrag;
  let destroy;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div data-pin><button data-card>Kart</button></div>';
    pin = document.querySelector('[data-pin]');
    card = document.querySelector('[data-card]');
    onDrag = vi.fn();
    destroy = createDragGesture({ pin, onStart: () => 100, onDrag, threshold: 6 });
  });

  afterEach(() => {
    destroy();
    vi.useRealTimers();
  });

  it('ignores moves below the threshold and lets the click through', () => {
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 14 });
    pointer('pointerup', window, { x: 14 });
    expect(onDrag).not.toHaveBeenCalled();
    expect(click(card).defaultPrevented).toBe(false);
  });

  it('reports dx with the start context once past the threshold', () => {
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 40 });
    expect(onDrag).toHaveBeenCalledWith(30, 100);
    expect(pin.classList.contains('is-dragging')).toBe(true);
  });

  it('swallows only the click that ends a drag', () => {
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 60 });
    pointer('pointerup', window, { x: 60 });
    expect(pin.classList.contains('is-dragging')).toBe(false);
    expect(click(card).defaultPrevented).toBe(true);
    expect(click(card).defaultPrevented).toBe(false);
  });

  it('clears the suppression one task after pointerup when no click follows', () => {
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 60 });
    pointer('pointerup', window, { x: 60 });
    vi.runAllTimers();
    expect(click(card).defaultPrevented).toBe(false);
  });

  it('clears the suppression on the next pointerdown', () => {
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 60 });
    pointer('pointerup', window, { x: 60 });
    pointer('pointerdown', card, { x: 10 });
    pointer('pointerup', window, { x: 10 });
    expect(click(card).defaultPrevented).toBe(false);
  });

  it('ends the drag on pointercancel without swallowing clicks', () => {
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 60 });
    pointer('pointercancel', window);
    expect(pin.classList.contains('is-dragging')).toBe(false);
    pointer('pointermove', window, { x: 90 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    expect(click(card).defaultPrevented).toBe(false);
  });

  it('ignores touch, secondary buttons and vetoed starts', () => {
    pointer('pointerdown', card, { x: 10, pointerType: 'touch' });
    pointer('pointerdown', card, { x: 10, button: 2 });
    pointer('pointermove', window, { x: 60 });
    expect(onDrag).not.toHaveBeenCalled();

    destroy();
    destroy = createDragGesture({ pin, canStart: () => false, onDrag });
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 60 });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it('prevents native image drag and removes listeners on destroy', () => {
    const dragStart = new Event('dragstart', { cancelable: true, bubbles: true });
    card.dispatchEvent(dragStart);
    expect(dragStart.defaultPrevented).toBe(true);
    destroy();
    pointer('pointerdown', card, { x: 10 });
    pointer('pointermove', window, { x: 60 });
    expect(onDrag).not.toHaveBeenCalled();
  });
});
