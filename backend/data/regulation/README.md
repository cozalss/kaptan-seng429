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

`sample-spk-ii-22.1.md` is **not** the official text: it is a short paragraph we wrote to exercise the
loader (`sample: true`). Replace it with the real communiqué texts from spk.gov.tr / mevzuat.gov.tr.
