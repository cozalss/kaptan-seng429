# Enterprise Agentic RAG: Use-Case Scan (2025–2026)

*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026.*

## Market context
- Enterprise GenAI spend reached about $37B in 2025. Of departmental spend, coding takes 55%, IT 10%, customer success 9% and HR 5% (Menlo Ventures, https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/).
- Gartner predicts over 40% of agentic projects will be cancelled by 2027 because of unclear value or weak risk controls (https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027). **Lesson for the demo:** show measurable ROI plus governance (approvals, audit log, evaluation), not only intelligence.
- Real LangGraph deployments: Klarna (support agent, ~80% faster resolution), LinkedIn (SQL Bot, multi-agent text-to-SQL), Elastic (threat detection), Uber (code migration). Source: https://www.langchain.com/built-with-langgraph

## Top 8 candidates

| # | Use case | Pain point | Why agents, not a chatbot | Data | Feas. | Wow |
|---|---|---|---|---|---|---|
| 1 | **AP invoice exception agent** (3-way match: invoice / PO / goods receipt) | ~18% of invoices hit exceptions; 8.2 days to process (Ardent 2025, https://fragment.ai/wiki/invoice-exceptions) | Extract → match against ERP DB → diagnose → draft vendor email → human approves payment | Synthetic POs/invoices in Postgres; generated PDFs; vendor contracts in RAG | 4 | 5 |
| 2 | **Vendor/KYC due-diligence squad** | Manual sanctions, ownership and adverse-media checks at onboarding | Parallel specialist agents (sanctions, news, financials) → compiled risk file for human sign-off (McKinsey pattern: https://www.mckinsey.com/capabilities/risk-and-resilience/our-insights/how-agentic-ai-can-change-the-way-banks-fight-financial-crime) | OFAC SDN / OpenSanctions, live web search, synthetic vendors | 4 | 5 |
| 3 | **Contract review vs. company playbook** | Legal bottleneck on NDAs and MSAs | Clause extraction → compare to playbook → risk score → proposed redline → escalate | CUAD: 510 contracts, 41 clause types (https://www.kaggle.com/datasets/theatticusproject/atticus-open-contract-dataset-aok-beta) | 4 | 4 |
| 4 | **KVKK/GDPR policy gap analyzer** | Aligning policies with 2025 KVKK amendments and Nov 2025 GenAI guide | Map requirements to internal policies, find gaps, draft remediation tasks; good fit for GraphRAG | KVKK law text, synthetic company policies (https://digital.nemko.com/regulations/ai-regulation-in-turkey) | 3–4 | 4 |
| 5 | **AI SRE / incident RCA** | MTTR; on-call coordination tax | Supervisor + log, metrics and runbook agents; proposes fix; human approves restart (https://aws.amazon.com/blogs/machine-learning/build-multi-agent-site-reliability-engineering-assistants-with-amazon-bedrock-agentcore) | Own Docker microservice with fault injection + runbooks in RAG | 3 | 5 |
| 6 | **Support agent that takes actions** | 60–80% of tickets are routine | Tool calls on order/CRM DBs, policy RAG, refund approval above threshold | Bitext dataset (https://www.kaggle.com/datasets/bitext/bitext-gen-ai-chatbot-customer-support-dataset), Olist | 5 | 3 (common) |
| 7 | **Text-to-SQL analytics agent** | Business users wait on data teams | Schema RAG → SQL → self-correct → chart | Olist / Northwind | 4 | 4 |
| 8 | **RFP / security questionnaire responder** | Weeks spent on 200-question questionnaires | Retrieve prior answers/policies, draft, confidence-flag, SME review | Synthetic ISO 27001/SOC2 policies | 4 | 3 |

HR policy/onboarding bots: feasible but low-wow and very common — skip.

## Demo "wow" patterns, ranked
1. **Human-in-the-loop approval** — LangGraph `interrupt()` + checkpointer, clickable Approve/Reject card, resume (https://machinelearningplus.com/gen-ai/langgraph-human-in-the-loop-approval-steps/).
2. **Live agent-trace panel** — stream graph node execution.
3. **Clickable citations** to highlighted clause/page.
4. **Self-correcting RAG (CRAG/Self-RAG)** — grader rejects chunks, rewrites query, web-search fallback (https://blog.langchain.com/agentic-rag-with-langgraph/).
5. **Tool use on real systems** — DB row changes, email sent, ticket created.
6. **RAGAS evaluation dashboard** — before vs. after CRAG.
7. **GraphRAG entity graph view.**
8. **Multi-agent debate** (use sparingly).

## Recommendation
Top pick: combine #1 and #2 into a "Procure-to-Pay Copilot" — vendor onboarding due diligence + invoice exception handling, with approval inbox, audit log and RAGAS dashboard. Clearly enterprise, naturally multi-agent, public + synthetic data, dramatic demo arc, splits cleanly across 4 people (ingestion/RAG, agents/graph, tools/backend, UI/evaluation).

Runner-up: #5 (AI SRE) — highest live wow, more infrastructure risk.
