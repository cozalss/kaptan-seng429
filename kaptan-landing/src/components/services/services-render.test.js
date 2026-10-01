import { beforeEach, describe, expect, it } from 'vitest';
import { PANELS, SERVICE_IMAGE_SIZES, WIDE_IMAGE_SIZES, agentCardLabel, agentFolio, beatIndex, panelFor, parseAgentMeta, renderServices, withRuleCodes } from './services-render.js';
import { AGENTS } from '../../data/agents.js';

const SERVICE = AGENTS[0];

describe('renderServices', () => {
  let track;

  beforeEach(() => {
    document.body.innerHTML = '<ul data-services-track></ul>';
    track = document.querySelector('[data-services-track]');
  });

  it('renders one panel per agent, each a button with an accessible name', () => {
    renderServices(track, AGENTS);
    const cards = track.querySelectorAll('.services__item .service-card');
    expect(cards).toHaveLength(8);
    expect(cards[0].tagName).toBe('BUTTON');
    expect(cards[0].dataset.serviceId).toBe('siniflandirici');
    expect(cards[0].dataset.agentKind).toBe('llm');
    expect(cards[6].dataset.agentKind).toBe('rule');
    expect(cards[0].getAttribute('aria-label')).toBe(
      'Sınıflandırıcı, LLM ajanı · 01. Girdi: bildirim · Çıktı: E1–E4 / filtre / diğer. Ayrıntıları gör',
    );
  });

  it('lays the crew out as a comic page: a splash, standard panels and two narrow ruled plates', () => {
    renderServices(track, AGENTS);
    const items = [...track.querySelectorAll('.services__item')];
    const ids = (selector) => items.filter((item) => item.matches(selector)).map((item) => item.firstChild.dataset.serviceId);
    expect(ids('.services__item--rule')).toEqual(['kural-motoru', 'risk-kapisi']);
    expect(ids('.services__item--plate')).toEqual(['kural-motoru', 'risk-kapisi']);
    expect(ids('.services__item--splash')).toEqual(['siniflandirici']);
    expect(ids('.services__item--standard')).toHaveLength(5);
    expect(new Set(Object.values(PANELS).map((panel) => panel.format)).size).toBeGreaterThanOrEqual(3);
  });

  it('sets a gutter beat between the six readers and the two deciders, hidden from the reader', () => {
    renderServices(track, AGENTS);
    const children = [...track.children];
    expect(children).toHaveLength(9);
    const beat = children[6];
    expect(beat.matches('.services__beat')).toBe(true);
    expect(beat.getAttribute('aria-hidden')).toBe('true');
    expect(beat.textContent).toBe('Altısı okur.İkisi hükmeder.');
    expect(beatIndex(AGENTS.slice(0, 7))).toBe(-1);
    expect(beatIndex([])).toBe(-1);
  });

  it('lays one idle loop over each portrait, decorative and positioned on the art', () => {
    renderServices(track, AGENTS);
    const lives = [...track.querySelectorAll('.service-card__life')];
    expect(lives).toHaveLength(8);
    lives.forEach((life) => expect(life.getAttribute('aria-hidden')).toBe('true'));
    expect(lives.every((life) => life.querySelector('.life__rain'))).toBe(true);
    const lantern = track.querySelector('[data-service-id="uyum"] .life__flicker');
    expect(lantern.style.getPropertyValue('--x')).toBe('13.6%');
    expect(track.querySelector('[data-service-id="okuyucu"] .life__rule').style.getPropertyValue('--w')).toBe('44%');
    expect(track.querySelector('[data-service-id="kural-motoru"]').parentElement.style.getPropertyValue('--art-x')).toBe('30%');
    expect(panelFor('nobody')).toEqual({ format: 'standard', life: null });
  });

  it('shows the folio, the name, the voice caption and a Girdi / Çıktı row', () => {
    renderServices(track, AGENTS);
    const card = track.querySelectorAll('.service-card')[3];
    expect(card.querySelector('.service-card__category').textContent).toBe('4 / 8 · LLM ajanı');
    expect(card.querySelector('.service-card__name').textContent).toBe('Kanıt');
    expect(card.querySelector('.service-card__voice').textContent).toBe(AGENTS[3].notDoes);
    const cells = [...card.querySelectorAll('.service-card__io')].map((cell) => [
      cell.querySelector('.service-card__io-key').textContent,
      cell.querySelector('.service-card__io-value').textContent,
    ]);
    expect(cells).toEqual([
      ['Girdi', 'olay'],
      ['Çıktı', 'benzer geçmiş olaylar'],
    ]);
  });

  it('sets rule codes in the Çıktı cell in mono', () => {
    renderServices(track, [AGENTS[6]]);
    expect(track.querySelector('.service-card__category').textContent).toBe('1 / 1 · Deterministik');
    expect(track.querySelector('.service-card__code').textContent).toBe('E1–E4');
    expect(track.querySelector('.service-card__io .rule-code').textContent).toBe('E1–E4');
  });

  it('uses one lazy <picture> with AVIF and WebP sources and a JPEG fallback — no second "detail" layer', () => {
    renderServices(track, [SERVICE]);
    const media = track.querySelector('.service-card__media');
    expect(media.children).toHaveLength(2); // the picture and its idle-loop layer
    expect(media.querySelectorAll('img')).toHaveLength(1);
    const sources = [...media.querySelectorAll('source')];
    expect(sources.map((source) => source.type)).toEqual(['image/avif', 'image/webp']);
    expect(sources[0].getAttribute('sizes')).toBe(WIDE_IMAGE_SIZES); // the splash panel
    const image = media.querySelector('img');
    expect(image.getAttribute('alt')).toBe('');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('decoding')).toBe('async');
    expect(image.getAttribute('src')).toBe('/images/generated/ajan-1-600.jpg');
    expect(image.getAttribute('srcset')).toContain('ajan-1-800.jpg 800w');
    expect(track.querySelector('[class*="detail"]')).toBeNull();
  });

  it('falls back to a plain image for paths without generated variants', () => {
    renderServices(track, [{ ...SERVICE, image: '/images/custom.jpg' }]);
    expect(track.querySelector('picture')).toBeNull();
    expect(track.querySelector('img').getAttribute('src')).toBe('/images/custom.jpg');
  });

  it('does nothing without a track', () => {
    expect(() => renderServices(null, [SERVICE])).not.toThrow();
  });
});

