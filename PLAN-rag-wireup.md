# Plan: Wire client RAG into send

Scope: connect existing `client-rag.ts` into the live WebLLM send path.  
Out of scope: frozen fallback, IndexedDB, Workers, index sharding, Python API.

```
First Send (tier === live)
        │
        ├─ ensureLLM (already) ──┐
        │                        ├─ parallel OK
        └─ ensureRAG (lazy) ─────┘
                │
                ▼
        retrieve(user text) → formatPassages
                │
                ├─ fail soft → chat without lore
                └─ ok → inject into prompt → chat()
```

---

## Goal

0.5B replies stay in character **and** get correct names/events from the static canon index. Retrieval is lazy, soft-failing, and never blocks chat if the index or embedder fails.

Static host stays GitHub Pages. Index still built in CI (`python -m backend.rag` → `export_rag_index.py` → `rag-index.json`).

---

## Current vs target

| Today | Target |
|--------|--------|
| `initRAG` / `retrieve` exist, unused | Called on first live Send |
| Prompt = system + memory + history | + canon passages for this question |
| RAG fail → N/A | Soft: log + answer without passages |
| No RAG progress UI | Status line while index/embedder loads |

---

## Phase 0 — Harden `client-rag.ts`

Mirror the LLM helpers:

- `ensureRAG(onProgress?)` — no-op if ready; else load `rag-index.json` + Xenova bge once; cache `initPromise`
- `isRAGReady()` / `getRAGError()`
- Keep `retrieve` / `formatPassages` / `TOP_K`

Do **not** load RAG on page boot.

---

## Phase 1 — Inject into send (`chat-client.ts`)

After capability is `live` and before `chat()`:

1. Start `ensureRAG` (preferably **in parallel** with `ensureLLM` when both cold).
2. On success: `passages = await retrieve(userText)` → `lore = formatPassages(passages)`.
3. Build `contextMessages` as today (memory + history + cap), then rewrite the **last** `user` message for the model only:

   ```
   <formatPassages output>

   Question:
   <original user text>
   ```

   Saved/history messages stay the plain user text (do not persist the lore blob).

4. WebLLM rule: last role remains `user`.
5. Soft fail: any RAG error → `console.warn` and `chat()` without lore.

---

## Phase 2 — UX

Reuse the existing `#chat-error` status line (same as model load):

| State | Copy |
|--------|------|
| Loading embedder / index | `Loading lore… N%` |
| Retrieving | `Looking up lore…` |
| Ready / streaming | clear status (tokens take over) |
| RAG soft-fail | no red error; chat continues |

Do not disable Send permanently for RAG failure. Keep `modelLoading` / `llmBlocked` semantics unchanged.

---

## Phase 3 — Docs / verify

1. Update `ARCHITECTURE.md`: RAG is on the send path.
2. `npm run build` in `frontend`.
3. Manual: first Send shows lore progress once; later Sends skip download; lore questions improve vs no-RAG.

Optional local: ensure `frontend/public/rag-index.json` exists (CI builds it; local may need `python -m backend.rag` + export).

---

## File touch list

| File | Change |
|------|--------|
| `PLAN-rag-wireup.md` | **New** — this plan |
| `TASK.md` | Fresh checklist for this milestone |
| `frontend/src/runtime/client-rag.ts` | `ensureRAG` / ready / error helpers |
| `frontend/src/chat/chat-client.ts` | Lazy RAG + retrieve + inject |
| `ARCHITECTURE.md` | Mark RAG wired on send |

No Python / CI changes required (index pipeline already ships the JSON).

---

## Risks

- **bge + WebLLM memory** — both on GPU/CPU; soft-fail and lazy load reduce risk; prefer RAG after LLM ready if OOM returns.
- **Huge `rag-index.json`** — already a known issue; sharding is out of scope.
- **0.5B still weak** — passages help facts; system prompts still matter.
- **Missing local index** — soft-fail so local `vite` without CI artifact still chats.

---

## Done when

- First live Send lazy-loads RAG once, retrieves for the question, injects passages into the model prompt
- RAG failure does not break chat
- Build passes; ARCHITECTURE reflects the wire-up
