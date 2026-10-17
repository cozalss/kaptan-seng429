# Avoiding cliché LLM+RAG+agent projects

*Ham araştırma raporu — araştırma ajanı çıktısı, 29.09.2026. Bu rapor her iki fikir için de geçerlidir.*

## 1. Clichés to avoid
- **"Chat with your PDF / docs"** — "every third portfolio I review has a PDF chatbot… a fine first project and a weak fifth one" ([dev.to](https://dev.to/pranjulrathour/multimodal-llms-five-student-project-ideas-beyond-chat-with-a-pdf-4j22)).
- Generic customer-support/FAQ bot, company-HR policy bot.
- Resume screener / AI interview recruiter / career coach ([Analytics Vidhya](https://www.analyticsvidhya.com/blog/2025/03/generative-ai-projects/)); "AI interview recruiter" only got an honorable mention at Microsoft's hackathon.
- Study assistant / AI tutor / lecture summarizer / quiz generator.
- Generic medical, legal or finance Q&A bots.
- Trip planner, recipe or gift agent, "personal assistant".
- "Deep research" multi-agent report writer (commodity pattern).
- Deliverable of just "chatbot prototype + demo video" ([AngelHack 2026 playbook](https://angelhack.com/blog/ai-agent-hackathon/)).

## 2. Five differentiating characteristics
1. **A narrow, messy, real workflow with a named user, not a chat window.** Agent takes actions and produces an artifact (flagged anomaly, filled form, ticket, report). Microsoft AI Agents Hackathon (18k participants, 570 submissions) scored Innovation, Impact, Usability (incl. human-in-the-loop and responsible AI), Solution Quality (docs, architecture clarity) and Category fit at 20% each ([rules](https://microsoft.github.io/AI_Agents_Hackathon/rules/)).
2. **Measured evaluation with a published scorecard.** Golden Q/A set; groundedness/faithfulness, context relevance, citation accuracy (RAGAS / RAG triad), task-completion rate, tool-use accuracy, cost per run, latency. Stanford CS329T (Fall 2025) builds its project around this ([slides](https://web.stanford.edu/class/cs329t/slides/Lecture%201%20-%20CS%20329T%20Fall%202025.pdf)). Show failures and fixes.
3. **Evidence you can inspect.** Citations, retrieval traces, agent step logs ([DataTalks.Club RAG portfolio guide](https://datatalksclub.github.io/podwiki/wiki/rag-portfolio-projects/)). Make one hard retrieval problem visible (tables, multi-doc cross-referencing, Turkish text).
4. **Human-in-the-loop plus guardrails.** Approval gates (LangGraph interrupts), role-based retrieval/ACLs, PII masking, prompt-injection defenses, audit trail.
5. **Real or realistic domain data plus structured tools.** Unstructured docs + SQL DB or API, or a knowledge graph. Local context helps (KVKK, e-Fatura, SGK, EKAP, municipal data).

## 3. Standout examples
- **RiskWise** — Best Overall, Microsoft AI Agents Hackathon 2025. Four agents over an equipment-schedule SQL DB flag supply-chain delivery risks, 1–5 risk score, citations, audit trail. [Issue](https://github.com/microsoft/AI_Agents_Hackathon/issues/526) · [Repo](https://github.com/oh-qi-qi/azure-ai-agent-hackathon-2025)
- **Konveyor** — Best Python Agent, same hackathon. Engineer-onboarding agent in Slack with a "knowledge gap analyzer". [Issue](https://github.com/microsoft/AI_Agents_Hackathon/issues/645) · [Repo](https://github.com/sdamache/konveyor-onboarding-agent)
- **Closing.wtf** — 2nd place, LlamaIndex Agentic RAG-a-thon 2. Parses mortgage loan estimates, cross-references a knowledge graph of US standards, flags mistakes/fraud/negotiable fees; became a live product. [Devpost](https://devpost.com/software/closing-wtf) · [Recap](https://www.llamaindex.ai/blog/agentic-rag-a-thon-2-winners-and-recap)
- **OilyRAGs** — 3rd place, same event. Boat part catalogs + multimodal part recognition for mechanics.
- Also: WorkWizee (P1/P2 incident automation), TARIFFED! (tariff schedule agents), ModelProof (dual-LLM safety auditor) — [Microsoft winners list](https://microsoft.github.io/AI_Agents_Hackathon/winners/).

## Takeaway
Winners share a pattern: a boring but expensive enterprise workflow (compliance, procurement, incidents, document verification) where the agent cross-checks documents against rules or structured data and flags problems for a human to approve, with visible citations and traces. Add a quantitative evaluation report — most of the 10+ groups will skip it.
