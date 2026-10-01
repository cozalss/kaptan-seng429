import { beforeEach, describe, expect, it } from 'vitest';
import { MILESTONES } from '../../data/milestones.js';
import { bindProjectLink, bindSiteContent, renderTimeline } from './visit-render.js';

describe('renderTimeline', () => {
  let list;
  beforeEach(() => {
    document.body.innerHTML = '<dl data-timeline></dl>';
    list = document.querySelector('[data-timeline]');
  });

  it('lists every milestone as label → date', () => {
    renderTimeline(list, MILESTONES, new Date(2026, 8, 29));
    const terms = [...list.querySelectorAll('dt')].map((dt) => dt.textContent);
    const dates = [...list.querySelectorAll('dd')].map((dd) => dd.textContent);
    expect(terms[1]).toBe('İskelet');
    expect(dates).toEqual(['12 Eki 2026', '26 Eki 2026', '9 Kas 2026', '23 Kas 2026', 'Ocak 2027']);
    expect(list.querySelector('dd time').getAttribute('datetime')).toBe('2026-10-12');
  });

  it('highlights the next milestone and mutes the past ones', () => {
    renderTimeline(list, MILESTONES, new Date(2026, 10, 10));
    const terms = [...list.querySelectorAll('dt')];
    expect(terms[3].classList.contains('is-next')).toBe(true);
    expect(terms[3].textContent).toBe('Progress · canlı test, tüm ajanlar · sıradaki');
    expect(list.querySelectorAll('.is-next')).toHaveLength(2);
    expect(terms.slice(0, 3).every((dt) => dt.classList.contains('is-past'))).toBe(true);
  });

  it('circles only the next date with a decorative ink ring', () => {
    renderTimeline(list, MILESTONES, new Date(2026, 10, 10));
    const rings = list.querySelectorAll('.timeline__ring');
    expect(rings).toHaveLength(1);
    expect(rings[0].closest('dd').classList.contains('is-next')).toBe(true);
    expect(rings[0].getAttribute('aria-hidden')).toBe('true');
    expect(rings[0].querySelector('path[data-ink-ring]').getAttribute('d')).toMatch(/^M[\d ]/);
    expect(list.querySelectorAll('dd.is-next')[0].textContent).toBe('23 Kas 2026');
  });

  it('marks everything past after the final month', () => {
    renderTimeline(list, MILESTONES, new Date(2027, 2, 1));
    expect(list.querySelectorAll('.is-next')).toHaveLength(0);
    expect(list.querySelectorAll('dt.is-past')).toHaveLength(MILESTONES.length);
    expect(list.querySelector('.timeline__ring')).toBeNull();
  });
});

describe('bindProjectLink', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p><span class="visit__link" data-site-link="githubUrl">GitHub</span></p>';
  });

  it('turns a configured https URL into a new-tab link', () => {
    const link = bindProjectLink(document.querySelector('[data-site-link]'), 'https://github.com/org/kaptan');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://github.com/org/kaptan');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toBe('GitHub (yeni sekmede açılır)');
    expect(document.querySelector('a.visit__link')).toBe(link);
  });

  it('keeps a missing or unsafe URL as a muted "yakında" line, never a dead link', () => {
    const node = bindProjectLink(document.querySelector('[data-site-link]'), null);
    expect(node.tagName).toBe('SPAN');
    expect(node.textContent).toBe('GitHub · yakında');
    expect(node.classList.contains('is-pending')).toBe(true);
    bindProjectLink(node, 'javascript:alert(1)');
    expect(document.querySelector('a')).toBeNull();
    expect(node.textContent).toBe('GitHub · yakında');
  });
});

describe('bindSiteContent', () => {
  it('fills the timeline and every project link from SITE', () => {
    document.body.innerHTML = `
      <dl data-timeline></dl>
      <span data-site-link="proposalUrl">Proposal</span>
      <span data-site-link="githubUrl">GitHub</span>`;
    bindSiteContent({ links: { proposalUrl: null, githubUrl: 'https://github.com/x' } }, document, new Date(2026, 8, 29));
    expect(document.querySelectorAll('[data-timeline] dt')).toHaveLength(MILESTONES.length);
    expect(document.querySelector('[data-site-link="proposalUrl"]').textContent).toBe('Proposal · yakında');
    expect(document.querySelector('a[data-site-link="githubUrl"]').href).toBe('https://github.com/x');
  });
});
