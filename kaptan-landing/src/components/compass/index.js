// "350'den 1'e" — the interlude's ink scene. A sticky stage (CSS) holds the copy, the full-bleed
// canvas and the act rail while the tall section scrolls past. The scene runs from the moment the
// section's top edge appears (pre-roll: the storm is already drifting in) until it has left the
// screen (exit). ScrollTrigger reports the scroll progress; a
// damped playhead follows it (so wheel steps, keyboard jumps and touch flings never jitter), and
// a frame is drawn only while the playhead or the pointer is still moving. The scene is plain
// Canvas 2D: it never takes the page's one WebGL slot (the hero's sea keeps it). The renderer
// chunk loads as the section approaches and its canvas is freed once the section is far away.
// Reduced motion, or no 2D canvas: the static composition (still image + the four acts as text).

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { hasCanvas2D, sceneSettings } from './config.js';
import { IDLE, LEAD, damp, poseAt } from './timeline.js';
import { MODES, createCompassView } from './view.js';

const REDUCE = '(prefers-reduced-motion: reduce)';
// Too short for the scene's copy, counter and rail to clear each other (a 1440×900 window at 200 %
// zoom is 720×450; phones held sideways): the static composition reads cleanly there.
const SHORT = '(max-height: 500px) and (orientation: landscape)';
const FINE_POINTER = '(hover: hover) and (pointer: fine)';
const PLAYHEAD_HALF_LIFE_S = 0.075; // on top of Lenis: filters discrete jumps, adds no felt lag
const POINTER_HALF_LIFE_S = 0.25;
const SETTLED = 2e-5;
const MAX_FRAME_S = 0.1;
const LIVE_MARGIN = '60% 0px'; // canvas exists while the section is on or near the screen
const IDLE_FRAME_S = 1 / 30; // the idle life is drawn at ≤ 30 fps

/**
 * Where Rota's course starts (published by the Rota chapter as --rota-start-x, px from its left
 * edge), as a fraction of the stage width: the compass is set over it, so the course can run on
 * from the compass pivot. Null when Rota does not publish it.
 */
function rotaStartX(width) {
  const rota = document.querySelector('#yolculuk');
  const x = rota ? parseFloat(getComputedStyle(rota).getPropertyValue('--rota-start-x')) : NaN;
  return Number.isFinite(x) && x > 0 && width > 0 ? x / width : null;
}

const loadScene = () => Promise.all([import('./scene.js'), import('./sprites.js')]);

const wantsStatic = () =>
  window.matchMedia(REDUCE).matches ||
  window.matchMedia(SHORT).matches ||
  document.documentElement.classList.contains('reduced-motion') ||
  !hasCanvas2D(document);

/**
 * The damped playhead + pointer; calls draw() each ticker frame until both come to rest. At rest it
 * keeps drawing the idle life (≤ 30 fps) for as long as `canIdle()` holds (W7), then sleeps.
 */
function createPlayhead(draw, canIdle = () => false) {
  const motion = { target: 0, shown: 0, pointer: [0, 0], pointerTarget: [0, 0], idle: 0 };
  let awake = false;
  let dirty = true;
  let sinceIdleFrame = 0;
  const tick = (_time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_S);
    motion.shown = damp(motion.shown, motion.target, PLAYHEAD_HALF_LIFE_S, dt);
    motion.pointer[0] = damp(motion.pointer[0], motion.pointerTarget[0], POINTER_HALF_LIFE_S, dt);
    motion.pointer[1] = damp(motion.pointer[1], motion.pointerTarget[1], POINTER_HALF_LIFE_S, dt);
    const settled =
      Math.abs(motion.shown - motion.target) < SETTLED &&
      Math.abs(motion.pointer[0] - motion.pointerTarget[0]) < 1e-3 &&
      Math.abs(motion.pointer[1] - motion.pointerTarget[1]) < 1e-3;
    if (settled) {
      motion.shown = motion.target;
      motion.pointer[0] = motion.pointerTarget[0];
      motion.pointer[1] = motion.pointerTarget[1];
      if (canIdle()) {
        motion.idle += dt;
        sinceIdleFrame += dt;
        if (sinceIdleFrame < IDLE_FRAME_S) return;
        sinceIdleFrame = 0;
        draw(motion);
        dirty = false;
        return;
      }
    }
    draw(motion);
    dirty = false;
    if (settled) sleep();
  };
  function sleep() {
    if (!awake) return;
    awake = false;
    gsap.ticker.remove(tick);
  }
  return {
    motion,
    wake() {
      dirty = true;
      if (awake) return;
      awake = true;
      gsap.ticker.add(tick);
    },
    /** Jump without easing (resize, first frame, mode changes). */
    snap() {
      motion.shown = motion.target;
      this.wake();
    },
    get dirty() {
      return dirty;
    },
    sleep,
  };
}

