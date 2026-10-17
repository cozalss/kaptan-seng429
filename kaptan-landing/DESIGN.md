---
version: book-1
name: KAPtan-landing-design-system
description: The KAPtan landing page as a graphic novel printed on rice paper (after SBS "The Boat"). Sumi ink and an indigo wash on warm paper, Bodoni Moda Display capitals for titles, Inter in sentence case for everything else, comic caption panels with an ink border and a hard offset shadow, square corners everywhere. North red is spent on three marks only; kaptan navy is the second ink (wordmark, focus, selection, the active choice, focal numbers). Projector-proof: every value survives a washed-out classroom projector (§2.1).

colors:
  paper: "#F3F1EC"          # --color-paper / --color-canvas: every page and overlay
  paper-panel: "#FFFEFA"    # --color-paper-panel: caption panels, ink buttons, modal sheets (was #FBFAF6)
  sumi: "#121318"           # --color-sumi / --color-ink: type, ink lines, hard shadows
  wash: "#2A4C8C"           # --color-wash: deep indigo wash (sea, hover fill, agent-detail scrim; was #2B4261)
  muted: "#45433E"          # --color-muted: meta lines, inactive choices, "· yakında" (8.8:1; was #666663)
  rule-soft: "rgb(18 19 24 / 0.6)"
  hairline: "rgb(18 19 24 / 0.34)"
  scrim: "rgb(243 241 236 / 0.72)"
  north: "#B3261E"          # needle, boat flag, the one ONAYLANDI stamp
  brand: "#0C2F63"          # kaptan navy, the second ink: wordmark, focus, selection, active choice, focal numbers (was #0E3A66)
  sea-ink: "#09102A"        # SEA_COLORS.ink: the hero sea's navy-black (never UI)
  on-brand: "#FFFFFF"

typography:
  display:   { fontFamily: "Bodoni Moda Display", weight: 400, case: uppercase, lineHeight: 0.9, letterSpacing: -0.012em }
  title-leading: 0.9          # --title-leading
  title-mark-room: 0.12em     # --title-mark-room: room under line 1 where Turkish marks would touch (lib/title-marks.js)
  chapter:   { size: "min(12vw, 20vh)", indent: 1.05em }
  hero:      { size: "min(15vw, 25vh)", indent: 1.05em }
  caption-panel: { fontFamily: "Bodoni Moda Display", size: "clamp(21px, 1.8vw, 28px)", lineHeight: 1.2, case: sentence }
  bodoni-stroke: "clamp(0.35px, 0.02em, 2.2px)"   # --bodoni-stroke on every Bodoni setting (projector rule)
  running-head:  { fontFamily: Inter, size: 14px, numerals: tabular }   # left slot: live folio, never the wordmark
  ui-minimum:    12px          # no visible UI text below this
  body-lg:   { fontFamily: Inter, size: "clamp(17px, 1.39vw, 22px)" }
  body-md:   { fontFamily: Inter, size: 16px, lineHeight: 1.375, letterSpacing: -0.01em }
  button:    { fontFamily: Inter, size: 14px, weight: 500 }
  rule-code: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", size: "max(12px, 0.86em)", letterSpacing: 0 }
  wordmark:  { fontFamily: "Bodoni Moda", weight: 700, size: "38 (212×64 viewBox)" }

ink:
  line: 2px
  border: "2px solid sumi"
  rule: 2px                 # running heads, header rule, structural borders
  shadow-panel: "5px 5px 0 sumi"
  shadow-panel-lg: "7px 7px 0 sumi"
  art-print: "contrast(1.2) saturate(1.35) brightness(0.97)"   # --art-print on raster plates
  radius: 0

spacing: { xxs: 4px, xs: 8px, sm: 12px, md: 16px, lg: 24px, xl: 32px, xxl: 48px, section: 96px, gutter: 48px, gutter-mobile: 20px, header: 80px, header-mobile: 64px, gutter-panel: 14px }

motion:
  ease-out-expo: "cubic-bezier(0.16, 1, 0.3, 1)"
  duration: { fast: 200ms, normal: 300ms, overlay: 450ms, slow: 600ms }
---

# KAPtan — Design System (as built)

**Who this is for.** The four people maintaining the KAPtan landing page (SENG 429, Çankaya
Üniversitesi, Güz 2026). You know HTML/CSS/JS; this file tells you what the page *is*, which rules
keep it coherent, and where each piece lives. Project facts (agents, rules, dates, disclaimers) live
in `KAPTAN-BRIEF.md` §0, `src/config/site.js` and `src/data/*` — never invent new ones here or in
markup.

The YAML block above mirrors `src/styles/tokens.css`. Change both together.

---

## 1. Concept: a graphic novel on rice paper

The page is one printed book, drawn in sumi ink after Matt Huynh's sumi-e artwork for SBS
*"The Boat"*: a small boat in a storm of ~350 daily disclosures; a crew of agents that read; rules
that steer; a human who signs. The boat, the compass and the ink sea recur from the first page to the
last.

