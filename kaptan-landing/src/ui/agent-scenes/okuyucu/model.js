// Okuyucu — the plate's timeline, as pure functions of the clock. Three fictional disclosures
// (a loop of three pages) are read in turn on a slanted reading desk. A reading rule travels down
// the page; where it finds a value it stops, the phrase is underlined, lifts off as a small paper
// tag and flies on a dashed course to the ruled form beside the desk, where it is pinned into its
// field — Tutar, Karşı taraf, Süre. The filled form is set aside onto a short stack, a blank one is
// put up and the continuous paper feeds the next page in. The form's "Oran" row stays empty and
// struck through: Okuyucu does not compute ratios. Nothing here touches the DOM: `frameAt(t, state)`
// rewrites a preallocated state object that the renderer draws.

export const TAU = Math.PI * 2;

/** The form's three fields, in reading order (a disclosure gives them in this order, too). */
export const FIELDS = Object.freeze([
  Object.freeze({ id: 'tutar', label: 'Tutar' }),
  Object.freeze({ id: 'karsi', label: 'Karşı taraf' }),
  Object.freeze({ id: 'sure', label: 'Süre' }),
]);

/** The pages read in one loop (fictional, "Temsili"): the issuer, a title and the three values. */
export const CAST = Object.freeze(
  [
    { issuer: 'ÖRNEK ENERJİ A.Ş.', title: 'Yeni iş ilişkisi', values: ['48,6 milyon TL', 'ÖRNEK ALTYAPI A.Ş.', '18 ay'] },
    { issuer: 'ÖRNEK LOJİSTİK A.Ş.', title: 'İhale sonucu', values: ['12,3 milyon TL', 'ÖRNEK LİMAN A.Ş.', '24 ay'] },
    { issuer: 'ÖRNEK GIDA A.Ş.', title: 'Tedarik sözleşmesi', values: ['7,9 milyon TL', 'ÖRNEK TARIM A.Ş.', '36 ay'] },
  ].map((page, i) => Object.freeze({ ...page, values: Object.freeze(page.values), index: i })),
);

/** Seconds of a page's local clock u (0 = the page starts feeding in). */
export const TIMING = Object.freeze({
  page: 10, // one page every 10 s
  feed: 0.9, // the continuous paper advances one page
  ruleFrom: 0.9, // the reading rule appears at the top of the page
  find: Object.freeze([1.9, 3.7, 5.5]), // the rule reaches each value
  hold: 0.5, // and rests on it this long
  ruleTo: 6.5, // reaches the foot of the page
  underline: 0.3, // the found phrase is underlined
  liftAt: 0.35, // after find: the phrase lifts off as a tag
  lift: 0.3, // rising off the page
  flight: 1.0, // on its course to the form
  pin: 0.25, // pressed into its field
  red: 0.95, // after find: how long the found mark stays north red
  asideAt: 7.8, // the filled form is set aside
  aside: 1.0,
  blankAt: 8.9, // a blank form is put up
  blank: 0.6,
  intro: 1.6, // the plate inks in on first sight
  start: 0.6, // page clock shown at elapsed 0
});

export const LOOP = CAST.length * TIMING.page;

/** Rule stops: the page-space y (−1 top … 1 foot, y down) of each value's line. */
export const VALUE_ROWS = Object.freeze([-0.06, 0.32, 0.7]);
const RULE_TOP = -0.94;
const RULE_FOOT = 0.96;

/** Where a value's tag is pinned on the form: lift → flight → pinned. */
export const pinAt = (field) => TIMING.find[field] + TIMING.liftAt + TIMING.lift + TIMING.flight;

/** A still worth printing (reduced motion): Tutar pinned, Karşı taraf halfway along its course. */
export const STILL_ELAPSED = 4.85 - TIMING.start;