/** Owns the canvas: created near the screen, freed far from it. */
function createStage(view, scroll, onScreen) {
  const live = { scene: null, token: 0, failed: false, compact: false, dpr: 1, pose: null };
  const draw = (motion) => {
    const pose = poseAt(motion.shown, { compact: live.compact, lead: scroll.lead, compassX: scroll.compassX, idle: motion.idle });
    live.pose = pose;
    view.setProgress(pose.progress);
    view.setCount(pose.counter);
    view.setExit(pose.exit);
    live.scene?.render(pose, motion.pointer);
  };
  // the renderer reports where the funnel, the slip and the compass landed; the tag and the
  // caption are hung on those points in the same frame, and the course's first leg is inked from
  // the compass down to where Rota's course begins (wide layouts, when Rota publishes its start)
  const onAnchors = (anchors) => {
    if (!live.pose) return;
    const bridgeX = !live.compact && scroll.compassX !== null ? scroll.compassX * (view.visual?.clientWidth ?? 0) : null;
    view.place(anchors, live.pose, { dock: !live.compact, bridgeX });
  };
  // idle life only while the stage is really on screen, the scene is live and the slips are up
  const playhead = createPlayhead(draw, () => onScreen() && Boolean(live.scene) && playheadTarget() < IDLE.until);
  function playheadTarget() {
    return playhead.motion.target;
  }

  const resize = () => {
    if (!live.scene || !view.visual) return;
    const settings = sceneSettings({ width: window.innerWidth, dpr: window.devicePixelRatio });
    live.compact = settings.compact;
    live.dpr = settings.dpr;
    live.scene.setSize(view.visual.clientWidth, view.visual.clientHeight, settings.dpr);
    view.remeasure();
    playhead.wake();
  };
  const observer = new ResizeObserver(resize);
  const onWindowResize = () => {
    // a zoom changes devicePixelRatio without resizing the figure
    if (sceneSettings({ width: window.innerWidth, dpr: window.devicePixelRatio }).dpr !== live.dpr) resize();
  };

  const teardown = () => {
    observer.disconnect();
    window.removeEventListener('resize', onWindowResize);
    live.scene?.dispose();
    live.scene = null;
    view.unmountCanvas();
  };

  const mount = ([{ createInkScene }]) => {
    const settings = sceneSettings({ width: window.innerWidth, dpr: window.devicePixelRatio });
    const canvas = document.createElement('canvas');
    live.scene = createInkScene({ canvas, dpr: settings.dpr, cards: settings.cards, onLabels: view.setLabels, onAnchors });
    live.compact = settings.compact;
    live.dpr = settings.dpr;
    view.mountCanvas(canvas);
    observer.observe(view.visual);
    window.addEventListener('resize', onWindowResize);
    resize();
    view.setMode(MODES.LIVE);
    playhead.snap();
  };

  return {
    playhead,
    start() {
      if (live.scene || live.failed) return;
      const token = ++live.token;
      loadScene()
        .then(async (modules) => {
          await modules[1].fontsReady(document); // the printed matter uses the page's faces
          if (token !== live.token || live.scene) return; // stopped (or restarted) meanwhile
          mount(modules);
        })
        .catch((error) => {
          live.failed = true;
          teardown();
          view.setMode(MODES.STILL);
          console.warn('[kaptan] ink scene unavailable', error);
        });
    },
    stop() {
      live.token += 1;
      playhead.sleep();
      teardown();
      if (!live.failed && view.mode === MODES.LIVE) view.setMode(MODES.LOADING);
    },
  };
}