| Chapter | Running head | `id` | What happens |
|---|---|---|---|
| Bölüm 1 · Fırtına | masthead in the hero | `#hero` | "Kanıt / önce." over a live ink sea (WebGL); the boat rides the swell, three caption panels tell the story, the compass needle locks north. |
| Bölüm 2 · Tayfa | `.running-head` | `#ajanlar` | "Sekiz kişilik / tayfa.": the eight agents as a horizontal comic strip, closing on a double-page chart spread whose leaf turns and whose course is inked. Each panel opens the agent detail page. |
| Bölüm 3 · Seyir Kuralları | `.running-head` | `#olaylar` | "Dört olay. / Yalnızca alım.": the **Sancak Tezgâhı** (signal bench). E1–E4 are the ship's articles (static text, always readable); each has a hands-on instrument in one shared slot (ledger, disclosure, balance, slider; plus the leak filter and the pre-screen gates), and when a rule fires its pennant runs up an inked mast. Filters can only lower a pennant. Wide screens with full motion pin the chapter and let the scroll walk E1 → E4 → filters. |
| Ara · 350'den 1'e | `.running-head` | `#pusula` | "350 bildirim. / Tek yön." (`.chapter-title`, sentence case in the markup): a scroll-scrubbed, full-bleed Canvas 2D ink scene — slips funnel through three rings, one is stamped, a compass inks itself and locks north. |
| Bölüm 4 · Rota | `.running-head` | `#yolculuk` | "Bir bildirimin / rotası.": a dotted course through four waypoints (Yakala · Anla · Kanıtla · Onayla); the boat sails it over an inked sea. |
| Kolofon | `.running-head` | `#kolofon` (footer) | Colophon: what KAPtan is, course facts, crew roles, links, legal line, "— Son —", the mark. |

The header's "İçindekiler" drawer (`src/ui/menu-drawer.js`, `SECTION_LINKS`) lists exactly these
chapters. If you add, rename or reorder a chapter, update the running head, the menu and this table.

Bölüm 5 · Liman (`#demo`) was removed: the course facts live in the colophon, the final's date in
the "Altı adımda" drawer. Nothing links to `#demo` any more.

**Content rules** (unchanged, from `KAPTAN-BRIEF.md` §0): all copy Turkish, calm, specific;
`lang="tr"`; fictional documents only ("ÖRNEK ENERJİ A.Ş." / "ORNEK"), shown plainly: no "Temsili", "Kurgusal", "Demo" or "Sanal para" labels or disclaimers anywhere in the visible copy, alt text, captions or canvas text; never
imitate KAP, Borsa İstanbul or SPK; "Yatırım tavsiyesi değildir." in the
Bölüm 3 footnote, the colophon and the legal modal; no forms, no personal data; say who decides
(rules) and who approves (a human); every chapter carries one plain sentence saying what it means for the project.

---

## 2. Tokens (`src/styles/tokens.css`)

### Colour — every colour has one job

| Token | Value | Its only job |
|---|---|---|
| `--color-paper` (= `--color-canvas`) | #F3F1EC | The page, every section, drawers. `<meta name="color-scheme" content="light only">` stops auto-dark from inverting it. |
| `--color-paper-panel` | #FFFEFA | A brighter sheet laid on the page: caption panels, ink buttons, modal sheets, plates. |
| `--color-sumi` (= `--color-ink`) | #121318 | Type, ink lines, borders, hard shadows. |
| `--color-wash` | #2A4C8C | The deep indigo wash: the sea, `.pill` hover fill, the scrim behind the agent detail, instrument washes. Same value as `SEA_COLORS.indigo` (`sea-renderer.js`), `INK.indigo` (`lib/ink3d/ink.js`) and `WASH_COLOR` (`rota-sea-render.js`). The sea's darkest ink is a navy-black (`SEA_COLORS.ink` #09102A), so the storm reads as deep blue ink, not grey. |
| `--color-muted` | #45433E | Meta lines (`.caption-panel__meta`), inactive choices, "· yakında" links. Near-ink (8.8:1): a state is never told by a pale grey alone. |
| `--color-rule-soft`, `--color-hairline` | sumi at 28 % / 14 % | Secondary rules and dividers. |
| `--color-scrim` | paper at 72 % | Veil under drawers and modals. |
| `--color-north` | #B3261E | **Only** the compass needle's north half (loader, hero compass, Pusula scene), the boat's flag (hero, chart spread, Rota), and the single ONAYLANDI stamp in the Pusula scene (`compass/sprites.js`). Never UI chrome, never text. |
| `--color-brand` "kaptan laciverti" | #0C2F63 | The second ink, only where it means something: the wordmark (`#kaptan-logo` via `currentColor`), the 3px focus ring, `::selection`, the **active choice** (the chosen rule in Seyir Kuralları and its underline, the current Pusula act and its bar, the running head's "Bölüm N", the current folio tick) and **focal numbers** (the Pusula counter, the hero caption's clock). Not body text, not buttons, not chapter titles. |

Contrast notes kept in `tokens.css`: brand 11.6:1 on paper; muted 8.8:1; wash 7.4:1 with paper text. The header over the hero
sea sits on a paper scrim gradient sized to keep text ≥ 4.5:1 (`header.css`).

Illustrations follow the same economy: crew plates may carry *at most one tiny* north-red accent
(`crew/STYLE.md`); agent scenes at most one north-red mark (`SCENES.md`); the demo storyboard's
stamp stays ink (`storyboard-art.js`).

**Legacy tokens.** `--color-surface-*`, `--color-chip`, `--color-canvas-hero`, `--color-subtle`,
`--color-unrevealed`, `--color-placeholder`, `--color-wash-soft`, `--text-display-hero`,
`--text-display-stat`, `--text-heading-*`, `--text-mono`, `--shadow-pill`, `--shadow-overlay` and
`--radius-sm/md/lg` are still defined but unused (or aliased to the new values). Don't build on them.

### 2.1 The projector rule (permanent)

The site is presented in class on a projector in a sunlit room, which crushes contrast: light greys
vanish, Bodoni hairlines disappear, 1px rules and dashes drop out, near-white tones merge. So the
whole book is set to survive a washout. Check every change with a simulated washout as well as a
normal screenshot (Playwright:
`page.addStyleTag({ content: "html{filter:contrast(.55) brightness(1.25) saturate(.8)}" })`): every
heading, number, label, line and button must still read.

1. **Contrast.** Text that carries meaning ≥ 7:1 on its ground; nothing below 4.5:1. Meta text is
   `--color-muted` (8.8:1), never a lighter grey, and never dimmed by `opacity` much below 0.6.
