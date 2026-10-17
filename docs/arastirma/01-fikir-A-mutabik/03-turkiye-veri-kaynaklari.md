# Turkish data sources for an LLM + RAG + agents project

*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026.*

**Legal point first:** FSEK Article 31 (Law 5846): officially published laws, regulations, circulars, communiqués (tebliğ) and court decisions may be freely reproduced, distributed and processed. Caveats: site ToS, rate limits, personal data inside decisions.

## 1. mevzuat.gov.tr — laws, regulations, communiqués, university regulations
- Content: consolidated laws, KHK/CBK, regulations, communiqués (İş Kanunu 4857, KVKK 6698, VUK, KDV Kanunu, university regulations).
- Format: HTML + PDF/DOC; predictable URLs (e.g. `mevzuat.gov.tr/mevzuatmetin/1.5.4857.pdf`). No official API; easy scraping.
- Head starts:
  - Scrapy scraper: https://github.com/muhammetakkurtt/mevzuat-gov-scraper
  - HF dataset (907 laws, article-level JSON): https://huggingface.co/datasets/muhammetakkurt/mevzuat-gov-dataset
  - University regulations: https://huggingface.co/datasets/yusufbaykaloglu/turkish-university-mevzuat
  - Existing article-level RAG baseline: https://github.com/berkaytaygurt/mevzuat-rag

## 2. Court and regulator decisions (Yargıtay, Danıştay, AYM, Rekabet, KİK, KVKK, BDDK, Sayıştay)
- Official: karararama.yargitay.gov.tr, karararama.danistay.gov.tr, Bedesten backend.
- **yargi-mcp** (MIT, Python) wraps official endpoints for 16 institutions: https://github.com/saidsurucu/yargi-mcp
- Enables a legal-research agent with live MCP tools + cached corpus in Chroma/pgvector.

## 3. KVKK — board decisions, summaries, guides
- https://www.kvkk.gov.tr/Icerik/5406/Kurul-Karar-Ozetleri · https://www.kvkk.gov.tr/Icerik/2030/Rehberler
- Small, clean corpus (hundreds of docs); scrapeable in a day.
- Enables a KVKK compliance copilot. Apply PII masking anyway.

## 4. KAP via MKK API Portal
- Official free REST API after registration + approval: https://apiportal.mkk.com.tr/
- 12 data services: disclosures, attachments, company/fund lists, ISIN.
- Community wrappers: `kap_sdk`, `kap-mcp-server` (PyPI).
- Approval can take time (IP authorization) → apply in week 1.
- Enables investor-relations / financial-analysis agents.

## 5. GİB tax legislation and özelgeler
- https://www.gib.gov.tr/mevzuat/arama (özelge, sirküler, tebliğ). HTML, no API; moderate scraping.
- Tax-assistant RAG for SMEs.
- Pair with UBL-TR e-Fatura validator (XSD + schematron, Turkish explanations): https://github.com/BerkantACUN/efatura-kontrol

## 6. EKAP / KİK (public procurement)
- Tender search: https://ekap.kik.gov.tr/EKAP/Ortak/IhaleArama/index.html · Board decisions: https://ekap.kik.gov.tr/EKAP/Vatandas/KurulKararSorgu.aspx
- No API; ASP.NET forms (harder). KİK decisions also via yargi-mcp.
- Tender-matching agent; procurement-complaint precedent RAG with Law 4734.

## Lower priority
- Resmi Gazete: daily HTML, good as change-feed tool.
- TÜİK (https://data.tuik.gov.tr): numeric tables; watch cp1254 and decimal commas.
- SGK circulars: PDFs.
- TSE standards: copyrighted/paid — **do not use**.

## Models
- Embeddings: baseline `BAAI/bge-m3`, `intfloat/multilingual-e5-large`; Turkish-specific `newmindai/Mursit-Large-TR-Retrieval`, `trmteb/turkish-embedding-model`, TurkEmbed4Retrieval (arXiv 2511.07595). Leaderboard: https://huggingface.co/spaces/magibu/mteb-turkish
- LLMs: Trendyol-LLM-8B, Cosmos Turkish-Llama-8B, Kumru (VNGRS), KocDigital-8B, or Qwen2.5-7B / API model. List: https://github.com/kesimeg/awesome-turkish-language-models

## Benchmarks
- TR-MTEB (EMNLP 2025 Findings): https://aclanthology.org/2025.findings-emnlp.471/
- RAGTurk (SIGTURK 2026; HyDE 85% vs 78.7% baseline): https://aclanthology.org/2026.sigturk-1.15/
- Turkish-RAGTruth (hallucination detection).
- Build your own ~100-question gold set with article citations; evaluate with RAGAS.

## Recommendation (of this report)
Compliance copilot on #1 + #2 + #3 (KVKK + İş Kanunu RAG, legal-decision search via yargi-mcp, article-level chunking); optionally #5 e-Fatura validator as a second agent. KAP only if MKK approval arrives early.
