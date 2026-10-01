import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSwitch } from './switch.js';

const html = readFileSync(`${path.resolve(process.cwd())}/index.html`, 'utf8');
const block = html.match(/<!-- OLAYLAR:START[\s\S]*?<!-- OLAYLAR:END -->/)[0];

describe('createSwitch', () => {
  let section;
  beforeEach(() => {
    document.body.innerHTML = block;
    section = document.getElementById('olaylar');
  });
  afterEach(() => document.body.replaceChildren());

  const toggles = () => [...section.querySelectorAll('.article__toggle')];
  const shown = () => [...section.querySelectorAll('.rules__slot .is-active')].map((host) => host.dataset.instrument);
  const leak = () => section.querySelector('[data-show="leak"]');

  it('turns each title into a pressed/unpressed button that controls the shared slot', () => {
    createSwitch({ section });
    const buttons = toggles();
    expect(buttons).toHaveLength(4);
    expect(buttons[0].closest('h3')).not.toBeNull();
    expect(buttons[0].type).toBe('button');
    expect(buttons[0].textContent).toBe('E1 Pay geri alım');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    buttons.forEach((b) => expect(b.getAttribute('aria-controls')).toBe('rules-slot'));
    expect(leak().hidden).toBe(false);
  });

  it('shows exactly one instrument; the others are hidden and inert', () => {
    const picker = createSwitch({ section });
    expect(shown()).toEqual(['E1']);
    picker.select('E3');
    expect(shown()).toEqual(['E3']);
    expect(picker.current()).toBe('E3');
    expect(section.querySelector('[data-instrument="E1"]').inert).toBe(true);
    expect(section.querySelector('[data-instrument="E3"]').inert).toBe(false);
    expect(section.querySelector('#madde-e3').classList.contains('is-active')).toBe(true);
  });

  it('puts the leak in the same slot from its text button', () => {
    const onSelect = vi.fn();
    createSwitch({ section, onSelect });
    leak().click();
    expect(shown()).toEqual(['leak']);
    expect(leak().getAttribute('aria-pressed')).toBe('true');
    expect(toggles().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith('leak', { user: true });
  });

  it('tells user picks from programmatic ones and ignores repeats and unknown ids', () => {
    const onSelect = vi.fn();
    const picker = createSwitch({ section, onSelect });
    toggles()[1].click();
    expect(onSelect).toHaveBeenLastCalledWith('E2', { user: true });
    picker.select('E4');
    expect(onSelect).toHaveBeenLastCalledWith('E4', { user: false });
    picker.select('E4');
    picker.select('E9');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('moves focus between titles with the arrow keys, Home and End', () => {
    createSwitch({ section });
    const buttons = toggles();
    const press = (button, key) => button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    buttons[0].focus();
    press(buttons[0], 'ArrowDown');
    expect(document.activeElement).toBe(buttons[1]);
    press(buttons[1], 'ArrowUp');
    press(buttons[0], 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[3]);
    press(buttons[3], 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    press(buttons[0], 'End');
    expect(document.activeElement).toBe(buttons[3]);
    press(buttons[3], 'x');
    expect(document.activeElement).toBe(buttons[3]);
  });

  it('restores the static markup on destroy', () => {
    const picker = createSwitch({ section });
    picker.select('leak');
    picker.destroy();
    expect(toggles()).toHaveLength(0);
    expect(section.querySelector('#madde-e2 .article__name').textContent).toBe('E2 Yönetici ya da ana ortak alımı');
    expect([...section.querySelectorAll('.article.is-active')].map((row) => row.dataset.rule)).toEqual(['E1']);
    expect(shown()).toEqual([]);
    expect(leak().hidden).toBe(true);
  });
});