2. **Weight.** Every Bodoni setting carries `-webkit-text-stroke: var(--bodoni-stroke) currentColor`
   (2 % of the size, 0.35–2.2px), which roughly doubles the hairlines and barely touches the stems;
   every Inter / mono setting resets it to 0 (so Inter inside a Bodoni panel stays Inter). Add both
   when you add a setting. Meta labels are 13px / 500; no visible text under 12px.
3. **Rules.** Structural rules are 2px ink (running heads, header, borders); secondary dividers
   1.5px at `--color-rule-soft` (60 %) or `--color-hairline` (34 %). Dashed and dotted lines are
   heavier (≥ 1.8px) and darker.
4. **Surfaces.** Paper (#F3F1EC) and panel (#FFFEFA) differ by a clear step and every panel keeps
   its 2px ink border and hard shadow. The paper value itself does not change: it is baked into the
   raster art and is the colour the hero sea dries back to.
5. **Colour with meaning.** Navy marks the active choice and focal numbers; the indigo wash is the
   sea and the instrument washes; north red stays on its three marks. No decorative colour.
6. **Raster art** (crew plates, chart, Rota plates, agent-detail plate) is printed through
   `--art-print` (firmer contrast, deeper indigo) instead of being regenerated.

### Ink marks

| Token | Value | Use |
|---|---|---|
| `--ink-line` / `--ink-border` | 2px / 2px solid sumi | Panel borders, button borders, arrow strokes. Running heads, the header rule and structural borders are 2px too; hairline / rule-soft borders 1.5px. |
| `--shadow-panel` | 5px 5px 0 sumi | Caption panels, buttons, agent panels. |
| `--shadow-panel-lg` | 7px 7px 0 sumi | Modal sheets, the schedule plate, the chart's right page. |
| radius | 0 | Everything is square. `--radius-pill` survives only for the skip link and scrollbar thumb. |

Depth is shown by the *offset* of a hard shadow (a lifted panel casts a longer one — see
`service-modal-ghosts.js`), never by blur.

### Spacing, layout, layers
8px grid (`--space-*`), `--gutter` 48px (20px < 768px), `--header-height` 80px (64px < 768px),
`--gutter-panel` 14px between comic panels. Layers: content 1, header 30, overlays 50, loader 60.
Breakpoints used in code: 768px (phone ↔ desktop layouts, pinned strip), 1024px (Rota sails,
headline blur), 480px (drawers full width).

---

## 3. Typography

| Role | Face | Setting |
|---|---|---|
| Titles (hero, chapter titles, agent names, Rota leg names, colophon) | **Bodoni Moda Display** 400 (`--font-display`) | Uppercase via CSS `text-transform` (so `lang="tr"` maps i → İ), `line-height: var(--title-leading)` (0.9), `letter-spacing: -0.012em`. **Second line indented 1.05em** (`.chapter-title__indent`, `.hero__line--indent`). Never bold, never italic. **Turkish marks:** at 0.9 the Ş/Ç cedilla of line 1, or the İ/Ö/Ü/Ğ marks of line 2, touch the other line; `lib/title-marks.js` tags such `.chapter-title`s with `.chapter-title--marks`, which sets line 2 down by `--title-mark-room` (0.12em). Other titles keep the tight leading. Write titles in sentence case in the markup; never type literal caps. |
| The book's voice (caption panels, folio, menu entries) | Bodoni Moda Display 400 | Sentence case, `--text-caption-panel`. |
| Everything else (body, running heads, nav, buttons, meta) | **Inter** 400–500 (`--font-sans`) | Sentence case. Tabular numerals for times and counts. |
| Rule codes only: E1–E4, R01–R16 | system mono (`--font-mono`) via `.rule-code` | `max(12px, 0.86em)`, no tracking, no uppercase styling. `services-render.js` `withRuleCodes()` wraps them automatically in agent text. |
| Wordmark | Bodoni Moda 700 (subset to "KAPtan"/"KAPTAN" glyphs) | Only inside the `#kaptan-logo` SVG symbol. |

**Minimum size.** No visible UI text below 12px (meta lines, legends, captions, rule codes). The
illustrations' own lettering (the demo storyboard's codes) is sized to stay ≥ 12px at 390px wide.

Fonts are self-hosted (`src/styles/fonts.css`, `public/fonts/`, OFL — see
`THIRD_PARTY_NOTICES.md`). Only `bodoni-moda-display-latin-tr.woff2` is preloaded; the loader waits
≤ 300 ms for it (`loader.js`, `FONT_WAIT_MS`). Dates go through `Intl.DateTimeFormat('tr-TR')`
(`src/utils/format.js`); in JS use `toLocaleUpperCase('tr-TR')`.

---

## 4. Book components

All shared devices live in `src/styles/book.css` and `src/styles/base.css`.

