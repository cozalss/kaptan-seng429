# Third-party notices

Third-party work shipped with the site is listed below; a ported file would keep an attribution
comment at its top. Image credits (all visuals are generated for this project) are in `public/images/CREDITS.md`.

No ported third-party code is bundled at the moment. OGL (Unlicense) was used for the hero's ink
sea and the Pusula scene until October 2026; the sea now runs on plain WebGL
(`src/components/hero/sea/sea-renderer.js`) and the Pusula scene on Canvas 2D, so OGL is no longer
part of the build.

## Fonts (self-hosted in `public/fonts/`, declared in `src/styles/fonts.css`)

Subset to Latin + Turkish with fontTools (`pyftsubset`, `varLib.instancer`) from the sources below; family
names are unchanged, as the OFL allows when no Reserved Font Name is declared (none of these declare one).
The full licence text ships next to the files as `public/fonts/OFL.txt`.

| File | Source | License |
|---|---|---|
| `instrument-serif-latin-tr.woff2`, `instrument-serif-italic-latin-tr.woff2` | Instrument Serif — https://github.com/Instrument/instrument-serif (via https://github.com/google/fonts/tree/main/ofl/instrumentserif) | SIL OFL 1.1, © 2022 The Instrument Serif Project Authors |
| `inter-latin-tr.woff2` (opsz 14, wght 400–500) | Inter — https://github.com/rsms/inter (via https://github.com/google/fonts/tree/main/ofl/inter) | SIL OFL 1.1, © 2020 The Inter Project Authors |
| `bodoni-moda-display-latin-tr.woff2`, `bodoni-moda-display-italic-latin-tr.woff2` (Pusula section and agent detail titles) | Bodoni Moda — https://github.com/indestructible-type/Bodoni (via https://github.com/google/fonts/tree/main/ofl/bodonimoda) | SIL OFL 1.1, © 2020 The Bodoni Moda Project Authors |
| `bodoni-moda-wordmark.woff2` (700, opsz 11, "KAPtan" / "KAPTAN" glyphs only; instanced and subset with fontTools) | Bodoni Moda — https://github.com/indestructible-type/Bodoni (via https://github.com/google/fonts/tree/main/ofl/bodonimoda) | SIL OFL 1.1, © 2020 The Bodoni Moda Project Authors |
