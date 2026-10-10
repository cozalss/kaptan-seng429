import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const AGENTS = [
  {
    id: 'kanit',
    number: '04',
    name: 'Kanıt',
    category: 'LLM AJANI · 04',
    meta: 'Girdi: olay · Çıktı: benzer geçmiş olaylar',
    image: '/images/ajan-4.jpg',
    description: 'Benzer geçmiş olayları getirilerini görmeden seçer.',
    notDoes: 'Getiri görmez, istatistik hesaplamaz.',
  },
  {
    id: 'risk-kapisi',
    number: '08',
    name: 'Risk Kapısı',
    category: 'DETERMİNİSTİK · 08',
    meta: 'Girdi: öneri · Çıktı: aynen / küçült / reddet',
    image: '/images/ajan-8.jpg',
    description: '16 kuraldan geçirir.',
    notDoes: 'Bir öneriyi asla büyütmez.',
  },
];

describe('createServiceModal (agent detail)', () => {
  let createServiceModal;
  let mount;
  let scrollTo;
  const created = [];

  beforeEach(async () => {
    vi.resetModules();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = `
      <header class="site-header"></header>
      <main id="main"></main>
      <footer class="site-footer"></footer>
      <div id="overlays"></div>
    `;
    mount = document.getElementById('overlays');
    scrollTo = vi.fn();
    ({ createServiceModal } = await import('./service-modal.js'));
  });

  afterEach(() => {
    while (created.length) created.pop().destroy();
    window.history.replaceState(null, '', '/');
  });

  function mountModal(options = {}) {
    const modal = createServiceModal({ mount, agents: AGENTS, lockScroll: vi.fn(), unlockScroll: vi.fn(), scrollTo, ...options });
    created.push(modal);
    return modal;
  }

  it('renders the agent and opens on a known id', () => {
    const modal = mountModal();
    modal.open('kanit');

    expect(modal.isOpen()).toBe(true);
    expect(mount.querySelector('.service-modal__head-title').textContent).toBe('Bölüm 2 · Tayfa — 04 Kanıt');
    expect(mount.querySelector('.service-modal__name').textContent).toBe('Kanıt');
    expect(mount.querySelector('.service-modal__meta').textContent).toBe('Girdi: olay · Çıktı: benzer geçmiş olaylar');
    expect(mount.querySelector('.service-modal__description').textContent).toBe(AGENTS[0].description);
    expect(mount.querySelector('.service-modal__not').textContent).toBe('Ne yapmazGetiri görmez, istatistik hesaplamaz.');
    expect(mount.querySelector('.service-modal__image').getAttribute('alt')).toBe('Kanıt ajanının çizimi');
    const nameEl = mount.querySelector('.service-modal__name');
    expect(modal.panel.getAttribute('aria-labelledby')).toBe(nameEl.id);
    expect(modal.panel.hasAttribute('aria-label')).toBe(false);
  });

  it('has no booking action — only the way on to the journey', () => {
    const modal = mountModal();
    modal.open('kanit');
    const buttons = [...mount.querySelectorAll('button:not(.service-modal__step)')].map((b) => b.textContent);
    expect(buttons).toEqual(['✕', 'Rotada görün']);
    expect(mount.textContent).not.toMatch(/randevu/i);
  });

  it('"Rotada görün" closes the detail and scrolls to #yolculuk', () => {
    const modal = mountModal();
    modal.open('kanit');
    mount.querySelector('.service-modal__cta').click();
    expect(modal.isOpen()).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith('#yolculuk');
  });

  it('falls back to the shared AGENTS list when none is passed', () => {
    const modal = mountModal({ agents: undefined });
    modal.open('uyum');
    expect(mount.querySelector('.service-modal__name').textContent).toBe('Uyum');
  });

  it('does nothing for an unknown agent id', () => {
    const modal = mountModal();
    modal.open('does-not-exist');
    expect(modal.isOpen()).toBe(false);
  });

  it('re-renders content when opened again for a different agent', () => {
    const modal = mountModal();
    modal.open('kanit');
    modal.close();
    modal.open('risk-kapisi');
    expect(mount.querySelector('.service-modal__name').textContent).toBe('Risk Kapısı');
    expect(mount.querySelector('.service-modal__head-title').textContent).toBe('Bölüm 2 · Tayfa — 08 Risk Kapısı');
  });

  it('builds a <picture> with AVIF/WebP <source> elements for a known generated image set', () => {
    const modal = mountModal();
    modal.open('kanit');
    const sources = mount.querySelectorAll('.service-modal__media source');
    expect([...sources].map((s) => s.type)).toEqual(expect.arrayContaining(['image/avif', 'image/webp']));
    expect(sources[0].getAttribute('srcset')).toContain('ajan-4-800.avif');
  });

  it('falls back to a plain <img src> when the image path is not a known generated set', () => {
    const modal = mountModal({ agents: [{ ...AGENTS[0], image: '/images/unknown-photo.jpg' }] });
    modal.open('kanit');
    const image = mount.querySelector('.service-modal__image');
    expect(image.getAttribute('src')).toBe('/images/unknown-photo.jpg');
    expect(mount.querySelectorAll('.service-modal__media source')).toHaveLength(0);
  });

  it('clears stale <source> elements when re-opened for a different agent', () => {
    const modal = mountModal();
    modal.open('kanit');
    const first = mount.querySelectorAll('.service-modal__media source').length;
    modal.open('risk-kapisi');
    expect(mount.querySelectorAll('.service-modal__media source').length).toBe(first);
  });

  it('the close button closes the overlay', () => {
    const modal = mountModal();
    modal.open('kanit');
    mount.querySelector('.overlay__close').click();
    expect(modal.isOpen()).toBe(false);
  });

  describe('page transition and URL', () => {
    function fakeMotion() {
      return { open: vi.fn(), close: vi.fn(), destroy: vi.fn() };
    }

    const popTo = (hash) => {
      window.history.replaceState(null, '', hash || '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    };

    it('uses the full-viewport detail variant and a masked title line', () => {
      const modal = mountModal();
      modal.open('kanit');
      expect(document.getElementById('service-modal').classList.contains('overlay--detail')).toBe(true);
      expect(mount.querySelector('.service-modal__name .service-modal__name-line').textContent).toBe('Kanıt');
    });

    it('hands the trigger card to the motion on open, and asks for a morph back on close', () => {
      const motion = fakeMotion();
      const modal = mountModal({ createMotion: () => motion });
      const card = document.createElement('button');
      document.getElementById('main').append(card);

      modal.open('kanit', card);
      expect(motion.open).toHaveBeenCalledWith(card);
      modal.close();
      expect(motion.close).toHaveBeenCalledWith({ fade: false });
    });

    it('fades out instead of morphing when the CTA scrolls on to the journey', () => {
      const motion = fakeMotion();
      const modal = mountModal({ createMotion: () => motion });
      modal.open('kanit');
      mount.querySelector('.service-modal__cta').click();
      expect(motion.close).toHaveBeenCalledWith({ fade: true });
      modal.open('kanit');
      modal.close();
      expect(motion.close).toHaveBeenLastCalledWith({ fade: false });
    });

    it('keeps the dialog working when the motion throws', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const broken = { open: vi.fn(() => { throw new Error('gsap'); }), close: vi.fn(() => { throw new Error('gsap'); }), destroy: vi.fn() };
      const modal = mountModal({ createMotion: () => broken });
      modal.open('kanit');
      expect(modal.isOpen()).toBe(true);
      modal.close();
      expect(modal.isOpen()).toBe(false);
      expect(error).toHaveBeenCalledTimes(2);
      error.mockRestore();
    });

    it('re-renders without re-running the entrance when opened for another agent while open', () => {
      const motion = fakeMotion();
      const modal = mountModal({ createMotion: () => motion });
      modal.open('kanit');
      modal.open('risk-kapisi');
      expect(motion.open).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe('#ajan-risk-kapisi');
    });

    it('turns to the next and previous agent from the running head, replacing the URL entry', () => {
      const motion = { ...fakeMotion(), swap: vi.fn(({ render }) => render()), retarget: vi.fn() };
      const modal = mountModal({ createMotion: () => motion });
      modal.open('kanit');
      const [prev, next] = mount.querySelectorAll('.service-modal__step');
      expect(prev.disabled).toBe(true);
      expect(next.getAttribute('aria-label')).toBe('Sonraki ajan: 08 Risk Kapısı');
      const length = window.history.length;

      next.click();
      expect(motion.swap).toHaveBeenCalledWith(expect.objectContaining({ direction: 1 }));
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Risk Kapısı');
      expect(window.location.hash).toBe('#ajan-risk-kapisi');
      expect(window.history.length).toBe(length);
      expect(next.disabled).toBe(true);

      prev.click();
      expect(motion.swap).toHaveBeenLastCalledWith(expect.objectContaining({ direction: -1 }));
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Kanıt');
      expect(motion.open).toHaveBeenCalledTimes(1);
    });

    it('the arrow keys turn the page; modified presses do not', () => {
      const motion = { ...fakeMotion(), swap: vi.fn(({ render }) => render()), retarget: vi.fn() };
      const modal = mountModal({ createMotion: () => motion });
      modal.open('kanit');
      const press = (key, extra = {}) => modal.panel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
      press('ArrowRight', { altKey: true });
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Kanıt');
      press('ArrowRight');
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Risk Kapısı');
      press('ArrowRight'); // the last page: nothing past it
      expect(motion.swap).toHaveBeenCalledTimes(1);
      press('ArrowLeft');
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Kanıt');
    });

    it('closing after a turn brings the last agent card into view and sets the page down on it', () => {
      const motion = { ...fakeMotion(), swap: vi.fn(({ render }) => render()), retarget: vi.fn() };
      const cards = AGENTS.map((agent) => {
        const card = document.createElement('button');
        card.dataset.serviceId = agent.id;
        card.scrollIntoView = vi.fn();
        document.getElementById('main').append(card);
        return card;
      });
      const asked = vi.fn();
      document.addEventListener('kaptan:reveal-agent', asked, { once: true });
      const modal = mountModal({ createMotion: () => motion });
      modal.open('kanit', cards[0]);
      mount.querySelector('.service-modal__step--next').click();
      modal.close();
      expect(asked).toHaveBeenCalledTimes(1);
      expect(asked.mock.calls[0][0].detail.id).toBe('risk-kapisi');
      expect(cards[1].scrollIntoView).toHaveBeenCalled(); // nobody answered: the card is scrolled to
      expect(motion.retarget).toHaveBeenCalledWith(cards[1]);
      expect(document.activeElement).toBe(cards[1]);
    });

    it('a pending turn is finished before the page closes', () => {
      const motion = { ...fakeMotion(), swap: vi.fn(), retarget: vi.fn() }; // never runs render
      const modal = mountModal({ createMotion: () => motion });
      modal.open('kanit');
      mount.querySelector('.service-modal__step--next').click();
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Kanıt');
      modal.close();
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Risk Kapısı');
    });

    it('mirrors the open agent in #ajan-<id> and steps Back on close', async () => {
      const modal = mountModal();
      modal.open('kanit');
      expect(window.location.hash).toBe('#ajan-kanit');
      expect(window.history.state).toEqual({ kaptanAgent: 'kanit' });

      const popped = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
      modal.close();
      await popped;
      expect(window.location.hash).toBe('');
      expect(modal.isOpen()).toBe(false);
    });

    it('Back closes it; Forward to #ajan-<id> opens it from its card', () => {
      const card = document.createElement('button');
      card.dataset.serviceId = 'risk-kapisi';
      document.getElementById('main').append(card);
      const motion = fakeMotion();
      const modal = mountModal({ createMotion: () => motion });

      popTo('#ajan-risk-kapisi');
      expect(modal.isOpen()).toBe(true);
      expect(motion.open).toHaveBeenCalledWith(card);
      popTo('');
      expect(modal.isOpen()).toBe(false);
    });

    it('opens a deep link once the page is interactive, and closing it cleans the URL in place', async () => {
      window.history.replaceState(null, '', '/#ajan-risk-kapisi');
      const main = document.getElementById('main');
      main.setAttribute('inert', '');
      const modal = mountModal();
      expect(modal.isOpen()).toBe(false);

      main.removeAttribute('inert');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(modal.isOpen()).toBe(true);
      expect(mount.querySelector('.service-modal__name').textContent).toBe('Risk Kapısı');

      modal.close();
      expect(window.location.hash).toBe('');
      expect(window.location.pathname).toBe('/');
    });

    it('ignores a deep link to an unknown agent', () => {
      window.history.replaceState(null, '', '/#ajan-yok');
      const modal = mountModal();
      expect(modal.isOpen()).toBe(false);
    });

    it('leaves the URL alone with syncUrl: false', () => {
      window.history.replaceState(null, '', '/#ajan-kanit');
      const modal = mountModal({ syncUrl: false });
      expect(modal.isOpen()).toBe(false);
      window.history.replaceState(null, '', '/');
      modal.open('kanit');
      expect(window.location.hash).toBe('');
    });

    it('destroy() stops following history and tears the motion down', () => {
      const motion = fakeMotion();
      const modal = createServiceModal({ mount, agents: AGENTS, createMotion: () => motion });
      modal.destroy();
      expect(motion.destroy).toHaveBeenCalled();
      popTo('#ajan-kanit');
      expect(modal.isOpen()).toBe(false);
    });
  });
});

describe('longestWord', () => {
  it('counts the letters of the longest word, at least one', async () => {
    const { longestWord } = await import('./service-modal.js');
    expect(longestWord('Sınıflandırıcı')).toBe(14);
    expect(longestWord('Risk Kapısı')).toBe(6);
    expect(longestWord('')).toBe(1);
  });
});
