# Regulation texts for the RAG `regulation` base (07 §11.3, FR-12)

Put the official SPK texts here, one Markdown file per communiqué, for example
`spk-ii-15.1.md` (Özel Durumlar Tebliği) and `spk-ii-22.1.md` (Geri Alınan Paylar Tebliği).
Each file starts with front matter:

```
---
doc_ref: spk:II-22.1
title: Geri Alınan Paylar Tebliği (II-22.1)
valid_from: 2014-01-03
valid_to:
lang: tr
sample: false
---
```

Paragraphs are separated by a blank line; each paragraph becomes one chunk. `valid_to` empty means in
force; a repealed text drops out of retrieval after that date. Index with
`uv run python -m kaptan.rag.bases --regulation` (and `--events` for the event memory).

Shipped (accessed 2026-10-29, consolidated texts from mevzuat.gov.tr, `sample: false`):

- `spk-ii-22.1.md`: Geri Alınan Paylar Tebliği, RG 3/1/2014-28871, in force on publication; no amendments
  in the consolidated text (SPK Kurul/ilke kararları on buybacks are not part of the file).
- `spk-ii-15.1.md`: Özel Durumlar Tebliği, RG 23/1/2014-28891, in force one month later (2014-02-23);
  amended by RG 10/2/2017-29975, 13/2/2018-30331, 17/11/2018-30598 (marks kept inline, e.g. `(Değişik:RG-...)`).

One paragraph per fıkra, each prefixed with its article (`MADDE 12 (Başlık) – (4) ...`), so every chunk cites
itself; section headings are `#` lines (skipped). The annex forms (EK) are left out (tables, no rule text).
Extra front-matter keys (`source`, `published`, `amendments`, `excluded`) are notes for people; the loader
ignores them. To refresh: download the mevzuat.gov.tr PDF, `pdftotext -layout`, and rebuild the paragraphs.
