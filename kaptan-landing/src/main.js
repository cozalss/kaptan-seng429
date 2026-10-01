import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SITE } from './config/site.js';
import { AGENTS } from './data/agents.js';
import { initStickyCta } from './components/sticky-cta/sticky-cta.js';
import { initHeaderState } from './components/header/header.js';
import { createSmoothScroll } from './lib/smooth-scroll.js';
import { initMotion } from './lib/motion-setup.js';
import { afterNextPaint, attempt, chapterFromHash, setInert, warmLazyImages, yieldToMain } from './lib/boot.js';
import { criticalImages, hideLoader, runLoader } from './components/loader/loader.js';
import { abortIntro, isFirstVisit, playIntro, prefersSaveData, shouldPlayCinematic } from './components/loader/aperture.js';
import { initGrain } from './components/grain/grain.js';
import { renderServices } from './components/services/services-render.js';
import { bindSiteContent } from './components/visit/visit-render.js';
import { renderRitualImages } from './components/ritual/ritual-render.js';
import { initCompass } from './components/compass/index.js';
import { initSeaStage } from './components/hero/sea/sea-stage.js';
import { initInkIn } from './lib/ink-in.js';
import { markTitleDiacritics } from './lib/title-marks.js';
import { initFolios } from './lib/folio.js';
import { initKeepPlace } from './lib/keep-place.js';
import { installFocusGuard } from './lib/focus-guard.js';

// Cancels the CSS failsafe that hides the loader when this module never runs (loader.css).
document.documentElement.classList.add('js-boot');

// Well past the loader's 1.5 s asset cap plus the ≈0.85 s intro: if boot has not settled by
// then, something hung. The page is made usable with the static layout instead.
const SAFETY_TIMEOUT_MS = 6000;
// How long a deep link keeps following late re-measures (lazy chunks) if the reader stays still.
const DEEP_LINK_FOLLOW_MS = 8000;

const $ = (selector) => document.querySelector(selector);
const intro = { loader: $('[data-loader]'), stage: $('.hero__stage'), header: $('.site-header') };
const page = { scroller: null, motion: null, introDone: false, settled: false, opened: false, sea: null, folios: null };
const introGuarded = () => [intro.header, $('#main')];
// Resolves once the page is handed over; lazy desktop effects wait for it (never before the LCP).
let markIntroFinished = () => {};
const introFinished = new Promise((resolve) => {
  markIntroFinished = resolve;
});

gsap.registerPlugin(ScrollTrigger);
// Mobile URL-bar show/hide must not re-measure pins mid-scroll.
ScrollTrigger.config({ ignoreMobileResize: true });

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.toggle('reduced-motion', prefersReducedMotion);
// Through ScrollTrigger: it remembered 'auto' when it was registered and writes that back on every
// refresh, so setting history.scrollRestoration directly let a reload restore a stale mid-page offset.
if ('scrollRestoration' in history) ScrollTrigger.clearScrollMemory('manual');

function syncScrollbarWidth() {
  const width = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--scrollbar-width', `${width}px`);
}
syncScrollbarWidth();
window.addEventListener('resize', syncScrollbarWidth);

/** Lenis when allowed and working, otherwise native scrolling; never throws. */
function createScroller() {
  return (
    attempt('smooth scroll', () => createSmoothScroll({ enabled: !prefersReducedMotion })) ??
    createSmoothScroll({ enabled: false })
  );
}

/** Static layout: no pins, no scrubbing, native scroll, every letter visible. */
function fallBackToStatic() {
  attempt('motion revert', () => page.motion?.revert());
  attempt('trigger cleanup', () => ScrollTrigger.getAll().forEach((trigger) => trigger.kill()));
  attempt('native scroll', () => page.scroller?.setSmooth(false));
  document.documentElement.classList.add('reduced-motion');
  attempt('intro abort', () => abortIntro(intro));
}

/** Makes the page usable exactly once: loader gone, header/main interactive, scroll free. */
function settle({ fatal }) {
  if (page.settled) return;
  page.settled = true;
  if (fatal) fallBackToStatic();
  page.introDone = true;
  hideLoader(intro.loader);
  openPage();
  if (fatal) page.scroller?.releaseAll();
  else page.scroller?.unlock('intro');
  markIntroFinished();
  finishBelowFold({ fatal }).catch((error) => console.error('[kaptan] below-fold boot failed', error));
}

/** Header and main become interactive (the aperture calls this as it opens, settle() as a backstop). */
function openPage() {
  if (page.opened) return;
  page.opened = true;
  setInert(introGuarded(), false);
  attempt('hero sea open', () => page.sea?.open());
}

/**
 * A chapter deep link (/#olaylar): the browser jumped before the pins and the Pusula stage gave the
 * page its length, so land on the chapter again where it is now, and once more after each later
 * re-measure or change of the page's height (the lazy Sancak Tezgâhı pin, late layout) until the
 * reader scrolls or the page has settled.
 */
function landOnDeepLink(scroller) {
  const chapter = chapterFromHash(window.location.hash);
  if (!chapter || !scroller) return;
  const land = () => scroller.scrollTo(chapter, { immediate: true });
  // on the next frame, so a pin's own scroll shift has been made first
  let queued = 0;
  const follow = () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(land);
  };
  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(follow) : null;
  const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const stop = () => {
    clearTimeout(timer);
    cancelAnimationFrame(queued);
    resized?.disconnect();
    ScrollTrigger.removeEventListener('refresh', follow);
    inputs.forEach((type) => window.removeEventListener(type, stop, true));
  };
  const timer = setTimeout(stop, DEEP_LINK_FOLLOW_MS);
  land();
  resized?.observe(document.body);
  ScrollTrigger.addEventListener('refresh', follow);
  inputs.forEach((type) => window.addEventListener(type, stop, { capture: true, passive: true }));
}