/** Desktop fine pointers turn the view a little (a small orbit around the axis). */
function watchPointer(section, playhead) {
  const fine = window.matchMedia(FINE_POINTER);
  const { motion } = playhead;
  const onMove = (event) => {
    if (!fine.matches) return;
    motion.pointerTarget[0] = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1));
    motion.pointerTarget[1] = Math.max(-1, Math.min(1, 1 - (event.clientY / window.innerHeight) * 2));
    playhead.wake();
  };
  const onLeave = () => {
    motion.pointerTarget[0] = 0;
    motion.pointerTarget[1] = 0;
    playhead.wake();
  };
  section.addEventListener('pointermove', onMove, { passive: true });
  section.addEventListener('pointerleave', onLeave);
  return () => {
    section.removeEventListener('pointermove', onMove);
    section.removeEventListener('pointerleave', onLeave);
  };
}

/**
 * @param {{ section: HTMLElement | null }} options
 * @returns {{ destroy: () => void }}
 */
export function initCompass({ section }) {
  if (!section) return { destroy() {} };
  gsap.registerPlugin(ScrollTrigger);
  const view = createCompassView(section);
  // one viewport in pin units: the pre-roll and the exit each take that much scroll
  const scroll = { lead: LEAD, travel: 0, viewport: 0, compassX: null };
  const screen = { on: false };
  const stage = createStage(view, scroll, () => screen.on);
  const { playhead } = stage;
  const flags = { visible: false, isStatic: wantsStatic() };

  const showStatic = () => {
    view.setMode(MODES.STATIC);
    view.setProgress(1);
    view.setCount(poseAt(1).counter);
  };
  if (flags.isStatic) showStatic();
  else {
    view.setMode(MODES.LOADING);
    view.setProgress(0);
    view.setCount(poseAt(0).counter);
  }

  // The trigger spans the whole time the section is on screen; the pin runs 0 → 1 inside it.
  const measureScroll = () => {
    scroll.viewport = window.innerHeight;
    scroll.travel = section.offsetHeight - scroll.viewport;
    if (scroll.travel > 0) scroll.lead = scroll.viewport / scroll.travel;
    scroll.compassX = rotaStartX(section.clientWidth);
  };
  const setTarget = (self) => {
    if (flags.isStatic || !(scroll.travel > 0)) return;
    const { travel, viewport } = scroll;
    const target = (self.progress * (travel + 2 * viewport) - viewport) / travel;
    playhead.motion.target = target;
    if (!flags.visible) {
      // off screen: no easing to catch up on when it comes back
      playhead.motion.shown = target;
      return;
    }
    playhead.wake();
  };
  const trigger = ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: setTarget,
    onRefresh: (self) => {
      measureScroll();
      setTarget(self);
    },
  });

  const inRange = new IntersectionObserver(
    ([entry]) => {
      flags.visible = entry.isIntersecting;
      if (flags.visible && !flags.isStatic) {
        playhead.motion.shown = playhead.motion.target;
        stage.start();
        playhead.wake();
      } else if (!flags.visible) stage.stop();
    },
    { rootMargin: LIVE_MARGIN },
  );
  const reduce = window.matchMedia(REDUCE);
  const short = window.matchMedia(SHORT);
  const onMotionChange = () => {
    flags.isStatic = wantsStatic();
    if (flags.isStatic) {
      stage.stop();
      showStatic();
    } else {
      view.setMode(MODES.LOADING);
      if (flags.visible) stage.start();
    }
    ScrollTrigger.refresh(); // the section's height follows the mode
  };

  inRange.observe(section);
  // on screen proper (no margin): gates the idle life, and wakes it when the reader arrives
  const onScreen = new IntersectionObserver(([entry]) => {
    screen.on = entry.isIntersecting;
    if (screen.on && !flags.isStatic) playhead.wake();
  });
  onScreen.observe(section);
  reduce.addEventListener('change', onMotionChange);
  short.addEventListener('change', onMotionChange);
  const unwatchPointer = watchPointer(section, playhead);

  return {
    destroy() {
      trigger.kill();
      inRange.disconnect();
      onScreen.disconnect();
      reduce.removeEventListener('change', onMotionChange);
      short.removeEventListener('change', onMotionChange);
      unwatchPointer();
      stage.stop();
    },
  };
}
