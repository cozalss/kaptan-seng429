import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showState = { fail: false, created: [] };
vi.mock('./show.js', () => ({
  createShow: vi.fn((options) => {
    if (showState.fail) throw new Error('no show');
    const show = { options, goTo: vi.fn(), destroy: vi.fn() };
    showState.created.push(show);
    return show;
  }),
}));

const { initRulesBench } = await import('./index.js');

const html = readFileSync(`${path.resolve(process.cwd())}/index.html`, 'utf8');
const block = html.match(/<!-- OLAYLAR:START[\s\S]*?<!-- OLAYLAR:END -->/)[0];
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('initRulesBench', () => {
  let section;
  beforeEach(() => {
    showState.fail = false;
    showState.created = [];
    document.body.innerHTML = block;
    section = document.getElementById('olaylar');
    window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => document.body.replaceChildren());

  it('pin: mounts the posed bench and hands it to the show; a pick scrolls through the show', async () => {
    const scroller = { scrollToY: vi.fn() };
    const bench = initRulesBench({ section, pin: true, scroller });
    await flush();
    expect(section.dataset.bench).toBe('on');
    expect(showState.created).toHaveLength(1);
    expect(showState.created[0].options.scroller).toBe(scroller);
    section.querySelector('#madde-e3 .article__toggle').click();
    expect(showState.created[0].goTo).toHaveBeenCalledWith('E3');
    bench.destroy();
    expect(showState.created[0].destroy).toHaveBeenCalled();
    expect(section.dataset.bench).toBeUndefined();
  });

  it('falls back to the touring bench when the show cannot start', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    showState.fail = true;
    const bench = initRulesBench({ section, pin: true });
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(section.querySelectorAll('.article__toggle')).toHaveLength(4);
    bench.destroy();
    warn.mockRestore();
  });

  it('without the pin there is no show at all', async () => {
    const bench = initRulesBench({ section });
    await flush();
    expect(showState.created).toHaveLength(0);
    expect(section.querySelectorAll('.article__toggle')).toHaveLength(4);
    bench.destroy();
  });

  it('is a no-op without a section', () => {
    expect(() => initRulesBench({ section: null }).destroy()).not.toThrow();
  });
});
