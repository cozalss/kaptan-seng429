# Agent scenes — live plates for the agent detail page

Each agent's detail page ("Bölüm 2 · Tayfa") can carry a small live plate under its text: an ink
diorama of the agent doing its one job, drawn in the book's language. The portrait stays the hero;
the plate is a figure in the margin — secondary, calm, exact.

## How it plugs in

```
service-modal.js ── createAgentScene({ host, agentId, reduced }) ──► index.js (runtime)
                                                                   └► registry.js ─► <agent>/index.js (lazy chunk)
```

- `createAgentScene({ host, agentId, reduced, win?, loaders? })` → `{ start, stop, destroy, ready }`,
  or `null` when the agent has no plate (or no 2D canvas exists). `null` means **show nothing** — the
  modal keeps the host hidden, never an empty frame.
- The runtime (`index.js`) builds the plate: the canvas and three HTML letters (`.agent-scene__pin`)
  in an `aria-hidden` stage, and a readable caption — the scene's one-sentence `summary` (visually
  hidden), "Canlı şema" and the a · b · c legend (13 px Inter, 16 px Bodoni keys). It loads the scene chunk and
  the fonts, sizes the canvas (DPR ≤ 2, ≤ 1.5 above 260 000 CSS px²), and runs a rAF loop **only**
  while started, on screen (IntersectionObserver) and the tab is visible. Its clock pauses with it
  and advances by at most 0.1 s a frame. `reduced: true` draws the scene's still once, never loops.
- **Letters in HTML** (`keys.js`): the runtime passes `create({ canvas, keys })` a `Float32Array(9)`.
  A scene still draws each letter's hairline leader, then calls `placeKey(keys, 'a', x, y, alpha)`
  instead of `fillText`; after every frame the runtime moves the HTML letters there (kept 14 px inside
  the frame). Without `keys` (tests) the scene inks the letters itself.
- **Line weight** (`ink-weight.js`): the plate's own 2D context gets a `lineWidth` accessor that
  weights every stroke by `inkWeightFor(plateWidth)` (1 up to 460 CSS px, ≤ 1.4), so the hairlines
  hold their weight at portrait size. Scenes keep setting widths in CSS px as before.
- The modal starts the plate from the detail reveal (`service-modal-reveal.js`): the host inks in
  0.62 s after the type starts setting (after the description lines rise) and `onSceneIn` starts it.
  Switching agents on an open page swaps the plate and starts it at once. Close → `stop()`, then
  `destroy()` once the page has turned away (`CLOSE_DURATION_MS`).
- Register a new scene in `registry.js` (`SCENE_LOADERS[agentId] = () => import('./<id>/index.js')`).

### Scene module contract (`<agent>/index.js`, default export)

```js
export default {
  id: 'okuyucu',
  legend: [{ key: 'a', text: '…' }, { key: 'b', text: '…' }, { key: 'c', text: '…' }],
  summary: 'Canlı şema: …',       // ONE sentence, the plate's text alternative; facts only
  description: 'Canlı şema: …',   // the longer account (kept for docs and tests)
  stillElapsed: 12.3,                     // the frame printed for prefers-reduced-motion
  create({ canvas, keys }) {              // throw if canvas.getContext('2d') is null; keys: see above
    return { setSize(cssW, cssH, dpr) {}, render(elapsedSeconds) {}, dispose() {} };
  },
};
```

Split each scene like `siniflandirici/`: `model.js` (pure timeline: `createFrameState()` +
`frameAt(elapsed, state)` rewriting preallocated state; unit-tested — loop seam, stage order,
counts), `world.js` (pure world layout and placement), `sprites.js` (printed matter inked once),
`render.js` (Canvas 2D draw, no per-frame allocation) and `index.js`.

### Shared library (`src/lib/ink3d/`)

| Module | What |
|---|---|
| `camera.js` | pinhole camera: `createFrame`, `aimFrame` (orbit), `project` → [x, y, depth, px per unit] |
| `quad.js` | `writeQuadAffine` (world quad → canvas affine for a [-1,1]² sprite), `writeCardTransform` |
| `ink.js` | `INK` colours, `inkLine`/`inkRect` (seeded, for sprites), `brushRibbon`, `noise1`, `makeCanvas` |
| `paths.js` | per-frame lines that keep their kinks: `stillLine`, `stillOutline`, `polyPath`, `facesEye` |
| `grain.js` | `drawPaperGrain` — rice-paper fibres laid over each frame |
| `random.js` | `seededRandom` (mulberry32) |

The Pusula interlude (`src/components/compass/`) uses the same modules (re-exported there).

## Style rules (the award bar)

- **Book, not app.** Sumi line work on rice paper; flat indigo washes (`#2a4c8c` and its darker
  tints) for shade; dry-brush hatching for turned faces. No gradients as decoration, no glow, no neon,
  no drop blur, no bevels, no default 3D-app lighting. Hard shapes, hand-ruled edges (`stillLine`).