export const TAG = Object.freeze({ hidden: 0, lift: 1, flight: 2, pinned: 3 });

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const span = (x, a, b) => clamp01((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Positive modulo. */
export const wrap = (x, m) => ((x % m) + m) % m;

/** The reading rule's page-space y at page clock u (it rests on each value it finds). */
export function rulePosition(u) {
  const { find, hold, ruleFrom, ruleTo } = TIMING;
  if (u <= ruleFrom) return RULE_TOP;
  let fromT = ruleFrom;
  let fromY = RULE_TOP;
  for (let i = 0; i < find.length; i += 1) {
    if (u < find[i]) return fromY + (VALUE_ROWS[i] - fromY) * smooth(span(u, fromT, find[i]));
    if (u < find[i] + hold) return VALUE_ROWS[i];
    fromT = find[i] + hold;
    fromY = VALUE_ROWS[i];
  }
  return fromY + (RULE_FOOT - fromY) * smooth(span(u, fromT, ruleTo));
}

function createTagState() {
  return { stage: TAG.hidden, lift: 0, fly: 0, pin: 0, u: 0 };
}

function createSpotState() {
  return { underline: 0, red: 0, ghost: 0 };
}

/** Everything the renderer needs for one frame; allocate once, rewrite with frameAt. */
export function createFrameState() {
  return {
    t: 0,
    elapsed: 0,
    intro: 1,
    u: 0,
    camera: { yaw: 0, pitch: 0 },
    page: 0, // the page on the desk (CAST index)
    feed: 1, // 0 → 1 while it feeds in (the page before leaves over the top)
    rule: { y: RULE_TOP, alpha: 0 },
    spots: FIELDS.map(createSpotState),
    tags: FIELDS.map(createTagState),
    form: { page: 0, aside: 0, onBoard: true, blank: 0, blankPage: 1, stackTop: 2 },
  };
}

function writeTag(tag, field, u) {
  const lift = TIMING.find[field] + TIMING.liftAt;
  const fly = lift + TIMING.lift;
  const pin = fly + TIMING.flight;
  tag.u = u;
  tag.lift = 0;
  tag.fly = 0;
  tag.pin = 0;
  if (u < lift) {
    tag.stage = TAG.hidden;
    return;
  }
  tag.lift = smooth(span(u, lift, fly));
  if (u < fly) {
    tag.stage = TAG.lift;
    return;
  }
  tag.lift = 1;
  tag.fly = easeInOut(span(u, fly, pin));
  if (u < pin) {
    tag.stage = TAG.flight;
    return;
  }
  tag.fly = 1;
  tag.stage = TAG.pinned;
  tag.pin = span(u, pin, pin + TIMING.pin);
}

function writeSpot(spot, field, u) {
  const find = TIMING.find[field];
  spot.underline = smooth(span(u, find, find + TIMING.underline));
  // north red while it is the value in hand, then the ink settles to indigo
  spot.red = u < find ? 0 : 1 - smooth(span(u, find + TIMING.red - 0.25, find + TIMING.red));
  // where the phrase lifted off, a faint ruled box is left on the page
  spot.ghost = smooth(span(u, find + TIMING.liftAt, find + TIMING.liftAt + TIMING.lift));
}

/**
 * The frame at `elapsed` seconds since the plate was first shown.
 * @param {number} elapsed
 * @param {ReturnType<typeof createFrameState>} state
 */
export function frameAt(elapsed, state = createFrameState()) {
  const t = wrap(elapsed + TIMING.start, LOOP);
  const page = Math.min(CAST.length - 1, Math.floor(t / TIMING.page));
  const u = t - page * TIMING.page;
  const n = CAST.length;
  state.t = t;
  state.elapsed = elapsed;
  state.u = u;
  state.intro = smooth(span(elapsed, 0, TIMING.intro));
  // The camera breathes once per loop, so the seam stays invisible.
  state.camera.yaw = 0.04 * Math.sin((TAU * t) / LOOP);
  state.camera.pitch = 0.014 * Math.sin((2 * TAU * t) / LOOP);
  state.page = page;
  state.feed = smooth(span(u, 0, TIMING.feed));
  state.rule.y = rulePosition(u);
  state.rule.alpha = span(u, TIMING.ruleFrom, TIMING.ruleFrom + 0.25) * (1 - span(u, TIMING.ruleTo, TIMING.ruleTo + 0.3));
  for (let f = 0; f < FIELDS.length; f += 1) {
    writeSpot(state.spots[f], f, u);
    writeTag(state.tags[f], f, u);
  }
  const form = state.form;
  form.page = page;
  form.aside = easeInOut(span(u, TIMING.asideAt, TIMING.asideAt + TIMING.aside));
  form.onBoard = u < TIMING.asideAt;
  form.blank = smooth(span(u, TIMING.blankAt, TIMING.blankAt + TIMING.blank));
  form.blankPage = (page + 1) % n;
  form.stackTop = u >= TIMING.asideAt + TIMING.aside ? page : (page + n - 1) % n;
  return state;
}