describe('panel helpers', () => {
  it('parses the Girdi / Çıktı line and rejects anything else', () => {
    expect(parseAgentMeta('Girdi: öneri · Çıktı: aynen / küçült / reddet')).toEqual({ input: 'öneri', output: 'aynen / küçült / reddet' });
    expect(parseAgentMeta('serbest metin')).toBeNull();
    expect(parseAgentMeta(undefined)).toBeNull();
  });

  it('writes the folio in sentence case with the panel number', () => {
    expect(agentFolio(3, 8, 'LLM ajanı')).toBe('4 / 8 · LLM ajanı');
  });

  it('wraps only the rule codes', () => {
    const nodes = withRuleCodes('Çıktı: E1–E4 kararı, R01–R16');
    expect(nodes.map((node) => node.nodeName)).toEqual(['#text', 'SPAN', '#text', 'SPAN']);
    expect(nodes[1].textContent).toBe('E1–E4');
    expect(nodes[3].textContent).toBe('R01–R16');
    expect(withRuleCodes('olay').map((node) => node.textContent)).toEqual(['olay']);
  });

  it('names a card with its kind as written', () => {
    expect(agentCardLabel({ name: 'X', category: 'Deterministik · 07', meta: 'm' })).toBe('X, Deterministik · 07. m. Ayrıntıları gör');
  });
});
