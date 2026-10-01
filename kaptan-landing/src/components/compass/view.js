// DOM side of the ink scene: the mode flag the CSS reads, the act (strip, caption panels), the
// counter set as a sentence ("350 bildirim · bugün" → "1 öneri · insan onayına") on a paper tag
// that hangs in the scene, the docked act caption, the progress rail variable and the ring
// labels that hang off the drawn rings. No canvas, no scroll reading; box sizes are measured once
// per resize, and every write is skipped when nothing changed, so a frame touches the DOM only
// where it must.

import { BRIDGE, bridgePath, bridgeTip, dockBox, labelPull, tagBox, tagHook } from './layout.js';
import { PHASES, phaseAt } from './timeline.js';

const SAFE_GAP = 16; // free paper kept between a placed part and the title / the act rail
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The course's first leg (compass → Rota): one dashed ink path on the stage, over the scene and
 * under the hanging tag. Created on first use; `draw('')` hides it.
 */
function createBridge(stage) {
  let svg = null;
  let path = null;
  let shown = '';
  return {
    draw(d, width, height) {
      if (d === shown) return;
      shown = d;
      if (!svg && d && stage) {
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'pusula__bridge');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        path = document.createElementNS(SVG_NS, 'path');
        svg.append(path);
        stage.append(svg);
      }
      if (!svg) return;
      svg.setAttribute('viewBox', `0 0 ${Math.round(width)} ${Math.round(height)}`);
      path.setAttribute('d', d);
      svg.style.visibility = d ? 'visible' : 'hidden';
    },
    remove() {
      svg?.remove();
      svg = null;
      path = null;
      shown = '';
    },
  };
}

/** Writes translate3d only when the rounded position changed. */
function placer(el) {
  const shown = { x: NaN, y: NaN };
  return (x, y) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!el || (rx === shown.x && ry === shown.y)) return;
    shown.x = rx;
    shown.y = ry;
    el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
  };
}

/** Section modes (data-pusula): the CSS lays the stage out from these. */
export const MODES = Object.freeze({
  STATIC: 'static', // no scroll choreography: reduced motion or no script (short section, still image)
  LOADING: 'loading', // choreography on, canvas not drawn yet
  LIVE: 'live', // the canvas is live
  STILL: 'still', // choreography on, but no canvas (2D context failed): the still stands in
});

/** What the counter's unit says in each act; it reads on from the number as one sentence. */
export const COUNTER_UNITS = Object.freeze(['bildirim · bugün', 'bildirim · süzgeçte', 'öneri · insan onayına', 'yön · kanıtın gösterdiği']);

const formatCount = (n) => new Intl.NumberFormat('tr-TR').format(Math.max(0, Math.round(n)));

/**
 * @param {HTMLElement} section
 */