| Component | Class | Anatomy / rules |
|---|---|---|
| Running head | `.running-head` + `.running-head__folio[data-folio]` | Flex row, 13px Inter, 1px sumi rule under it, one per chapter at the top. Right: "**Bölüm N** · Ad". Left: the **live folio** (`lib/folio.js`): one tick per chapter (past chapters inked, the current one inking with the reader's progress through it, `--folio-progress`) and the page, "s. 9 / 23" (one page = one viewport of scroll, read half a viewport down). It never repeats the "KAPtan" wordmark: the sticky header carries the brand, so two wordmarks never stack. The slot is `aria-hidden`; empty without JS. |
| Chapter title | `.chapter-title` + `.chapter-title__indent` | `<h2>` in Bodoni caps; the second line is a `<span class="chapter-title__indent">` (block, indented 1.05em). Sections may override the size (e.g. `.rules__title`). |
| Caption panel | `.caption-panel` (`--flat` = no tilt) + `.caption-panel__meta` | Paper-panel sheet, ink border, hard shadow, tilted −0.8° (`--tilt`). The meta line is 12px Inter, muted. This is *the* voice of the page: agent quotes, Pusula acts, Rota legs, specs. Add `data-ink-in` to have it ink in (see §5). |
| Folio | `.folio` | Page number in Bodoni between two drawn 22px rules, at the foot of a chapter. `aria-hidden` when it's decoration. |
| Rule code | `.rule-code` | The one justified mono use (see §3). |
| Ink button | `.pill` + `.pill__label` + `.pill__chip` | Class names kept from the old design; the look is new: square paper-panel box, ink border, hard shadow, ≥ 44px tall, Inter 14/500 sentence case. `.pill__chip` is an **inked arrow** (CSS pseudo-elements), not a "+" chip. Hover (hover-capable only): indigo wash fill, paper text, arrow moves 4px right. `:active`: translates 4px/4px and the shadow goes to 0 — printed flat onto the page. |
| Text link | `.site-footer__link` | Inter, underline appears on hover. |
| Mark | `<svg><use href="#kaptan-logo"/></svg>` | Ring (compass dial), E/W ticks, needle, "KAPtan". The loader has an inline copy so it can animate it. |

Section-specific components: agent panels and ruled plates (`services.css`: LLM agents are ink
panels with a hard shadow; Kural Motoru and Risk Kapısı are "ruled plates" with a double rule and
ledger lines), the chart spread (`.spread*`), the articles (`menu/menu.css`) and the Sancak Tezgâhı
instruments and mast (`rules-bench/instruments.css`, `rules-bench/flag.css`), Rota legs
(`ritual.css`), colophon (`footer.css`), overlays (`src/ui/*.css`).

---

## 5. Motion

### Principles
1. **Motion is a printing verb.** Things *ink in* (clip-path from the left, DrawSVG strokes), pages
   *turn*, panels are *set down*. No fades-and-slides from nowhere, no bounce for its own sake.
2. **Scroll is the clock** for the story beats (hero, strip, Pusula, Rota). Scrubbed values are
   damped so wheel steps and flings never jitter.
3. **Pure maths, thin glue.** Every choreography has a pure, unit-tested module (`sea-swell.js`,
   `sea-spring.js`, `page-turn.js`, `chart-course.js`, `compass/timeline.js`, `funnel.js`,
   `rota-geometry.js`, `rota-sea.js`) and a browser-only glue file.
4. **Nothing runs off screen.** Tickers stop when a section leaves the viewport (IntersectionObserver).
5. **Reduced motion is a designed layout**, not a broken one: every section has a static composition.
6. Transform, opacity and clip-path only; `will-change` is set only while something moves.

### Stack
GSAP 3 + ScrollTrigger (plus DrawSVG, MotionPath, SplitText, CustomEase), Lenis smooth scroll
driven by the GSAP ticker (`src/lib/smooth-scroll.js`: 1.2 s, exponential), plain WebGL for the one WebGL
layer. All media-dependent motion is registered in one `gsap.matchMedia()` (`src/lib/motion-setup.js`,
`src/lib/motion-effects.js`), so toggling reduced motion or crossing a breakpoint tears effects
down and rebuilds them live. Pins use `pinType: 'transform'`.

### Boot
`src/main.js`: title marks (`title-marks.js`) and the focus guard (`focus-guard.js`) first → hero
sea created before the loader lifts (its shader compiles off the main thread via
`KHR_parallel_shader_compile`, so the loader's first frame lands at ≈ 170 ms) → loader
(`loader.js`) → aperture (`aperture.js`) → `settle()` → below-the-fold content rendered in yielded
steps → one `ScrollTrigger.refresh()` → the live folios (`folio.js`, re-measured on every refresh). A 6 s safety net and a global error handler fall back to the static
layout; nothing can leave a visitor stuck behind the loader.

### Per-section motion map

| Where | What moves | Tech (file) | Reduced motion / fallback |
|---|---|---|---|
| Loader | One fixed 0.6 s performance (`MIN_SHOW_MS`): the ring draws itself round the dial while the needle swings 38° → −21° → 10° and settles north (`NEEDLE_PERFORMANCE`); bar and "Bildirimler taranıyor · n/total" follow real progress (the hero font). Never longer than 0.7 s (`MAX_WAIT_MS`). Production build: visible from ≈ 170 ms, no frame gap > 40 ms during it (one ≈ 65 ms gap at 2× CPU). | DrawSVG, GSAP (`components/loader/loader.js`) | No performance: the dial follows progress at once. CSS failsafe hides the loader if JS never runs. |
| Aperture | The ring closes, then opens as a circle clip onto the hero while the headline rises; ≈ 0.85 s. Once per tab session. | GSAP clip-path (`loader/aperture.js`) | Skipped under reduced motion, save-data, or repeat visits → quick fade. |
| Hero (Bölüm 1) | Ink sea: five indigo→sumi wave bands, dry brush, rain; storm calms with scroll. The DOM boat rides the same swell; headline and captions sway with it. Captions hand over at 26/52/78 % of the hero's scroll; the needle follows the mouse on a damped spring, wanders otherwise, holds north from 82 %. Outro: no title card — the chapter ends with the boat (1.35× larger; it pitches about ±12° in the storm and settles as the sea calms) on a calm sea, then the ink *dries*: a drying front (`uDry`) rises from the bottom and the dried area is exactly `--color-paper`, so no sea edge or sliver is left under the header; in the calm the far crests keep a little brush detail (`farCalm` in the shader), so the horizon reads hand-inked, not ruled. Headline: letters rise on intro, dissolve 62–86 % (line blur only ≥ 1024px); CTA/rail fade 6–24 %; push-in and 6px pointer parallax. Section is 260vh (220vh on phones); the printed headline lines carry the split lines' box, so splitting it at boot shifts nothing (load CLS ≈ 0). `hero.css` sets `html[data-hero-sea=storm|calm]` root backgrounds so the scrollbar gutter matches the sea (a hero-scoped rule on `<html>`; keep it). | Plain WebGL (no library) shader generated from `SEA`, compiled with `KHR_parallel_shader_compile` off the main thread (`hero/sea/sea-shader.js`, `sea-renderer.js`, `sea-swell.js`, `sea-spring.js`, `sea-stage.js`), GSAP ticker; `hero/hero-motion.js`, `lib/split-text.js` | One still frame (`STILL`), section 100svh, no scrub. Without WebGL (or when the slot is taken) the printed SVG waves in `index.html` stay. |
| Tayfa strip (≥ 768px wide and ≥ 600px tall) | Pinned strip slides sideways (scrub 0.4); then the chart spread's leaf turns over the gutter (shaded faces), the last panels dissolve, the course is inked across the chart with waypoint stamps and the boat sailing on the pen's tip, then a short hold, the boat riding the swell at its mark (CSS idle bob, only while the spread owns the pin and the chapter is on screen). Mouse drag scrubs the strip; keyboard focus scrolls the pin to centre the focused panel; hovers are off while the strip moves. | ScrollTrigger pin + timeline (`services/services-motion.js`), `page-turn.js`, `chart-spread.js`, `chart-course.js`, `services-drag.js`, `settle-flag.js` | Static comic page of panels; the spread lies open and fully inked (CSS default). |
| Tayfa (< 768px, or < 600px tall: a phone held sideways) | Panels stack (sideways: the static comic page); the course is inked once (2.8 s) when the spread arrives. | `initMobileServicesMotion` | Same as above. |
| Agent detail | The card's plate is lifted (longer hard shadow), carried on an arc and set down on the detail page; the name flies to the Bodoni title; the strip sinks under an indigo wash while the page turns in from the right. Then the type is set: running head, I/O line inks in, description rises line by line, "Ne yapmaz" inks in, button follows; the agent's live diorama starts 0.62 s later. **All eight agents have a diorama** (`agent-scenes/<id>/`, registry in `registry.js`), each on one 3:2 plate with its a · b · c legend set in HTML over the drawing and a spoken one-sentence summary. Interruptible (Esc, Back, re-open). | GSAP FLIP ghosts + CustomEase (`ui/service-modal-motion.js`, `service-modal-ghosts.js`, `service-modal-reveal.js`), SplitText, Canvas 2D (`ui/agent-scenes/`) | `'sheet'` mode ≤ 767px (slides up); `'reduced'` mode: a plain fade, live plate drawn once as a still. |
| Seyir Kuralları · Sancak Tezgâhı | Lazy chunk, loaded as `#olaylar` nears (`motion-effects.js` `addRulesBench`). The rule titles become a switch (`switch.js`: `aria-pressed`, arrows/Home/End) choosing the ONE instrument in the shared slot; instruments report whether their rule fires and the mast hoists that pennant (`bench.js`, `rules-check.js`, `flag/`). First sight: a one-off tour E1 → E4. Wide + full motion (`show.js`, `beats.js`): the title assembles, the mast inks up, the stage pins for 1.8 vh and the scroll walks five beats (E1–E4, then the leak line passes 8 % and every pennant dips to half-mast), snapping to complete beats; reversible. Phones: rows rise in as they arrive. | GSAP, ScrollTrigger, SplitText, DrawSVG, SVG (`src/components/rules-bench/**`; styles in `menu/menu.css`, `rules-bench/*.css`) | Instruments jump to their crossed state; no pin. Without the chunk, `[data-bench='off']` prints every rule in full. |
| Caption panels (everywhere) | `[data-ink-in]` panels ink in from the left (0.9 s) the first time they enter the viewport. | `lib/ink-in.js`, `styles/book.css` | Printed at once (also without IntersectionObserver). |
| Ara · 350'den 1'e | Sticky stage (CSS, `--pusula-pin: min(300vh, 2700px)` — capped so tall screens don't hold each key frame for extra wheel notches — 260vh on phones); the canvas is full-bleed across the stage behind the copy. Pre-roll: the storm's slips drift in while Bölüm 3's footnote is still on screen. Scroll progress → damped playhead → `poseAt()`; the acts take 18 / 34 / 26 / 22 % of the scroll (the act rail matches): slips (300 wide / 140 compact) blow about and gather (Gürültü), sink through three rings Sınıflandır · Kanıtla · Kural and get struck out (Kanıt), the survivor is stamped (Onay), the compass inks itself — ring stroke, two washes, letters one at a time, needle drawn from the hub — and locks north (Yön). The counter is a paper tag hanging on a string and reads as a sentence; the act caption docks beside the act's subject and the CTA moves with it. The compass sits over `--rota-start-x` and publishes its centre as `--pusula-pivot-x/y`. Idle life: while the reader rests in Gürültü/Kanıt the slips keep tumbling and the column turns slowly (`IDLE`, ≤ 30 fps, only while the stage is on screen). Exit (W4): once the needle has locked, the pen leaves the compass rim and inks the course's first leg down the stage (`.pusula__bridge`, `layout.js` `bridgeTip`/`bridgePath`), past the hanging tag, then on the reader's eye line (72 %, shared with Rota's `EYE.start`) to the stage's foot, where Rota's course begins; the scene is a printed page and scrolls away with the stage (no fade, no blank paper). Fine pointers orbit the view slightly. Canvas exists only within 60 % of the viewport. | Canvas 2D (`compass/index.js`, `scene.js`, `timeline.js`, `funnel.js`, `dial.js`, `sprites.js`, `view.js`, `lib/ink3d/`) | `data-pusula="static"`: short section, `pusula-01` still + the four acts as text. `"still"` mode if the 2D context fails. |
| Rota (≥ 1024px) | The dotted course runs on from the Pusula bridge and draws down the page through I–IV (mask + DrawSVG, scrub 0.8) with the pen on the eye line (`EYE` in `rota-geometry.js`: 72 % → 86 %); the boat is set on the water as the pen reaches it (`.is-launched`), sails it (MotionPath), bobbing on the inked sea's swell and leaving a wake; waypoints are marked reached as it passes. It moors low on the page in a taller harbour (`--rota-harbour`), so the moored boat is the chapter's last frame before the colophon's running head comes up (W5). | `ritual/rota-course.js`, `rota-geometry.js`, `rota-sea.js`, `rota-sea-render.js` (SVG sea, rebuilt on resize) | < 1024px or reduced: whole course printed, boat at rest in port. |
| Header | Transparent over the hero with a paper scrim; after 40px of scroll: paper at 90 %, light backdrop blur, ink hairline. | `header/header.js`, `header.css` | Same (no motion involved). |
| Drawers / modals | Drawers slide in from the right (450 ms, ease-out-expo); modals ink in via clip-path; focus trapped, Escape/scrim close, focus returns. | `ui/overlay.js`, `overlay-base.css` | Opacity-only fades. |
| Mobile sticky tab | One small ink tab bottom-right, "İçindekiler · Altı adımda", 47px tall (44px targets), < 768px only. Shown only while the reader navigates: hero off screen, no overlay open, no quiet zone on screen (`QUIET_SELECTOR`: `[data-sticky-quiet]` = the rules bench, all of `#ajanlar`, every in-section ink button `main .pill`) **and** the last scroll went up (`nextScrollIntent`, 12px slop). Reading down hides it, so at rest it never covers a caption panel. | `sticky-cta/sticky-cta.js` | Same (opacity-only transition). |
| Running-head folio | The current chapter's tick inks with progress; the page number follows the scroll (one passive listener, rAF-throttled). | `lib/folio.js`, `styles/book.css` | Same (nothing animates). |

### Junctions (one book, one sea, one boat)
Every chapter hands over with a printing verb; nothing cuts to blank paper.

| Junction | Verb | How |
|---|---|---|
| Fırtına → Tayfa | the ink dries, the opener is printed where it dried | `#ajanlar` is pulled up 50svh under the hero's exit (`hero.css`, only while the sea moves: `.hero[data-sea-exit]`) and printed above it on transparent paper; `sea-stage.js` `revealNext()` masks it to the part of the stage where the ink has fully dried (`--hero-dry-edge`, `services.css`), so "Sekiz kişilik tayfa." comes up right behind the drying front. Reduced motion / no script: plain stacked pages. Without WebGL the printed waves fade with `--hero-dry`. |
| Tayfa → Seyir Kuralları | a page is turned, the mast is inked | The spread closes the pinned chapter and scrolls away clear of Bölüm 3 (≥ 120 px of paper between its foot and B3's running head at 1440); B3's title assembles and its mast inks up from the foot. The book's gutter and the mast stand on the same x (± 6 px at 1440). The landfall ring sits in the chart's harbour (≈ 450 px right of the mast), fixed by the raster chart. |
| Seyir Kuralları → Ara | the storm drifts in | Pusula's pre-roll: slips are already falling while B3's footnote is on screen. |
| Ara → Rota | a line is drawn | The compass bridge (see Ara above) runs into Rota's course at `[data-rota-start]`; the boat is launched as the pen reaches it. |
| Rota → Kolofon | the boat moors | The harbour ring inks closed and the boat moors before the colophon's running head is on screen; "— Son —" and the mark close the book. |

### The one-WebGL-context rule
The page holds **at most one live WebGL context** (`src/lib/gl-slot.js`). Any WebGL effect must
call `claimGLSlot(release)` *before* creating its renderer; a new claim tears down the previous
holder via its `release`. Today only the hero sea uses WebGL: it claims the slot while on screen
and gives it back (destroying its canvas) when scrolled away. The Pusula scene and the agent scenes
are deliberately Canvas 2D so they never compete for it. If you add a WebGL effect, claim the slot,
keep a non-WebGL fallback, and compile shaders without blocking (`KHR_parallel_shader_compile`, as `hero/sea/sea-renderer.js` does). OGL is no longer used.

---

## 6. Illustration pipeline

All raster art is procedural SVG, rasterised by sharp/librsvg with the site's fonts, given a
deterministic paper grain and encoded to AVIF/WebP/JPEG (`scripts/kaptan-visuals/pipeline.mjs`).
Same input → same bytes. No photography, no third-party art (`public/images/CREDITS.md`).

| Output (`public/images/generated/`) | Source | Notes |
|---|---|---|
| `ajan-{1..8}-{400,600,800}` (3:4) | `scripts/kaptan-visuals/agents.mjs` → `crew/crew-{1..8}.mjs` | Crew portraits. Style bible: `scripts/kaptan-visuals/crew/STYLE.md` (palette paper/ink/indigo + ≤ 1 tiny red, brush contours, flat washes, one focal prop, no captain's cap — the captain is the human who approves and is never shown). Card order = `src/data/agents.js`. |
| `ajan-{1..8}-detail-{400,600}` | same | A zoomed crop per plate; still generated, not currently referenced by the page. |
| `harita-{1280,1920}` (3:2) | `scripts/kaptan-visuals/chart.mjs` | The chart spread. Course, waypoints and legend are **not** in the raster; they are live SVG in `index.html`, sharing geometry with `src/components/services/chart-course.js`. |
| `yolculuk-{1..4}-{600…2000}` | `scripts/kaptan-visuals/journey.mjs` | Small plates inside the Rota caption panels. |
| `og-1280.jpg` (1280×853) | `scripts/kaptan-visuals/og.mjs` + `og-wordmark.mjs` | Its own set (not part of the chart): the hero as one printed panel — paper, a "Bölüm 1 · Fırtına" running head with the navy wordmark (drawn from the glyph outlines of `public/fonts/bodoni-moda-wordmark.woff2`), Bodoni "KANIT / ÖNCE.", an Inter caption panel, the hero's ink sea bands with the red-flag boat (the card's only red), a compass rose. Keep what must read inside the central 1200×630. Build: `npm run visuals -- --only=og`. |
| `pusula-01-{900,1400}.{avif,webp}` | `scripts/build-pusula-still.mjs` | The real Pusula renderer's final frame, captured from the running dev server in headless Edge. |

Commands: `npm run visuals` (all), `npm run visuals -- --only=ajan-3` (one set),
`--svg` (keep SVGs in `.qa/visuals/svg`), `--qa` (contact sheet). Variant names and widths must match
`src/lib/responsive-images.js` (`IMAGE_SETS`). Crew workflow: copy a `crew-N.mjs`, draw, wire it in
`agents.mjs`, build with `--only`, and check the 400px JPEGs until face, hands and prop read.

Agent live plates (`src/ui/agent-scenes/`): all eight dioramas are built (Sınıflandırıcı, Okuyucu,
Önemlilik, Kanıt, Şüpheci, Uyum, Kural Motoru, Risk Kapısı); contract and style rules are in
`src/ui/agent-scenes/SCENES.md`; the shared Canvas 2D kit is `src/lib/ink3d/`.

**Demo storyboard** (`src/ui/storyboard-art.js`): the six frames of the "Altı adımda" drawer are
drawn at runtime as SVG data in the crew plates' language: `brush()` strokes that swell and thin
(deterministic pressure, tapered ends, `straight` for ruled edges), flat indigo washes in two or
three values (`.storyboard__wash` + `fill-opacity`), sumi masses, paper sheets with a heavier
contour on the shadow side, and the storm's horizon and rain behind. Full bleed in the 16:10
panel. No red (the stamp stays ink); rule codes in mono, ≥ 12px rendered.

---

## 7. The "AI-tell" ban list

These read as template output and were removed on purpose. Don't bring them back.

| Banned | Use instead |
|---|---|
| Italic accent words in headings ("Kanıt, *sonra karar*") | Bodoni caps with an indented second line. |
| Tracked uppercase mono micro-labels ("LLM AJANI · 03", "TAKVİM") | Inter sentence case meta (`.caption-panel__meta`, running heads). Mono only for rule codes. |
| Stat rows / big-number KPI cells ("6 · 16 · 0") | Say it in a caption panel, or let a scene count (the Pusula counter is a sentence). |
| Pill buttons with a "+" chip | The square ink button with an inked arrow (`.pill`). |
| Soft blur shadows | Hard offset ink shadows (`--shadow-panel*`). |
| Rounded modals, cards, images | Square sheets with an ink border. |
| Decorative gradients, glow, neon, glassy cards | Flat washes. Gradients are allowed only where they do a job: the header's contrast scrim, the page-turn shading, the Rota wake/sea fade, the legend's scale bar. |
| A second accent colour; north red or navy outside their jobs | See §2. |
| Instrument Serif, the white gallery canvas | Bodoni Moda Display on rice paper. |

---

## 8. Accessibility rules

- `lang="tr"`; one `<h1>` (hero); each chapter is a `<section aria-labelledby>` with its `<h2>`.
- Skip link "İçeriğe geç" → `#main`. Focus ring: 3px `--color-brand`, offset 3px (never removed).
- Touch targets ≥ 44 × 44 (buttons, nav links, ✕, the phone logo: 146 × 44 itself). No visible
  UI text below 12px.
- **Focus never falls to `<body>`** (`lib/focus-guard.js`): lazy pins (e.g. the Sancak Tezgâhı
  show) wrap, and on every refresh re-wrap, their section in a pin-spacer, which detaches the
  focused element. When focus is lost without a pointer press or a key's own default action, and
  the element is back and still focusable, focus is handed back without scrolling. Keyboard walk
  (1440, full and reduced motion): the only `<body>` stop is Tab past the last control.
- Decorative SVG/canvas is `aria-hidden` with `focusable="false"`; meaningful figures carry a
  (visually hidden) caption — e.g. the chart spread, the Pusula still's `alt`.
- Agent panels are real `<button>`s with a full accessible name (`agentCardLabel()`); the detail is
  a dialog named by its heading, deep-linkable as `#ajan-<id>`, closed by Back/Escape.
- Overlays: focus trap, `inert` on the rest of the page, Escape and scrim close, focus returns to
  the trigger (`ui/overlay.js`). Drawers are static copy — nothing to fill in.
- A jump to a chapter (`data-scroll-to` links, contents entries, "Ajanları gör", "Rotada görün")
  lands the focus on that chapter (`tabindex="-1"`, no ring), as a native anchor would, so the next
  Tab continues there (`main.js` `goToChapter`). A chapter deep link (`/#olaylar`) is landed on again
  once the pins exist (`landOnDeepLink`); a reload starts at the top (scroll restoration is manual,
  set through `ScrollTrigger.clearScrollMemory`).
- Pinned strip: keyboard focus scrolls the pin so the focused panel is centred.
- Loading state is announced once ("Sayfa hazır") through a live region outside the loader.
- One name per overlay everywhere: the demo drawer is "Altı adımda" in the header, the menu, the
  sticky tab and the drawer's title (`DEMO_LABEL`), with the meta "Final sunumunda gösterilecek".
  Nothing is called "canlı" unless it runs live (the agent dioramas' "Canlı şema" does).
- Links without a URL render as muted "· yakında" text, never a dead `#`; new-tab links carry a
  visually hidden "(yeni sekmede açılır)" (`visit-render.js`).
- Every animation has a reduced-motion composition (§5); `prefers-reduced-motion` also switches
  Lenis off. Text over the sea keeps ≥ 4.5:1 via the header scrim and paper-panel captions.

---

## 9. Performance budgets (as implemented)

| Budget | Where |
|---|---|
| One live WebGL context | `lib/gl-slot.js` |
| Hero sea render scale 1 (0.8 and 3 noise octaves < 768px) | `sea-stage.js` `QUALITY` |
| Pusula canvas DPR ≤ 1.5 (≤ 2 on compact screens); 300 / 140 slips | `compass/config.js` |
| Agent scene DPR ≤ 2 (≤ 1.5 above 260 000 CSS px²), ≤ 1 ms draw per frame, no per-frame allocation | `SCENES.md`, `agent-scenes/index.js` |
| Loader shows ≥ 0.6 s and ≤ 0.7 s; ≤ 300 ms for the hero font; whole boot rescued after 6 s | `loader.js`, `main.js` |
| Only the hero display face is preloaded; UI chunk, Rota course, Sancak Tezgâhı (+ its show), Pusula renderer and agent scenes load lazily | `index.html`, `main.js`, `motion-effects.js` |
| AVIF ≤ 150 KB per `yolculuk` variant, ≤ 200 KB per `harita` variant (quality steps down to fit) | `pipeline.mjs` `AVIF_BUDGET` |
| Crew plate SVG < 400 KB | `crew/STYLE.md` |
| Unit coverage ≥ 80 % (lines, functions, branches, statements) | `vite.config.js` |

---

## 10. QA

```bash
npm install
npm run dev                  # http://localhost:5173
npm test                     # vitest run (jsdom); must stay green
npm run coverage             # 80 % thresholds on the listed modules
npm run build                # vite build must succeed without errors
node scripts/qa/shot.mjs --out=.qa/hero.jpg                       # screenshot of the running dev server
node scripts/qa/shot.mjs --out=.qa/rules.jpg --at=#olaylar --w=390 --h=844
node scripts/qa/shot.mjs --out=.qa/pusula-rm.jpg --at=#pusula --reduced
```

`shot.mjs` uses the installed Microsoft Edge (set `QA_CHANNEL` for another Chromium channel), waits
for the loader and intro, and prints page console errors next to the picture. Options: `--at`
(selector or y), `--offset`, `--w`/`--h`, `--wait`, `--reduced`, `--full`.

Check every change at 1440×900, 1280×720 and 390×844, with and without reduced motion, and keep the
console free of errors. Browser-only glue (GSAP/Lenis/WebGL wiring) is excluded from coverage and
verified in the browser instead.

---

## 11. File map

```
index.html                      all chapters' markup + static fallbacks; #kaptan-logo symbol
src/main.js                     boot: title marks, focus guard → loader → aperture → below-the-fold → refresh → folios
src/styles/
  tokens.css                    design tokens (mirror of the YAML above)
  fonts.css                     self-hosted @font-face
  base.css                      reset, focus, skip link, the ink button (.pill)
  book.css                      running head, chapter title, caption panel, folio, rule code, ink-in
  split-text.css                line/char masks for split headings
  print.css                     print stylesheet
  index.css                     import order (linked from index.html, not from JS)
src/lib/
  motion-setup.js, motion-effects.js   the shared gsap.matchMedia and lazy signature effects
  smooth-scroll.js, scroll-lock.js     Lenis ↔ native scroller, reason-counted locks
  ink-in.js                     the reveal verb for [data-ink-in]
  folio.js                      the running heads' live folio (chapter ticks + "s. n / N")
  title-marks.js                room between title lines where Turkish marks would touch
  focus-guard.js                hands focus back when a pin re-parents the focused element
  gl-slot.js                    the one-WebGL-context rule
  ink3d/                        Canvas 2D ink kit (camera, quad, ink, paths, grain, random)
  responsive-images.js          image set names and widths
src/components/
  loader/                       loader + aperture
  header/                       header scroll state
  hero/                         hero-motion.js, hero.css, sea/ (swell, shader, renderer, spring, stage)
  services/                     Tayfa strip, page turn, chart spread/course, drag
  menu/                         Seyir Kuralları articles' styles (menu.css)
  rules-bench/                  Bölüm 3 Sancak Tezgâhı: switch, bench glue, rules-check, show + beats
                                (pinned sequence), instruments/ (ledger, disclosure, balance, slider,
                                leak, gates), flag/ (mast, halyard, pennants)
  compass/                      Ara · 350'den 1'e ink scene
  ritual/                       Rota: legs, course, inked sea
  visit/                        visit-render.js: binds SITE facts and links into the markup
  footer/                       colophon styles
  grain/, sticky-cta/, about/   hero grain tile, mobile sticky tab, [data-stomp] helper
src/ui/                         overlays: menu-drawer, demo-drawer (+ storyboard-art), about/legal
                                modals, service-modal* (agent detail), agent-scenes/ (+ SCENES.md)
src/config/site.js, src/data/   project facts: site, agents, events, milestones, demo flow
scripts/build-kaptan-visuals.mjs, scripts/kaptan-visuals/   illustration pipeline (+ crew/STYLE.md)
scripts/build-pusula-still.mjs  Pusula still
scripts/qa/shot.mjs             headless screenshots
```

## Known gaps
- Team names and the Proposal / Dokümanlar / GitHub URLs are placeholders (`SITE.team`,
  `SITE.links`); `SITE.url` is a placeholder used by the JSON-LD and the absolute og:image.
- The agent detail's running head (`service-modal.js`) still prints "KAPtan" on the left. It sits
  under the overlay, so it never stacks with the header wordmark, but it could carry the folio too.
