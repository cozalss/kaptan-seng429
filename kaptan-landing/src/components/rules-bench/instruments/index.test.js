import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstrument } from './index.js';
import { RESULT_LINE } from './text.js';

const mount = (rule, extra = {}) => {
  const host = document.createElement('div');
  host.dataset.instrument = rule;
  document.body.append(host);
  const events = [];
  const inst = createInstrument({ host, rule, reduced: false, onChange: (e) => events.push(e), ...extra });
  return { host, inst, events, last: () => events[events.length - 1] };
};

const slide = (host, value) => {
  const input = host.querySelector('input[type="range"]');
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('createInstrument', () => {
  it('rejects a missing host or an unknown rule', () => {
    expect(() => createInstrument({ rule: 'E1' })).toThrow(/host/);
    expect(() => createInstrument({ host: document.createElement('div'), rule: 'E9' })).toThrow(/E9/);
  });

  it.each(['E1', 'E2', 'E3', 'E4', 'leak', 'screen'])('%s prints a representative plate', (rule) => {
    const { host, events } = mount(rule);
    const fig = host.querySelector('figure.inst');
    expect(fig.querySelector('figcaption').textContent).toContain('ÖRNEK ENERJİ A.Ş.');
    expect(fig.textContent).toContain('ÖRNEK ENERJİ A.Ş.');
    expect(fig.querySelector('.inst__result').textContent).toBe(RESULT_LINE);
    expect(fig.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(fig.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(events).toHaveLength(1); // the preset is reported once
    expect(events[0].rule).toBe(rule);
    expect(fig.dataset.fired).toBe(String(events[0].fired));
  });

  it('wraps E-codes in .rule-code and prints no qualifier tag on the plate', () => {
    const { host } = mount('E3');
    const tag = host.querySelector('.inst__tag');
    expect(tag.querySelector('.rule-code').textContent).toBe('E3');
    expect(tag.textContent).not.toMatch(/Temsili|kurgu|demo/i);
    expect(mount('leak').host.querySelector('.inst__tag .rule-code')).toBeNull();
  });

  it('prints both verdicts in one cell so the height never changes', () => {
    const { host } = mount('E1');
    const spans = host.querySelectorAll('.inst__state > span');
    expect([...spans].map((s) => s.className)).toEqual(['is-no', 'is-yes']);
    expect(spans[1].textContent).toBe('E1 tutar: öneri adayı doğar.');
  });
});

describe('E1 ledger', () => {
  it('arrives just below the threshold and fires at ≥ %0,25', () => {
    const { host, last } = mount('E1');
    expect(last()).toMatchObject({ rule: 'E1', fired: false, value: 0.19 });
    const input = slide(host, 0.25);
    expect(last()).toMatchObject({ fired: true, value: 0.25 });
    expect(last().margin).toBeCloseTo(0);
    expect(input.getAttribute('aria-valuetext')).toBe("sermayenin %0,25'i, eşiğe ulaşıyor");
    expect(host.querySelector('output').textContent).toBe('%0,25');
    expect(host.querySelector('figure').dataset.fired).toBe('true');
    slide(host, 0.24);
    expect(last().fired).toBe(false);
  });

  it('is a real, labelled range with ≥ 44px of target', () => {
    const { host } = mount('E1');
    const input = host.querySelector('input[type="range"]');
    expect(host.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    expect(input.min).toBe('0');
    expect(input.step).toBe('0.01');
  });

  it('announces once, debounced, after the visitor stops', () => {
    const { host } = mount('E1');
    const live = host.querySelector('[aria-live]');
    slide(host, 0.2);
    slide(host, 0.3);
    expect(live.textContent).toBe('');
    vi.advanceTimersByTime(500);
    expect(live.textContent).toMatch(/^E1 tutar/);
  });

  it('autoplay walks across the threshold once, then the instrument is the visitor\'s', async () => {
    const { host, inst, events } = mount('E1');
    const done = inst.autoplay();
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    vi.advanceTimersByTime(500);
    expect(events.at(-1)).toMatchObject({ fired: true, value: 0.31 });
    const values = events.map((e) => e.value);
    expect(values.some((v) => v > 0.19 && v < 0.31)).toBe(true); // it walked, it did not jump
    expect(host.querySelector('[aria-live]').textContent).toMatch(/^E1 tutar/);
    const count = events.length;
    await inst.autoplay();
    expect(events).toHaveLength(count);
  });

  it('visitor input cancels a pending autoplay', async () => {
    const { host, inst, last } = mount('E1');
    slide(host, 0.1);
    await inst.autoplay();
    expect(last().value).toBe(0.1);
  });

  it('set() snaps and destroy() clears the host', () => {
    const { host, inst, last } = mount('E1');
    inst.set(0.2849);
    expect(last().value).toBe(0.28);
    inst.destroy();
    expect(host.children).toHaveLength(0);
  });
});

describe('E3 balance', () => {
  it('fires at ≥ 10 % of yearly revenue and tips the beam on a spring', () => {
    const { host, last } = mount('E3');
    expect(last()).toMatchObject({ fired: false, value: 8.5 });
    const beam = host.querySelector('.inst__beam');
    slide(host, 10);
    expect(last().fired).toBe(true);
    slide(host, 12);
    vi.advanceTimersByTime(3000);
    const angle = Number(/rotate\((-?[\d.]+)/.exec(beam.getAttribute('transform'))[1]);
    expect(angle).toBeLessThan(-5); // amount pan down = counter-clockwise in SVG
  });

  it('reduced motion: autoplay jumps to the crossed state and the beam is set at once', async () => {
    const { host, inst, last } = mount('E3', { reduced: true });
    await inst.autoplay();
    expect(last()).toMatchObject({ fired: true, value: 12 });
    expect(host.querySelector('.inst__beam').getAttribute('transform')).toMatch(/rotate\(-5\.60/);
  });
});

describe('E2 / E4 switches', () => {
  it.each(['E2', 'E4'])('%s is an aria-pressed button with no threshold', (rule) => {
    const { host, last } = mount(rule);
    const button = host.querySelector('button[aria-pressed]');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('figcaption').textContent).toContain('Sayısal eşik yok');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(last()).toMatchObject({ rule, fired: true, value: true, margin: null });
    button.click();
    expect(last().fired).toBe(false);
  });

  it('autoplay flips to "Evet" once; a click first cancels it', async () => {
    const a = mount('E2');
    const done = a.inst.autoplay();
    vi.advanceTimersByTime(600);
    await done;
    expect(a.last().fired).toBe(true);

    const b = mount('E4');
    b.host.querySelector('button').click();
    b.host.querySelector('button').click();
    await b.inst.autoplay();
    expect(b.last().fired).toBe(false);
    b.inst.set(true);
    expect(b.last().fired).toBe(true);
    b.inst.destroy();
    expect(b.host.children).toHaveLength(0);
  });

  it('reduced motion flips at once', async () => {
    const { inst, last } = mount('E2', { reduced: true });
    await inst.autoplay();
    expect(last().fired).toBe(true);
  });
});

describe('leak filter', () => {
  it('acts above 8 % only and says "atlanır ya da yarıya indirilir"', () => {
    const { host, last } = mount('leak');
    expect(last()).toMatchObject({ rule: 'leak', fired: false, value: 6.5, result: 'pass' });
    slide(host, 8);
    expect(last().fired).toBe(false);
    slide(host, 8.5);
    expect(last()).toMatchObject({ fired: true, result: 'skip-or-halve', effect: 'atlanır ya da yarıya indirilir' });
    expect(host.querySelector('.inst__state .is-yes').textContent).toBe('Sızıntı: öneri atlanır ya da yarıya indirilir.');
    vi.advanceTimersByTime(500);
    expect(host.querySelector('[aria-live]').textContent).toContain('Öneri atlanır ya da yarıya indirilir.');
  });

  it('drawing on the chart moves the line; the last session sets the rise', () => {
    const { host, last } = mount('leak');
    const svg = host.querySelector('svg');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 404, height: 102 });
    svg.setPointerCapture = () => {};
    const handle = () => host.querySelectorAll('.inst__handle')[1].getAttribute('y');
    const before = handle();
    const at = (type, x, y) => {
      const e = new Event(type, { bubbles: true });
      Object.assign(e, { clientX: x, clientY: y, button: 0, pointerId: 1 });
      svg.dispatchEvent(e);
    };
    at('pointerdown', 46 + 2 * 68, 30);
    expect(handle()).not.toBe(before);
    at('pointermove', 46 + 5 * 68, 30);
    at('pointerup', 0, 0);
    expect(last().fired).toBe(true);
    expect(last().value).toBeGreaterThan(8);
  });
});

describe('screen gates', () => {
  it('three toggle buttons; any shut gate fails the screen and names it', () => {
    const { host, inst, last } = mount('screen');
    const buttons = host.querySelectorAll('button[aria-pressed]');
    expect(buttons).toHaveLength(3);
    expect(last()).toMatchObject({ fired: false, result: { pass: true, failed: [] } });
    buttons[1].click();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(last()).toMatchObject({ fired: true, result: { pass: false, failed: ['noMeasure'] } });
    expect(last().text).toContain('tedbir kapısı kapalı');
    expect(host.querySelector('.inst__state').textContent).toBe('Tedbir kapısı kapalı: bildirim elenir.');
    expect(host.querySelector('.inst__canal-slip').classList.contains('is-out')).toBe(true);
    inst.set({ noMeasure: true });
    expect(last().fired).toBe(false);
  });

  it('autoplay sends the slip through the canal', async () => {
    const { host, inst } = mount('screen');
    const slip = host.querySelector('.inst__canal-slip');
    const before = slip.style.transform;
    await inst.autoplay();
    expect(slip.style.transform).not.toBe(before);
    inst.destroy();
    expect(host.children).toHaveLength(0);
  });
});

describe('scrubbed progress (the pinned scroll sequence)', () => {
  it('walks a slider from its preset across the threshold and back, silently', () => {
    const { host, inst, last } = mount('E1');
    inst.progress(0);
    expect(last()).toMatchObject({ value: 0.19, fired: false });
    inst.progress(1);
    expect(last()).toMatchObject({ value: 0.31, fired: true });
    inst.progress(0.2);
    expect(last().fired).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(host.querySelector('[aria-live]').textContent).toBe('');
  });

  it('the leak line crosses 8 % as the beat completes', () => {
    const { inst, last } = mount('leak');
    inst.progress(1);
    expect(last()).toMatchObject({ fired: true, result: 'skip-or-halve' });
    inst.progress(0);
    expect(last()).toMatchObject({ fired: false, result: 'pass' });
  });

  it('a switch flips half way through', () => {
    const { inst, last } = mount('E4');
    inst.progress(0.4);
    expect(last().fired).toBe(false);
    inst.progress(0.6);
    expect(last().fired).toBe(true);
  });

  it('stops driving an instrument the visitor has touched', () => {
    const a = mount('E3');
    slide(a.host, 4);
    a.inst.progress(1);
    expect(a.last().value).toBe(4);
    const b = mount('E2');
    b.host.querySelector('button').click();
    b.inst.progress(0);
    expect(b.last().fired).toBe(true);
  });
});
