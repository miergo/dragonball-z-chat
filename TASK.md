# TASK tracker

> **Process:** update this file with the checklist **before** coding. Then implement. Then `/code-review`. Then commit/push when asked.

---

## Done earlier

- [x] Sessions not initialized (call `initSessions`, local create/load, skip API greet)
- [x] SW stale HTML / BASE_URL assets / real `sql-wasm.wasm`
- [x] Send path ends with `user` role (MessageOrderError)
- [x] Docs: `ARCHITECTURE.md`, `PLAN-webllm-capability.md`
- [x] Capability gate + small WebLLM (0.5B, lazy load, history cap)

---

## Current: Wire client RAG into send

**Plan doc:** [PLAN-rag-wireup.md](./PLAN-rag-wireup.md)  
**Scope:** lazy `ensureRAG` → `retrieve` → `formatPassages` → inject into live WebLLM prompt. Soft-fail if index/embedder fails.  
**Out of scope:** frozen fallback, IndexedDB, Workers, index sharding, Python API changes.

### Checklist (write these before coding)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Add `ensureRAG` / `isRAGReady` / `getRAGError` (cached promise; no boot download) | `frontend/src/runtime/client-rag.ts` | [x] |
| 2 | On Send (live): start RAG in parallel with LLM; soft-fail never blocks chat | `frontend/src/chat/chat-client.ts` | [x] |
| 3 | `retrieve(text)` → `formatPassages`; inject into last `user` prompt only (don't persist lore) | `chat-client.ts` | [x] |
| 4 | Status line: “Loading lore…” / “Looking up lore…” (reuse chat error/status area) | `chat-client.ts` | [x] |
| 5 | Note RAG on send path in architecture doc | `ARCHITECTURE.md` | [x] |
| 6 | `npm run build` / `tsc` | frontend | [x] |
| 7 | `/code-review` on the change | — | [x] (in-place) |
| 8 | Commit + push Pages | — | [x] `0f5b70f` |

### Review notes (post-impl)

| Severity | Finding | Follow-up |
|----------|---------|-----------|
| Low | RAG status and LLM progress fight the same status line while both cold | Fine for now; optional dedicated lore chip later |
| Low | `bge` embedder runs on main thread | Worker later if UI janks |
| Note | Local `vite` without `rag-index.json` soft-fails (CI still builds the index for Pages) | Expected |

### Done when

- [x] First live Send lazy-loads RAG once; later Sends reuse it
- [x] Canon passages reach the model; saved messages stay plain text
- [x] Missing/failed RAG still allows chat
- [x] Build passes

---

## Next (do not start until this section is filled before coding)

- [ ] Frozen sample fallback when `tier !== "live"`
- [ ] IndexedDB for session persistence
