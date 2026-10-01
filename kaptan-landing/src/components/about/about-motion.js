import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { splitLines } from '../../lib/split-text.js';

const STOMP = { duration: 0.9, stagger: 0.02, ease: 'power3.out' };

/** Characters rise out of their line masks when a `[data-stomp]` heading enters the viewport. */
function stompHeading(el) {
  const { chars, revert } = splitLines(el);
  gsap.set(chars, { yPercent: 110 });
  const trigger = ScrollTrigger.create({
    trigger: el,
    start: 'top 85%',
    once: true,
    onEnter: () =>
      gsap.to(chars, {
        ...STOMP,
        yPercent: 0,
        onComplete: () => el.classList.add('is-split-revealed'),
      }),
  });
  return () => {
    trigger.kill();
    gsap.killTweensOf(chars);
    revert();
    el.classList.remove('is-split-revealed');
  };
}

/**
 * Section motion shared by the chapters motion-setup.js hands in: `[data-stomp]` headings (where a
 * chapter still uses them).
 */
export function initAboutMotion({ section }) {
  if (!section) return { destroy() {} };
  const undo = [...section.querySelectorAll('[data-stomp]')].map(stompHeading);

  return {
    destroy() {
      undo.forEach((stop) => stop());
    },
  };
}
