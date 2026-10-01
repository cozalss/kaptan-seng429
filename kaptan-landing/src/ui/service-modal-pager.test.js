import { describe, expect, test, vi } from 'vitest';
import { agentNeighbours, createAgentPager, pagerStep } from './service-modal-pager.js';

const AGENTS = [
  { id: 'a', number: '01', name: 'Sınıflandırıcı' },
  { id: 'b', number: '02', name: 'Okuyucu' },
  { id: 'c', number: '03', name: 'Önemlilik' },
];

describe('agentNeighbours', () => {
  test('the pages either side of an agent in crew order, none past either end', () => {
    expect(agentNeighbours(AGENTS, 'b')).toEqual({ prev: AGENTS[0], next: AGENTS[2] });
    expect(agentNeighbours(AGENTS, 'a')).toEqual({ prev: null, next: AGENTS[1] });
    expect(agentNeighbours(AGENTS, 'c')).toEqual({ prev: AGENTS[1], next: null });
  });

  test('an unknown id has no neighbours', () => {
    expect(agentNeighbours(AGENTS, 'zz')).toEqual({ prev: null, next: null });
  });
});

describe('pagerStep', () => {
  const key = (k, extra = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: document.body, ...extra });

  test('maps the arrow keys to a step, ignoring modified presses and typing', () => {
    expect(pagerStep(key('ArrowLeft'))).toBe(-1);
    expect(pagerStep(key('ArrowRight'))).toBe(1);
    expect(pagerStep(key('ArrowUp'))).toBe(0);
    expect(pagerStep(key('ArrowRight', { altKey: true }))).toBe(0);
    expect(pagerStep(key('ArrowLeft', { metaKey: true }))).toBe(0);
    const input = document.createElement('input');
    expect(pagerStep(key('ArrowLeft', { target: input }))).toBe(0);
  });
});

describe('createAgentPager', () => {
  test('labels both ways with number and name and steps on click', () => {
    const onStep = vi.fn();
    const pager = createAgentPager({ onStep });
    pager.render(AGENTS, 'b');
    const [prev, next] = pager.el.querySelectorAll('button');
    expect(pager.el.getAttribute('aria-label')).toBe('Tayfa: önceki ve sonraki ajan');
    expect(prev.textContent).toContain('01');
    expect(prev.textContent).toContain('Sınıflandırıcı');
    expect(prev.getAttribute('aria-label')).toBe('Önceki ajan: 01 Sınıflandırıcı');
    expect(next.getAttribute('aria-label')).toBe('Sonraki ajan: 03 Önemlilik');
    next.click();
    prev.click();
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
  });

  test('at either end the missing way is disabled, kept in place (no layout jump)', () => {
    const pager = createAgentPager({ onStep: () => {} });
    pager.render(AGENTS, 'a');
    const [prev, next] = pager.el.querySelectorAll('button');
    expect(prev.disabled).toBe(true);
    expect(prev.getAttribute('aria-label')).toBe('Önceki ajan yok');
    expect(next.disabled).toBe(false);
    pager.render(AGENTS, 'c');
    expect(pager.el.querySelectorAll('button')[1].disabled).toBe(true);
  });
});

describe('renderFolio (the detail running head)', () => {
  test('one tick per agent, those up to the shown one inked, and its place in the crew', async () => {
    const { renderFolio } = await import('./service-modal.js');
    const slot = document.createElement('span');
    renderFolio(slot, AGENTS, 'b');
    const ticks = [...slot.querySelectorAll('.folio-ticks i')];
    expect(ticks.map((t) => t.className)).toEqual(['is-done', 'is-current is-done', '']);
    expect(slot.querySelector('.folio-page').textContent).toBe('Tayfa 2 / 3');
  });
});
