# Image credits

Every agent card, journey window, the nautical chart and the OG card in `generated/` are drawn procedurally for KAPtan by `npm run visuals` (`scripts/build-kaptan-visuals.mjs` and `scripts/kaptan-visuals/`). They contain no photography and no third-party artwork. They were made for this project and carry no external license.

- **Fonts in the images:** Instrument Serif, Inter and Bodoni Moda, taken from `public/fonts/` (SIL Open Font License, see `public/fonts/OFL.txt`). The build decodes the WOFF2 files for rendering and does not redistribute them in any other form.
- **Content:** every document, company, ticker, amount, hash, signature and chart in the images is invented. The issuer "ÖRNEK ENERJİ A.Ş." / "ORNEK" is a placeholder. Nothing imitates the interface, logo or branding of KAP, Borsa İstanbul, SPK or any other real institution. Documents carry a visible "Temsili" mark.
- **The chart ("Onay rotası"):** an invented coastline built from seeded noise. It is not for navigation.

The crew portraits (`ajan-*`) are ink drawings built in `scripts/kaptan-visuals/crew/` (see `STYLE.md` there). The hero sea is drawn live by a shader and has no image files. The compass (`pusula*`) images come from their own build script.

The output is deterministic: the same script run twice gives the same files.
