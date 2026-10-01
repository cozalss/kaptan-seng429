import { beforeEach, describe, expect, it } from 'vitest';
import { COUNTER_UNITS, MODES, createCompassView } from './view.js';

function mount() {
  document.body.innerHTML = `
    <section id="pusula" data-pusula="static">
      <figure data-pusula-visual>
        <p><span data-pusula-count>1</span><span data-pusula-unit></span></p>
        <ol><li data-pusula-step>Gürültü</li><li data-pusula-step>Kanıt</li><li data-pusula-step>Onay</li><li data-pusula-step>Yön</li></ol>
        <ol><li data-pusula-act></li><li data-pusula-act></li><li data-pusula-act></li><li data-pusula-act></li></ol>
        <ul><li data-pusula-label></li><li data-pusula-label></li><li data-pusula-label></li></ul>
      </figure>
      <h2 data-pusula-title>350 bildirim.</h2>
      <p data-pusula-tag></p>
      <div data-pusula-dock></div>
      <div data-pusula-rail></div>
    </section>`;
  return document.querySelector('#pusula');
}

describe('createCompassView', () => {
  let section;
  let view;
  beforeEach(() => {
    section = mount();
    view = createCompassView(section);
  });

  it('reads and writes the mode flag', () => {
    expect(view.mode).toBe(MODES.STATIC);
    view.setMode(MODES.LIVE);
    expect(section.dataset.pusula).toBe('live');
    delete section.dataset.pusula;
    expect(view.mode).toBe(MODES.STATIC);
    expect(view.phases).toBe(4);
  });

  it('publishes progress, marks the active act and names the counter unit', () => {
    view.setProgress(0.6);
    expect(section.style.getPropertyValue('--pusula-progress')).toBe('0.6000');
    expect(section.dataset.pusulaAct).toBe('onay');
    const acts = [...section.querySelectorAll('[data-pusula-act]')];
    expect(acts.map((s) => s.dataset.active)).toEqual(['false', 'false', 'true', 'false']);
    const steps = [...section.querySelectorAll('[data-pusula-step]')];
    expect(steps.map((s) => s.dataset.active)).toEqual(['false', 'false', 'true', 'false']);
    expect(steps.map((s) => s.dataset.done)).toEqual(['true', 'true', 'false', 'false']);
    expect(section.querySelector('[data-pusula-unit]').textContent).toBe(COUNTER_UNITS[2]);
    view.setProgress(0.61);
    expect(steps[2].dataset.active).toBe('true');
    view.setProgress(0);
    expect(steps[0].dataset.active).toBe('true');
    expect(section.querySelector('[data-pusula-unit]').textContent).toBe('bildirim · bugün');
    view.setProgress(1);
    expect(section.dataset.pusulaAct).toBe('yon');
    expect(section.querySelector('[data-pusula-unit]').textContent).toBe('yön · kanıtın gösterdiği');
  });

  it('writes the counter only when the number changes', () => {
    const count = section.querySelector('[data-pusula-count]');
    view.setCount(350);
    expect(count.textContent).toBe('350');
    count.textContent = 'x';
    view.setCount(350.2);
    expect(count.textContent).toBe('x');
    view.setCount(42);
    expect(count.textContent).toBe('42');
    view.setCount(-3);
    expect(count.textContent).toBe('0');
  });

  it('hangs the ring labels on the anchor points, writing only what changed', () => {
    const labels = [...section.querySelectorAll('[data-pusula-label]')];
    view.setLabels([
      { x: 10.4, y: 20.6, alpha: 1 },
      { x: 0, y: 0, alpha: 0 },
      { x: 5, y: 5, alpha: 0.5 },
    ]);
    expect(labels[0].style.transform).toBe('translate3d(10px, 21px, 0)');
    expect(labels[0].style.visibility).toBe('visible');
    expect(labels[1].style.visibility).toBe('hidden');
    expect(labels[2].style.opacity).toBe('0.5');
    labels[0].style.removeProperty('transform');
    view.setLabels([{ x: 10.2, y: 20.7, alpha: 1 }]); // same pixel: no write
    expect(labels[0].style.transform).toBe('');
    view.setLabels([{ x: 30, y: 20.7, alpha: 1 }]);
    expect(labels[0].style.transform).toBe('translate3d(30px, 21px, 0)');
  });

  it('mounts one decorative canvas into the visual and removes it again', () => {
    const first = document.createElement('canvas');
    view.mountCanvas(first);
    expect(view.visual.firstElementChild).toBe(first);
    expect(first.getAttribute('aria-hidden')).toBe('true');
    view.mountCanvas(document.createElement('canvas'));
    expect(section.querySelectorAll('canvas')).toHaveLength(1);
    view.unmountCanvas();
    expect(section.querySelector('canvas')).toBeNull();
    view.mountCanvas(null);
    expect(section.querySelector('canvas')).toBeNull();
  });

  it('hangs the tag and docks the caption from the renderer anchors', () => {
    const anchors = {
      foot: { x: 300, y: 200 },
      rings: [{ x: 100, y: 100 }, { x: 120, y: 150 }, { x: 140, y: 200 }],
      plate: { x: 300, y: 200, w: 100, h: 140 },
      compass: { x: 500, y: 200, r: 80 },
    };
    const pose = { focus: 0, dock: { sieve: 0, plate: 0, compass: 0 } };
    view.place(anchors, pose);
    const tag = section.querySelector('[data-pusula-tag]');
    const dock = section.querySelector('[data-pusula-dock]');
    expect(tag.style.transform).toMatch(/^translate3d\(-?\d+px, -?\d+px, 0\)$/);
    expect(dock.style.transform.startsWith('translate3d(')).toBe(true);
    expect(tag.style.getPropertyValue('--string')).toMatch(/px$/);
    dock.style.transform = '';
    view.place(anchors, pose, { dock: false });
    expect(dock.style.transform).toBe('');
    view.remeasure();
    expect(() => view.place(anchors, pose)).not.toThrow();
  });

  it('publishes the exit for the CSS, only when it changes', () => {
    view.setExit(0.25);
    expect(section.style.getPropertyValue('--pusula-exit')).toBe('0.250');
    section.style.removeProperty('--pusula-exit');
    view.setExit(0.2501);
    expect(section.style.getPropertyValue('--pusula-exit')).toBe('');
  });

  it('tolerates a section without the optional parts', () => {
    document.body.innerHTML = '<section></section>';
    const bare = createCompassView(document.querySelector('section'));
    expect(() => {
      bare.setProgress(0.2);
      bare.setCount(7);
      bare.mountCanvas(document.createElement('canvas'));
      bare.place({ foot: { x: 0, y: 0 }, rings: [], plate: { x: 0, y: 0, w: 0, h: 0 }, compass: { x: 0, y: 0, r: 0 } }, { focus: 0, dock: { sieve: 0, plate: 0, compass: 0 } });
      bare.setExit(1);
    }).not.toThrow();
  });
});
