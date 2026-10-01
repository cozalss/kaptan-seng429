import { describe, expect, it, vi } from 'vitest';
import { h } from './dom.js';

describe('h', () => {
  it('creates an element with the given tag', () => {
    const el = h('div');
    expect(el.tagName).toBe('DIV');
  });

  it('turns string children into real text nodes', () => {
    const el = h('p', null, 'hello');
    expect(el.childNodes).toHaveLength(1);
    expect(el.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    expect(el.textContent).toBe('hello');
  });

  it('never parses markup from string children', () => {
    const el = h('p', null, '<script>alert(1)</script>');
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toBe('<script>alert(1)</script>');
  });

  it('converts number children to text', () => {
    const el = h('span', null, 42);
    expect(el.textContent).toBe('42');
  });

  it('appends Node children directly', () => {
    const child = h('em', null, 'x');
    const el = h('p', null, child);
    expect(el.firstChild).toBe(child);
  });

  it('flattens nested arrays of children', () => {
    const el = h('ul', null, [h('li', null, 'a'), [h('li', null, 'b'), h('li', null, 'c')]]);
    expect(el.children).toHaveLength(3);
  });

  it('skips null, undefined and false children', () => {
    const el = h('div', null, null, undefined, false, 'kept');
    expect(el.textContent).toBe('kept');
  });

  it('sets a class attribute', () => {
    const el = h('div', { class: 'foo bar' });
    expect(el.getAttribute('class')).toBe('foo bar');
  });

  it('sets boolean-true attributes as present with an empty value', () => {
    const el = h('input', { disabled: true });
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.getAttribute('disabled')).toBe('');
  });

  it('omits boolean-false and null/undefined attributes entirely', () => {
    const el = h('input', { disabled: false, hidden: null, required: undefined });
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.hasAttribute('required')).toBe(false);
  });

  it('sets plain string/number attributes via setAttribute', () => {
    const el = h('div', { 'aria-label': 'Close', tabindex: -1 });
    expect(el.getAttribute('aria-label')).toBe('Close');
    expect(el.getAttribute('tabindex')).toBe('-1');
  });

  it('wires "on*" function attrs as event listeners', () => {
    const handler = vi.fn();
    const el = h('button', { onClick: handler });
    el.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('creates svg/use elements in the SVG namespace', () => {
    const svg = h('svg', null, h('use', { href: '#icon' }));
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.firstChild.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.firstChild.getAttribute('href')).toBe('#icon');
  });

  it('works with no attrs and no children', () => {
    const el = h('div');
    expect(el.attributes).toHaveLength(0);
    expect(el.childNodes).toHaveLength(0);
  });
});
