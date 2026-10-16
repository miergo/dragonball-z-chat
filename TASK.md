# TASK tracker

> **Process:** update this file with the checklist **before** coding. Then implement. Then `/code-review`. Then commit/push when asked.

---

## Done earlier

- [x] Sessions / SW / message order / capability gate / client RAG wire-up / RAG quality (top-K, score, fact extract)
- Plan docs: [PLAN-rag-wireup.md](./PLAN-rag-wireup.md), [PLAN-rag-quality.md](./PLAN-rag-quality.md)

---

## Current: Hybrid RAG (validate + one refine)

**Plan doc:** [PLAN-hybrid-rag.md](./PLAN-hybrid-rag.md)  
**Ref:** [LangChain Hybrid RAG](https://docs.langchain.com/oss/python/deepagents/retrieval)  
**Scope:** query enhance (≤1), retrieval validate, fact extract; UNKNOWN → don’t-know (no passage dump). Same WebLLM 1.5B.  
**Out of scope:** Agentic tool loops, answer-regen loops, second model, Python API chat, frozen fallback, IndexedDB.

### Checklist (write these before coding)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Write plan doc | `PLAN-hybrid-rag.md` | [x] |
| 2 | Tighter `FACT_SYSTEM` + `enhanceQuery` | `frontend/src/runtime/client-llm.ts` | [x] |
| 3 | `formatUnknown()` (no passage dump on UNKNOWN) | `frontend/src/runtime/client-rag.ts` | [x] |
| 4 | Hybrid `loreForQuestion`: retrieve → validate → enhance/retry ≤1 → fact or don’t-know | `frontend/src/chat/chat-client.ts` | [x] |
| 5 | Console `RAG hybrid:` branches + summarize logs | `chat-client.ts` / `client-llm.ts` | [x] |
| 6 | Architecture note for hybrid path | `ARCHITECTURE.md` | [x] |
| 7 | `npm run build` / `tsc` | frontend | [x] |
| 8 | `/code-review` on the change | — | [x] (in-place) |
| 9 | Commit + push Pages | — | [ ] (ask first) |

### Review notes (post-impl)

| Severity | Finding | Follow-up |
|----------|---------|-----------|
| Note | Enhance + extract add latency on hard lore | Capped ≤1 enhance, ≤2 extract |
| Note | `formatPassages` unused on send path now | Kept export; hybrid never dumps passages after UNKNOWN |
| Note | Index gaps still yield don’t-know | Correct; expand canon if needed |

### Done when

- [x] UNKNOWN never injects `formatPassages`
- [x] At most one enhance + one re-retrieve per send
- [x] Successful extract still injects `formatFact` @ lore temp
- [x] Build passes

---

## Next (do not start until this section is filled before coding)

- [ ] Frozen sample fallback when `tier !== "live"`
- [ ] IndexedDB for session persistence
