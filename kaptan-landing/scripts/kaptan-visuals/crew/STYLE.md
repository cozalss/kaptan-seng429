# Crew portraits — ink style

Eight crew members on the boat crossing the storm of disclosures, one per agent card
(`ajan-N`). Plates 1–2 are done (`crew-1.mjs` Sınıflandırıcı, `crew-2.mjs` Okuyucu); draw 3–8
the same way. Reference: Matt Huynh's sumi-e ink in SBS "The Boat" — confident brush contours,
flat washes, paper left bare, one focal prop, economical faces.

## Rules

- **Plate:** 1200 × 1600 (3:4), drawn half-length (head to waist). Top of the head (cap included)
  ≈ y 190–240, the figure is cut at the waist by the caption strip (`FRAME.waist` = 1462).
  Horizon at 62 % (`FRAME.horizon` = 992). `crewPlate()` supplies paper, sky, sea, rail and
  caption — never redraw those.
- **Sky (one rule for the series):** `crewPlate` lays two wet storm sweeps and the rain. The high
  sweep enters from the side the sailor faces (`storm: 'left' | 'right'`) and dies out behind the
  head; the low one enters from the other edge at shoulder height. Plates never add sky strokes,
  clouds or rain of their own.
- **Palette only:** `PAPER` #F3F1EC, `INK` #121318, `INDIGO` rgb(43,66,97) at varying opacity,
  `RED` #B3261E for **at most one tiny accent** (a pencil line, a pennant tip). No other colours,
  no gradients on the figure.
- **Values:** skin and hands are bare paper. Clothing is either a sumi mass (`sumi()`, ink or
  dark indigo) or a flat indigo wash (≈ 0.5–0.65) with hard paper highlights. Give every figure
  one dark mass (cap, sweater, collar) so it reads at 400 px.
- **Light:** one direction per plate; a single `wash()` (≈ 0.25–0.3) on the shadow plane of the
  face (cheek toward the ear, under nose, under chin). No modelling beyond that.
- **Line:** contours are `brush()` strokes, thick where the form turns away (jaw, under the arm,
  shadow-side body edge: 8–12 units), thin in the light (2.5–4) and broken by small gaps where the
  light hits. The brush swells and thins about every 110 units by itself (seeded pressure).
  Never an even outline round every shape. Features: eyes as one lid stroke + iris blob, brows as
  short strokes or one tapered stroke, nose as one side contour + wing, mouth as the parting
  line + a shadow under the lower lip. No outlines around every shape; no emoji dots.
