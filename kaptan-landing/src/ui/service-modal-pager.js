// The agent detail's page turner: "← 04 Kanıt · 06 Uyum →" in the running head. The crew is read
// like the pages of a book, in crew order (src/data/agents.js), with no wrap past either end; the
// arrow keys turn too. The detail itself plays the set-down when the agent changes
// (service-modal-motion.js `swap`).

import { h } from './dom.js';

/** The agents either side of `id` in crew order (null past either end or for an unknown id). */
export function agentNeighbours(agents, id) {
  const i = agents.findIndex((agent) => agent.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: agents[i - 1] ?? null, next: agents[i + 1] ?? null };
}

/** −1 / +1 for an unmodified ← / → press outside a text field, else 0. */
export function pagerStep(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 0;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return 0;
  if (event.key === 'ArrowLeft') return -1;
  if (event.key === 'ArrowRight') return 1;
  return 0;
}

function stepButton(direction, onStep) {
  const isPrev = direction < 0;
  const number = h('span', { class: 'service-modal__step-no' });
  const name = h('span', { class: 'service-modal__step-name' });
  const arrow = h('span', { class: 'service-modal__step-arrow', 'aria-hidden': 'true' }, isPrev ? '←' : '→');
  const parts = isPrev ? [arrow, number, name] : [number, name, arrow];
  const button = h('button', { type: 'button', class: `service-modal__step service-modal__step--${isPrev ? 'prev' : 'next'}` }, ...parts);
  button.addEventListener('click', () => onStep(direction));
  return { button, number, name };
}

/**
 * @param {{ onStep: (direction: -1 | 1) => void }} options
 * @returns {{ el: HTMLElement, render: (agents: ReadonlyArray<object>, id: string) => void }}
 */
export function createAgentPager({ onStep }) {
  const prev = stepButton(-1, onStep);
  const next = stepButton(1, onStep);
  const el = h('nav', { class: 'service-modal__pager', 'aria-label': 'Tayfa: önceki ve sonraki ajan' }, prev.button, next.button);

  function fill(step, agent, word) {
    step.button.disabled = !agent;
    step.number.textContent = agent ? agent.number : '';
    step.name.textContent = agent ? agent.name : '';
    step.button.setAttribute('aria-label', agent ? `${word} ajan: ${agent.number} ${agent.name}` : `${word} ajan yok`);
  }

  return {
    el,
    render(agents, id) {
      const around = agentNeighbours(agents, id);
      fill(prev, around.prev, 'Önceki');
      fill(next, around.next, 'Sonraki');
    },
  };
}
