# Plan: Hybrid RAG (browser, capped)

Based on LangChain’s [Hybrid RAG](https://docs.langchain.com/oss/python/deepagents/retrieval) pattern: query enhancement, retrieval validation, and bounded refine — not full Agentic tool loops.

Scope: improve lore grounding on the Pages / WebLLM path.  
Out of scope: LangGraph agents, second browser model, answer-regen loops, Python API chat, frozen fallback, IndexedDB.

```
User question
    │
    ▼
[1] Retrieve (score gate, top 3, thin filter)
    │
    ├─ no hits ──► [2] enhanceQuery (same 1.5B) ──► retrieve once more
    │                                                      │
    ▼                                                      ▼
[3] extractFact (validate: fact or UNKNOWN)
    │
    ├─ UNKNOWN + not yet enhanced ──► enhanceQuery → retrieve → extract once
    │
    ├─ fact OK ──► character chat @ lore temp + formatFact
    │
    └─ still UNKNOWN / no hits ──► NO passage dump
           → “say you do not know” instruction @ lore temp
           → or plain character chat if RAG cold
```

Max WebLLM helper calls per send: **enhance ≤1**, **extract ≤2**, then **1** character stream.

---

## Goal

Stop the failure modes we saw in console:

| Failure | Hybrid fix |
|---------|------------|
| Weak / off-topic hits → bad fact (“Tien… willpower”) | Tighter extract; UNKNOWN when passages don’t *answer* the question |
| `UNKNOWN` then passage dump → “Frieza killed Vegeta” | **Never** inject raw passages after UNKNOWN |
| Missed retrieve on awkward wording | One **query enhance** + one re-retrieve |

Stay Hybrid (validate + one refine), not Agentic (open-ended tool loops). See [LangChain retrieval docs](https://docs.langchain.com/oss/python/deepagents/retrieval).

---

## Current vs target

| Today | Target |
|--------|--------|
| Retrieve → extract → fact **or** `formatPassages` fallback | Fact only; UNKNOWN → don’t-know instruction, **no** passages |
| Single query string | Optional one-shot **enhanceQuery** then re-retrieve |
| Extract prompt loose | Must fully answer the question or `UNKNOWN`; no fight asides |
| Console: hits / extract | Also log enhance + hybrid branch decisions |

---

## Phase 0 — Tighter validation (`client-llm.ts`)

1. Harden `FACT_SYSTEM`: one sentence that **answers the question** from passages only; otherwise exactly `UNKNOWN`. No mid-fight asides, no roleplay.
2. Add `enhanceQuery(question)` — same engine, low temp, one short search query line; soft-fail → `null`.
3. Keep `extractFact` console as summarize agent.

---

## Phase 1 — Hybrid send path (`chat-client.ts`)

Replace “passages fallback” in `loreForQuestion`:

1. `retrieve(userText)`.
2. If empty → `enhanceQuery` → `retrieve(enhanced)` (once).
3. If still empty → return `null` (normal character chat).
4. `extractFact(userText, passages)`.
5. If UNKNOWN and enhance not used yet → enhance → retrieve → extract once more.
6. If fact → `formatFact` + lore temp.
7. If still UNKNOWN → `formatUnknown()` (“say you do not know…”) + lore temp — **no** `formatPassages`.

Status: reuse “Looking up lore…” / “Checking lore…”.  
Console: `RAG hybrid: …` for each branch.

---

## Phase 2 — Docs / verify

1. `ARCHITECTURE.md` — hybrid steps (enhance / validate / no passage dump).
2. `npm run build`.
3. Manual:
   - `"hi"` → skip / no lore (score gate).
   - Lore with good hits → `fact →` then character.
   - Bad hits / UNKNOWN → don’t-know path, **not** passage fallback.
   - Awkward wording → one enhance + second retrieve in logs.

---

## File touch list

| File | Change |
|------|--------|
| `PLAN-hybrid-rag.md` | **New** — this plan |
| `TASK.md` | Replace current checklist with this milestone |
| `frontend/src/runtime/client-llm.ts` | `enhanceQuery`; tighter `FACT_SYSTEM` |
| `frontend/src/runtime/client-rag.ts` | `formatUnknown()` |
| `frontend/src/chat/chat-client.ts` | Hybrid `loreForQuestion` |
| `ARCHITECTURE.md` | Hybrid path note |

---

## Risks

- **Extra latency** — up to one enhance + two extracts on hard lore; capped, status line covers it.
- **1.5B enhance quality** — soft-fail keeps original query.
- **Index gaps** — don’t-know is correct when canon isn’t in `rag-index.json`.

---

## Done when

- UNKNOWN never injects raw passages
- At most one query enhance + one re-retrieve per send
- Fact path unchanged when extract succeeds
- Build passes; architecture updated