- **Faces:** 3/4 views read best. Head ≈ 400 units crown–chin including the cap, face width
  ≈ 0.65–0.8 of that. Keep lips ~12 units behind the nose tip in profile. Age via wrinkles
  (bags, nasolabial fold, crow's feet), grey hair as strokes on paper, not solid ink.
- **Hands:** use `hands.mjs` and `place()`. A hand is ~215 units wrist→fingertip at scale 1;
  use scale 0.9–1.2 (a hand ≈ the face's height). Foreshorten with `scale: [along, across]`.
- **Props:** one focal prop, big enough to read at 400 px, drawn crisply (flags, paper, brass)
  with `straight: true` edges for ruled objects. Text on props: tiny Inter labels only
  (fictional, "Temsili" rules of KAPTAN-BRIEF.md — no real brands, names or prices).
- **Cast:** Turkish crew, modern: knit caps, oilskins, sweaters. **No captain's cap** — the
  captain is the human who approves and is never shown. Vary age, gender and build across 1–8
  (done: 01 young woman, beanie + oilskin; 02 old man, watch cap + cable sweater + spectacles).
- **Determinism:** randomness only through the `r` passed to `draw(r)` (seeded by `crewPlate`)
  or `rng()` from `../kit.mjs`. Never `Math.random()`.
- **Budget:** plate SVG < 400 KB (plates 1–2 are ~300 KB). `stipple` and `hatch` are the
  expensive helpers; keep counts low.

## Workflow

1. Copy `crew-2.mjs` (simplest structure) to `crew-N.mjs`, set `n`, `title`, `seed` (0x0b0N),
   `detail` (the detail crop: `x`, `y` as fractions of the plate, `zoom` 1.45–1.8 — frame the
   face **and** the prop), `railY` and optionally `boat: [x, scale]`.
2. `draw(r)` returns `{ back, figure, front, noRail }`: `back` sits over sea and rail (e.g. a
   locker behind the figure), `figure` is wrapped in the rough-ink filter, `front` stays crisp.
   Draw back-to-front: paper silhouette → clothing → head → props → arms → hands.
3. Wire it in `../agents.mjs`: `import CREW_N from './crew/crew-N.mjs'` and replace entry N with
   `crewPlate(CREW_N)`. Build: `npm run visuals -- --only=ajan-N` (add `--svg` to keep the SVG
   in `.qa/visuals/svg`).
4. Look at `ajan-N-400.jpg` and `ajan-N-detail-400.jpg`. At 400 px the face, hands and prop must
   read; redraw until they do.

## Helper API (`style.mjs`)

| Helper | Use |
|---|---|
| `crewPlate({ n, title, seed, detail, draw, boat, railY, storm })` | Assemble a plate → `{ title, detail, body, svg }` (`svg` is the exact document the pipeline renders). |
| `brush(pts, { w, taper, tip, r, wobble, fill, opacity, straight })` | Variable-width stroke as a filled path. `w` is a number or one width per control point; `taper: [start, end]` fractions; `straight` for ruled edges. |
| `strokes(list, opts)` | Many brush strokes with the same options (brows, ribs, folds). |
| `mass(pts, { fill, opacity, sharp })` | Flat smooth (or `sharp` polygon) shape: paper silhouettes, ink masses. |
| `sumi(pts, { angle, base, fill, coarse })` | Loaded-brush fill: paper + ink body + dry streaks along `angle`. Caps, sweaters, hair, collars. |
| `wash(pts, { color, opacity, edge, sharp })` | Bled indigo wash with a pooled rim. Shadows, table tops, water. |
| `dry(inner, angle, coarse)` | Dry-brush filter on any group (streaks along `angle`). |
| `hatch(clipPathD, { box, angle, gap, w, r, opacity })` | Hand-ruled hatching clipped to a shape; call twice for cross-hatch. |
| `stipple(cx, cy, rx, ry, count, r, opts)` | Ink dots in an ellipse (rust, texture). Use sparingly. |
| `sleeve(r, elbow, wrist, { w0, w1, sheen, cuff, fill, base, texture, gap })` | Forearm/upper arm with sheen and ribbed cuff; `texture:false` for oilskin; `gap:true` separates a dark sleeve from a dark body. |
| `place(inner, { origin, angle, scale, mirror })` | Put a local-frame drawing (hands, props) on the plate. |
| `curve(pts)`, `poly(pts)`, `sample(pts)`, `g(inner, attrs)`, `rough(inner)` | Path data and grouping primitives. |
| `sky`, `sea`, `rail`, `paperGround`, `captionStrip`, `crewDefs` | Used by `crewPlate`; no need to call directly. |
| `FRAME`, `CARD`, `PAPER`, `INK`, `INDIGO`, `RED` | Framing and palette constants. |

## Hands (`hands.mjs`)

All in a local frame, thumb side toward −y; toggle `mirror` if the thumb lands on the wrong side.

- `flatHand(r)` — back of the hand, fingers together; wrist at (0, 0), fingertips at +x ≈ 218.
- `pointingHand(r)` — index finger out; **fingertip** at (0, 0), wrist toward +x ≈ 214.
- `gripHand(r)` — fist round a bar along the y axis at x = 0 (draw the bar first); wrist at +x.

## Known pitfalls

- Never put `crew-rough` (feDisplacementMap) on something touching the canvas edge: librsvg
  leaks transparent pixels there (the caption strip is unfiltered for this reason).
- Filters use bounding-box regions; a plate-sized filter region per element made renders take
  70 s instead of ~12 s.
- `curve()` is Catmull-Rom: it overshoots on sharp corners — use `sharp: true` / `straight: true`
  for boards, flags and paper.
