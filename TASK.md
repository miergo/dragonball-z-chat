# TASK tracker

> **Process:** update this file with the checklist **before** coding. Then implement. Then `/code-review`. Then commit/push when asked.

---

## Done earlier

- [x] Sessions not initialized (call `initSessions`, local create/load, skip API greet)
- [x] SW stale HTML / BASE_URL assets / real `sql-wasm.wasm`
- [x] Send path ends with `user` role (MessageOrderError)
- [x] Docs: `ARCHITECTURE.md`, `PLAN-webllm-capability.md`

---

## Current: Capability gate + small WebLLM

**Plan doc:** [PLAN-webllm-capability.md](./PLAN-webllm-capability.md)  
**Scope:** left branch only — Device capability → WebGPU + RAM OK → Small WebLLM (lazy).  
**Out of scope:** RAG wire-up, frozen fallback, HF Space, IndexedDB.

### Checklist (write these before coding)

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Add `assessDevice()` (WebGPU `requestAdapter` + `deviceMemory` ≥ 4 GB heuristic, cached) | `frontend/src/runtime/device-capability.ts` | [x] |
| 2 | Switch model to `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`; add `ensureLLM` / `isLLMReady` / `getLLMError`; `max_tokens` 256 | `frontend/src/runtime/client-llm.ts` | [x] |
| 3 | Remove eager `initLLM` from chat create; keep sessions-only early init | `frontend/src/chat/chat-client.ts` | [x] |
| 4 | On chat open: assess device; on Send: if live → lazy `ensureLLM` + progress UI; if not → soft error (TODO frozen) | `chat-client.ts` | [x] |
| 5 | Cap conversation history to last 8 messages (still end with `user`) | `chat-client.ts` | [x] |
| 6 | Retry control for model load failure | `chat-client.ts` | [x] |
| 7 | Early `assessDevice()` log in boot (no weight download) | `frontend/src/main.ts` | [x] |
| 8 | `npm run build` / `tsc` | frontend | [x] |
| 9 | `/code-review` on the change | — | [x] (in-place; Bugbot usage limited) |
| 10 | Commit + push Pages | — | [x] |

### Review notes (post-impl)

| Severity | Finding | Follow-up |
|----------|---------|-----------|
| Medium | User message saved before model ready → orphan turn if load fails | Defer save until after `ensureLLM`, or roll back on fail |
| Medium | Retry cannot clear cached `unsupported` assessment | Only useful after failed `ensureLLM` on `live` devices |
| Fixed during review | `modelLoading` stuck true if user leaves mid-download | Cleared on token cancel |

### Done when

- [x] Capable devices load **0.5B** only after first Send (not on page load)
- [x] Incapable devices never start model download; clear message shown
- [x] Build passes
- [x] Pushed for Pages deploy

---

## Next (do not start until this section is filled before coding)

_When starting the next feature, replace this section with a fresh checklist first._

- [ ] Wire client RAG into send
- [ ] Frozen sample fallback when `tier !== "live"`