/**
 * Below-the-fold content and its motion, after the intro has painted: rendered in yielded steps,
 * then measured with a single ScrollTrigger.refresh(). Each step stays isolated.
 */
async function finishBelowFold({ fatal }) {
  await afterNextPaint();
  const steps = [
    ['agents', () => renderServices($('[data-services-track]'), AGENTS)],
    ['journey images', () => renderRitualImages($('#yolculuk'))],
    // "350'den 1'e" signature scene: sets its section height before the pins below are measured.
    ['compass', () => initCompass({ section: $('#pusula') })],
    ['grain', () => initGrain(document.querySelectorAll('.hero__stage'))],
    // Caption panels ink themselves in as they arrive (book.css).
    ['ink in', () => initInkIn()],
  ];
  for (const [label, step] of steps) {
    attempt(label, step);
    await yieldToMain();
  }
  if (!fatal) attempt('below-fold motion', () => page.motion?.addBelowFold());
  warmLazyImages();
  await yieldToMain();
  attempt('trigger refresh', () => ScrollTrigger.refresh());
  attempt('deep link', () => landOnDeepLink(page.scroller));
  // The running heads' live folio: measured after the pins exist, re-measured on every refresh.
  page.folios = attempt('folios', () => initFolios());
  attempt('folio refresh', () => ScrollTrigger.addEventListener('refresh', () => page.folios?.refresh()));
  // Turning a phone mid-page rebuilds the pins; the reader stays in the same chapter.
  attempt('keep place', () => initKeepPlace({ scroller: page.scroller }));
}

/** Timeout + global error net for the boot window; returns a disarm function. */
function installSafetyNet() {
  const rescue = (reason) => {
    if (page.settled) return;
    console.error('[kaptan] boot rescued', reason);
    settle({ fatal: true });
  };
  const onError = (event) => rescue(event.error ?? event.reason ?? event.message);
  const timer = window.setTimeout(() => rescue('timeout'), SAFETY_TIMEOUT_MS);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onError);
  };
}

/**
 * Scrolls to a chapter and, as a native anchor would, lands the focus there: the next Tab starts
 * at the chapter, not back at the link or the menu (a keyboard reader was otherwise sent straight
 * back to where they came from, e.g. into the Pusula scene after "Sahneyi atla").
 */
function goToChapter(scroller, target) {
  scroller.scrollTo(target);
  const landing = typeof target === 'string' ? document.querySelector(target) : target;
  if (!landing) return;
  if (!landing.hasAttribute('tabindex')) landing.setAttribute('tabindex', '-1');
  landing.focus({ preventScroll: true });
}

function bindScrollLinks(scroller) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const target = link.dataset.scrollTo;
    if (target) {
      event.preventDefault();
      goToChapter(scroller, target);
    } else if (link.getAttribute('href') === '#') {
      // A bare "#" never jumps to the top (links without a destination are not rendered as links).
      event.preventDefault();
    }
  });
}

/** Overlays (menu, demo drawer, agent detail, modals), loaded separately so a UI failure never takes the page down. */
async function initInterface(scroller) {
  const ui = await import('./ui/index.js');
  ui.initKaptanUI?.({
    agents: AGENTS,
    site: SITE,
    lockScroll: () => scroller.lock('overlay'),
    unlockScroll: () => scroller.unlock('overlay'),
    scrollTo: (target) => goToChapter(scroller, target),
  });
}

/** Above-the-fold content only; below-the-fold sections wait for finishBelowFold(). */
async function initContent(scroller) {
  // The ink sea is set up before the loader lifts; openPage() lets the ink bleed in as the aperture opens.
  page.sea = attempt('hero sea', () => initSeaStage({ section: $('#hero') }));
  attempt('title marks', () => markTitleDiacritics());
  // Lazy pins re-parent sections; keyboard focus must never fall to <body> because of it.
  attempt('focus guard', () => installFocusGuard());
  attempt('site content', () => bindSiteContent(SITE));
  attempt('sticky cta', () => initStickyCta({ scrollTarget: window }));
  attempt('scroll links', () => bindScrollLinks(scroller));
  attempt('header', () => initHeaderState({ header: intro.header }));
  await yieldToMain();
  initInterface(scroller).catch((error) => console.error('[kaptan] interface failed to load', error));
}

async function runIntroSequence(scroller) {
  page.motion = initMotion({ scroller, isIntroDone: () => page.introDone, afterIntro: () => introFinished });
  const status = $('[data-loader-status]');
  await runLoader({ root: intro.loader, images: criticalImages(), status, animate: !page.motion.reduced });
  if (page.settled) return;

  // Pins are measured once, after the below-the-fold content is in (finishBelowFold).
  const hero = page.motion.hero;
  await playIntro({
    ...intro,
    heroIntro: hero ? (options) => hero.intro(options) : null,
    cinematic: shouldPlayCinematic({ reduced: page.motion.reduced, firstVisit: isFirstVisit(), saveData: prefersSaveData() }),
    onOpen: openPage,
  });
}

async function boot() {
  const disarm = installSafetyNet();
  const scroller = createScroller();
  page.scroller = scroller;
  scroller.lock('intro');
  setInert(introGuarded(), true);
  window.scrollTo(0, 0);

  try {
    await initContent(scroller);
    await runIntroSequence(scroller);
    settle({ fatal: false });
  } catch (error) {
    // Never leave the visitor stuck behind the loader: fall back to the static layout.
    console.error('[kaptan] boot failed', error);
    settle({ fatal: true });
  } finally {
    disarm();
  }
}

boot().catch((error) => {
  console.error('[kaptan] boot crashed', error);
  hideLoader(intro.loader);
});