- **One north-red mark at most** (`INK.north`) — and only if it means something (Sınıflandırıcı:
  the portrait's E4 bookmark ribbon). Stamps are indigo.
- **Type:** Bodoni Moda Display for printed titles and the plate's letters (a · b · c), Inter for
  small print, mono **only** for rule codes (E1–E4, R01–R16). Sentence case, no tracked caps.
- **Facts only** (KAPTAN-BRIEF.md §0). Every document is fictional, shown plainly: issuers
  "ÖRNEK … A.Ş.", no qualifier labels on the paper or in the caption. No real company, price, signal or
  logo; nothing that imitates KAP, Borsa İstanbul or SPK. Never show an order being placed — the
  AI reads and collects evidence, rules decide, a human approves.
- **Motion with meaning.** One legible action per few seconds, calm pace, a seamless loop (state
  is a pure function of loop time; counters are ruled off and wiped rather than reset). Let the
  camera breathe once per loop at most. Echo the agent's portrait (its props, its locker, its tools).
- **Budget.** Canvas 2D only (the page's single WebGL slot is the hero sea). Allocate every buffer
  once; draw ≤ 1 ms per frame on a laptop (at 702 × 468 CSS px, 1440 × 900: 0.38–0.95 ms avg, all
  eight). Printed matter inside the drawing legible ≥ 8 CSS px; the letters and legend are HTML ≥ 12 px.
- **Style bridge.** The plates belong to the portraits' book: the key props' turned faces carry the
  portraits' mid indigo wash (`#a4b0be`, fronts `#dde2e8`), one or two props a flat `#2a4c8c`
  (slots, masks, hulls, lantern), and the line weight scales with the plate (above).
- **Layout.** One aspect for all eight: **3:2**, on every screen. On desktop the detail is a spread
  of two co-equal figures — the portrait on the left, the type over the plate on the right; the plate
  takes what the type leaves of the page's height (a size container) and is ≈ 49 % of the page width
  at 1440 × 900. Frame each world for 3:2 by `min(h / spanY, w / spanX)`; nothing may cross the
  frame unless it is meant to run on (Önemlilik's boom, Risk Kapısı's canal, Uyum's lantern cord).

## Concepts for the remaining seven

**Okuyucu** (girdi: bildirim metni · çıktı: tutar, karşı taraf, süre). One fictional disclosure
lies open on a slanted reading desk, its free text as ruled ink lines. A reading rule travels down
it; where it finds a value, that phrase lifts off the page as a small paper tag and flies on a
dashed course to a ruled form beside the desk with exactly three fields — *Tutar*, *Karşı taraf*,
*Süre* — where it is pinned in place. The form fills, is set aside onto a short stack, the next
page turns. The ratio column on the form stays empty and struck through: Okuyucu does not compute
ratios (the birleştirme düğümü does). Letters: a metin · b alan · c form.

**Önemlilik** (girdi: şirket · çıktı: finansallar, piyasa değeri). A balance scale of the ship's
purser. Okuyucu's tag with the amount (a small brass weight marked "Tutar") is set on the left pan;
Önemlilik brings in the company's ledgers — a stack of books labelled *Yıllık gelir* and *Piyasa
değeri* — onto the right pan. The beam settles to a ratio the plate shows only as a tilt and a pointer
on an ink dial; the threshold line on the dial is drawn by a different, ruled hand (the rules) and
Önemlilik's pointer never touches it: it weighs, it does not decide.

**Kanıt** (girdi: olay · çıktı: benzer geçmiş olaylar). A card-catalogue chest (the event memory).
Drawers slide out; index cards of past similar events rise, each with its lower half — the later
return — covered by an opaque indigo paper mask. Kanıt picks cards by their headings only and lays
them in a row; after the choice, a separate mechanical counter (code) lifts the masks and tallies the
statistics. The order matters and is shown: choose first, uncover later, never the other way.

**Şüpheci** (girdi: taslak öneri · çıktı: küçült / veto). A draft proposal slip on a board with a
size bar. Şüpheci sweeps it with a loupe: in one loop it finds a price chart already up before the
disclosure (sızıntı) and in another a puffed-up phrase (abartı) — each circled in ink. Found → the
size bar is cut down by a ruled line (küçült) or the slip gets a diagonal strike (veto). Nothing ever
grows: a ghosted "büyüt" arrow is drawn and struck out once per loop, the plate's joke.

**Uyum** (girdi: bildirim, şirket · çıktı: tedbir ve injection bayrağı). A customs inspector's
lightbox. Disclosures pass over it one by one; the light shows two things: an SPK measure stamp on the
company file, and — in one slip per loop — a hidden instruction written in pale ink between the lines
("…talimat…", illegible by design, never a real prompt). Uyum flags it and drops the slip through a
grille into a sealed box; a small counter beside the box reads "Emir: 0" throughout, because a
malicious disclosure yields no order.

**Kural Motoru** (girdi: yapılandırılmış kanıt · çıktı: E1–E4 kararı). A brass-and-paper
Jacquard-like sorter: punched cards (the structured evidence) feed through four fixed gates marked
E1–E4 in mono, each with its written threshold on a plaque (e.g. E1 "10 seansta ≥ %0,25"). The same
card is fed twice per loop and comes out through the same gate both times, the two outputs drawn side
by side and identical — same input, same decision. No LLM, no dice: nothing in the plate moves by
chance.

**Risk Kapısı** (girdi: öneri · çıktı: aynen / küçült / reddet). A lock gate on the canal with
sixteen numbered bollards R01–R16. A proposal barge enters; each rule it passes may lower its load line
(küçült) — never raise it; one barge per loop is turned back (reddet). Above the gate hangs a big
lever marked "Kill switch", drawn with its rule (zirveden −%5 → açık emirler iptal, pozisyon
satılmaz); once per long loop it is thrown and the barges in the queue are unmoored, while the barges
already in harbour stay tied up.