export function createCompassView(section) {
  const visual = section.querySelector('[data-pusula-visual]');
  const steps = [...section.querySelectorAll('[data-pusula-step]')];
  const acts = [...section.querySelectorAll('[data-pusula-act]')];
  const labels = [...section.querySelectorAll('[data-pusula-label]')];
  const count = section.querySelector('[data-pusula-count]');
  const unit = section.querySelector('[data-pusula-unit]');
  const tag = section.querySelector('[data-pusula-tag]');
  const dock = section.querySelector('[data-pusula-dock]');
  const title = section.querySelector('[data-pusula-title]');
  const rail = section.querySelector('[data-pusula-rail]');
  const placeTag = placer(tag);
  const placeDock = placer(dock);
  const bridge = createBridge(visual?.parentElement ?? null);
  let boxes = null; // measured sizes (CSS px, relative to the scene box)
  let shownExit = '';
  let shownPivot = '';
  const shownLabels = labels.map(() => ({ x: NaN, y: NaN, alpha: NaN, pull: 0 }));
  let labelFit = null; // label widths and the stage width, measured once per resize
  let phase = -1;
  let shownCount = null;
  let shownProgress = '';
  let canvas = null;

  // Box sizes, relative to the scene box (the visual covers the whole stage when it is live).
  function measure() {
    const origin = visual.getBoundingClientRect();
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const style = getComputedStyle(visual.parentElement ?? visual);
    const gutter = parseFloat(style.paddingLeft) || 0;
    const titleBox = rect(title);
    const railBox = rect(rail);
    const top = titleBox ? titleBox.bottom - origin.top + SAFE_GAP : SAFE_GAP;
    // on phones the caption sits in the flow above the rail: the scene ends where it begins
    const dockBox = dock && getComputedStyle(dock).position !== 'absolute' ? rect(dock) : null;
    const floor = Math.min(railBox?.top ?? origin.bottom, dockBox?.top ?? origin.bottom);
    const bottom = floor - origin.top - SAFE_GAP;
    const size = (el) => ({ width: el?.offsetWidth ?? 0, height: el?.offsetHeight ?? 0 });
    const safe = { left: gutter, right: origin.width - gutter, top, bottom };
    return {
      box: { width: origin.width, height: origin.height },
      tag: size(tag),
      dock: size(dock),
      safe,
      // the tag may rise beside the title (it hangs in the scene, right of the copy column)
      safeTag: { ...safe, top: Math.min(top, origin.height * 0.3) },
    };
  }

  const setPhase = (next) => {
    if (next === phase) return;
    phase = next;
    section.dataset.pusulaAct = PHASES[next].id;
    const mark = (el, i) => {
      el.dataset.active = String(i === next);
      el.dataset.done = String(i < next);
    };
    steps.forEach(mark);
    acts.forEach(mark);
    if (unit) unit.textContent = COUNTER_UNITS[Math.min(next, COUNTER_UNITS.length - 1)];
  };

  return {
    visual,
    phases: PHASES.length,
    get mode() {
      return section.dataset.pusula ?? MODES.STATIC;
    },
    setMode(mode) {
      section.dataset.pusula = mode;
    },
    /** @param {number} progress 0–1 */
    setProgress(progress) {
      const text = progress.toFixed(4);
      if (text !== shownProgress) {
        shownProgress = text;
        section.style.setProperty('--pusula-progress', text);
      }
      setPhase(phaseAt(progress));
    },
    /** @param {number} value  the counter (350 → 1) */
    setCount(value) {
      const text = formatCount(value);
      if (!count || text === shownCount) return;
      shownCount = text;
      count.textContent = text;
    },
    /** Ring labels: canvas-space anchor points (CSS px) and opacity, from the renderer. */
    setLabels(points) {
      if (!labelFit) labelFit = { box: visual?.clientWidth ?? 0, widths: labels.map((el) => el.offsetWidth) };
      labels.forEach((el, i) => {
        const point = points[i];
        if (!point) return;
        const prev = shownLabels[i];
        const pull = Math.round(labelPull(point.x, labelFit.widths[i], labelFit.box));
        const x = Math.round(point.x) - pull;
        const y = Math.round(point.y);
        const alpha = Math.round(point.alpha * 100) / 100;
        if (x !== prev.x || y !== prev.y) {
          el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          prev.x = x;
          prev.y = y;
        }
        if (pull !== prev.pull) {
          el.style.setProperty('--label-pull', `${pull}px`);
          prev.pull = pull;
        }
        if (alpha !== prev.alpha) {
          el.style.opacity = String(alpha);
          el.style.visibility = alpha > 0 ? 'visible' : 'hidden';
          prev.alpha = alpha;
        }
      });
    },
    /** Forget the measured boxes (after a resize, or a font swap). */
    remeasure() {
      boxes = null;
      labelFit = null;
    },
    /**
     * Hangs the counter tag and docks the act caption against the renderer's anchor points.
     * @param {import('./layout.js').Anchors} anchors
     * @param {{ focus: number, dock: { sieve: number, plate: number, compass: number } }} pose
     * @param {{ dock?: boolean, bridgeX?: number | null }} [options]  dock: false leaves the caption
     *   to the CSS (phones); bridgeX: stage x where Rota's course begins (null: no compass leg)
     */
    place(anchors, pose, { dock: docked = true, bridgeX = null } = {}) {
      if (!visual) return;
      if (!boxes) boxes = measure();
      // the compass pivot, for whatever continues from it (the Rota course), in stage px
      const pivot = `${Math.round(anchors.compass.x)},${Math.round(anchors.compass.y)}`;
      if (pivot !== shownPivot) {
        shownPivot = pivot;
        section.style.setProperty('--pusula-pivot-x', `${Math.round(anchors.compass.x)}px`);
        section.style.setProperty('--pusula-pivot-y', `${Math.round(anchors.compass.y)}px`);
      }
      const hook = tagHook(anchors, pose.dock);
      const at = tagBox(hook, boxes.tag, boxes.safeTag);
      if (Number.isFinite(bridgeX)) {
        const { width, height } = boxes.box;
        const rim = { x: anchors.compass.x, y: anchors.compass.y + anchors.compass.r + BRIDGE.gap };
        // the tag hangs on the line: the pen inks on past it, so the stroke is seen while pinned
        const under = rim.x >= at.x && rim.x <= at.x + boxes.tag.width;
        const floor = under ? at.y + boxes.tag.height + BRIDGE.past : 0;
        const tip = bridgeTip({ progress: pose.progress, exit: pose.exit, rimY: rim.y, height, floor });
        bridge.draw(bridgePath(rim, { x: bridgeX, y: height }, tip), width, height);
      } else bridge.draw('', 0, 0);
      placeTag(at.x, at.y);
      if (tag) tag.style.setProperty('--string', `${Math.max(0, Math.round(at.y - hook.y))}px`);
      if (docked) {
        const box = dockBox(anchors, { focus: pose.focus, ...pose.dock }, boxes.dock, boxes.safe, boxes.box);
        placeDock(box.x, box.y);
      }
    },
    /** @param {number} exit  0 → 1 as the section leaves (the scene lifts away with it) */
    setExit(exit) {
      const text = exit.toFixed(3);
      if (text === shownExit) return;
      shownExit = text;
      section.style.setProperty('--pusula-exit', text);
    },
    mountCanvas(next) {
      canvas?.remove();
      canvas = next;
      if (!next || !visual) return;
      next.className = 'pusula__canvas';
      next.setAttribute('aria-hidden', 'true');
      visual.prepend(next);
    },
    unmountCanvas() {
      canvas?.remove();
      canvas = null;
      bridge.remove();
    },
  };
}
