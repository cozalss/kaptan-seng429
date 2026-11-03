import { beforeEach, describe, expect, it } from 'vitest';
import { bindProjectLink, bindSiteContent } from './visit-render.js';

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
  it('fills every project link from SITE', () => {
    document.body.innerHTML = `
      <span data-site-link="soonUrl">Yakında</span>
      <span data-site-link="githubUrl">GitHub</span>`;
    bindSiteContent({ links: { soonUrl: null, githubUrl: 'https://github.com/x' } }, document);
    expect(document.querySelector('[data-site-link="soonUrl"]').textContent).toBe('Yakında · yakında');
    expect(document.querySelector('a[data-site-link="githubUrl"]').href).toBe('https://github.com/x');
  });
});
