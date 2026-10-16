# Plan: RAG quality (top-2, score gate, fact extract)

Scope: stop flooding the character WebLLM with weak/noisy lore; lock facts before roleplay.  
Out of scope: second browser model, frozen fallback, IndexedDB, Workers, Python chat API, model id change.

```
Send (tier === live)
        │
        ▼
retrieve → top 2, score ≥ MIN, drop thin stubs
        │
        ├─ no hits → character chat (temp 0.7)
        │
        ▼
same WebLLM: extractFact (temp ~0.1, no character voice)
        │
        ├─ UNKNOWN / fail → optional formatPassages fallback (top 2) @ lore temp
        │
        ▼
character chat with Canon fact only (temp ~0.35)
```

---

## Goal

Keep character personality for normal chat. For lore questions, give the 1.5B model **one short verified fact** (or at most two tight passages) instead of five mixed chunks.

---

## Current vs target

| Today | Target |
|--------|--------|
| Always top 5 passages | Top **2**, drop below **MIN_SCORE** |
| Greety `"hi"` still injects junk | Score gate → no lore |
| Thin `Appearance` / heading stubs in hits | Skip thin bodies at index load + retrieve |
| Passages dumped into character prompt | **Fact extract** pass → then character rewrite |
| `temperature: 0.7` always | `0.7` normal; lower when lore/fact injected |

---

## Phase 0 — Tighter retrieve (`client-rag.ts`)

- `TOP_K = 2`
- `MIN_SCORE` (cosine) — if best hit &lt; threshold, return `[]`
- Skip thin passages (short body after the `Title > Section` header)
- Keep console logs for hits / skip reason

---

## Phase 1 — Thin chunks at source (`backend/rag.py`)

In `load_documents`, skip section bodies under a minimum length so CI rebuilds a cleaner `rag-index.json`.

---

## Phase 2 — Same-engine fact extract (`client-llm.ts` + `chat-client.ts`)

1. `extractFact(question, passages)` — non-stream, low temp, system prompt: one factual sentence or `UNKNOWN`.
2. Soft-fail: on error / `UNKNOWN`, fall back to `formatPassages(top2)` or no lore.
3. Character turn: inject `Canon fact: …` + question (not raw multi-passage dump when extract succeeds).
4. `chat(..., { temperature })` — lore/fact path uses lower temp; chitchat stays `0.7`.
5. Status line: `Checking lore…` during extract (reuse existing status area).
6. Console: `RAG fact extract: …`

No second model download. Same WebLLM engine, sequential calls.

---

## Phase 3 — Docs / verify

1. Note the two-pass lore path in `ARCHITECTURE.md`.
2. `npm run build` in `frontend`.
3. Manual: `"hi"` → no / skipped lore; lore question → `RAG hits` (≤2) + `RAG fact extract` + better answer.

---

## File touch list

| File | Change |
|------|--------|
| `PLAN-rag-quality.md` | **New** — this plan |
| `TASK.md` | Fresh checklist |
| `frontend/src/runtime/client-rag.ts` | Top-2, min score, thin filter |
| `frontend/src/runtime/client-llm.ts` | `extractFact`; temp option on `chat` |
| `frontend/src/chat/chat-client.ts` | Wire extract → character inject |
| `backend/rag.py` | Skip thin section bodies |
| `ARCHITECTURE.md` | Two-pass lore note |

---

## Risks

- **Extra latency** — one more WebLLM call on lore hits; status line covers it.
- **MIN_SCORE too high** — real lore skipped; tune from console scores (start ~0.40).
- **Extract still wrong** — 1.5B limit; fallback to top-2 passages at low temp.
- **Index rebuild** — Pages CI already runs `python -m backend.rag` + export; thin-filter applies on next deploy.

---

## Done when

- Retrieve returns at most 2 scored hits above the floor (or none)
- Weak queries do not inject lore
- Lore path runs fact extract then character reply (soft-fail safe)
- Build passes; architecture notes the path
