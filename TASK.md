# TASK tracker

> **Process:** update this file with the checklist **before** coding. Then implement. Then `/code-review`. Then commit/push when asked.

---

## Done earlier

- [x] Sessions not initialized (call `initSessions`, local create/load, skip API greet)
- [x] SW stale HTML / BASE_URL assets / real `sql-wasm.wasm`
- [x] Send path ends with `user` role (MessageOrderError)
- [x] Docs: `ARCHITECTURE.md`, `PLAN-webllm-capability.md`
- [x] Capability gate + small WebLLM (0.5B, lazy load, history cap)
- [x] Wire client RAG into send ([PLAN-rag-wireup.md](./PLAN-rag-wireup.md))

---

## Current: RAG quality (top-2, score gate, fact extract)

**Plan doc:** [PLAN-rag-quality.md](./PLAN-rag-quality.md)  
**Scope:** tighter retrieve + same-engine fact extract before character reply; lower temp when lore/fact is used.  
**Out of scope:** second browser model, frozen fallback, IndexedDB, Workers, changing `MODEL_ID`.

### Checklist (write these before coding)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Write plan doc | `PLAN-rag-quality.md` | [x] |
| 2 | `TOP_K=2`, `MIN_SCORE`, skip thin passages; log skip reason | `frontend/src/runtime/client-rag.ts` | [x] |
| 3 | Skip thin section bodies when building index | `backend/rag.py` | [x] |
| 4 | `extractFact` + `chat` temperature option | `frontend/src/runtime/client-llm.ts` | [x] |
| 5 | Send path: retrieve → extract → inject fact (fallback passages); status + console | `frontend/src/chat/chat-client.ts` | [x] |
| 6 | Note two-pass lore path in architecture | `ARCHITECTURE.md` | [x] |
| 7 | `npm run build` / `tsc` | frontend | [x] |
| 8 | `/code-review` on the change | — | [x] (in-place) |
| 9 | Commit + push Pages | — | [ ] (ask first) |

### Review notes (post-impl)

| Severity | Finding | Follow-up |
|----------|---------|-----------|
| Note | `MIN_SCORE=0.4` may need tuning from console `RAG retrieve: skipped` / hit scores | Adjust if real lore is skipped |
| Note | Fact extract adds one WebLLM call latency on lore hits | Expected; status shows “Checking lore…” |
| Note | Thin-body filter in `rag.py` applies on next CI index rebuild | Client also filters thin docs from old JSON |

### Done when

- [x] At most 2 hits above score floor (or none for weak queries)
- [x] Fact extract runs on lore hits; character gets fact (or soft fallback)
- [x] Chitchat temp stays ~0.7; lore/fact path uses lower temp
- [x] Build passes

---

## Next (do not start until this section is filled before coding)

- [ ] Frozen sample fallback when `tier !== "live"`
- [ ] IndexedDB for session persistence
