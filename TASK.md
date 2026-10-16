# TASK: Fix "Sessions not initialized" on GitHub Pages

## Problem

Opening a character chat on Pages shows **Sessions not initialized**. Console may only show WebGPU + favicon noise; the real failure is the local SQLite path never starts.

## Root cause

1. `initializeLocalApp()` in `frontend/src/chat/chat-client.ts` calls `initSessions()` / `initLLM()` but **is never invoked**.
2. `load()` calls `createLocalSession()` while `db` is still `null` → throws `"Sessions not initialized"`.
3. Related: `load()` still uses the **Python API** (`getSession`, `greet`) for some branches. Those fail or race on static Pages; history already uses `listLocalSessions`.

## Plan

| # | Change | File |
|---|--------|------|
| 1 | Call `initializeLocalApp()` once when `createChat()` runs | `chat-client.ts` |
| 2 | `await initSessions()` at the start of `load()` (and ensure retry/new session wait) | `chat-client.ts` |
| 3 | Use `getLocalSession` instead of API `getSession` when opening by id | `chat-client.ts` |
| 4 | Skip API `greet()` on the local path; open an empty/ready session (LLM/form handles first reply) | `chat-client.ts` |
| 5 | Build, commit, push so Pages redeploys | CI |

## Out of scope (follow-ups)

- Full greeting via WebLLM on session start
- Wiring RAG into every send
- Favicon 404 (cosmetic)

## Status

- [x] 1–4 implemented in `chat-client.ts` (call `initializeLocalApp`, await `initSessions`, local get/create, skip API greet)
- [x] Redeploy after session-init push
- [x] SW stale HTML: bump cache + network-first for documents (fixing 404s on old `assets/*.js` hashes)
- [x] Fix send path: include user message so WebLLM last role is `user` (MessageOrderError)

## Done when

- Chat opens without the red "Sessions not initialized" banner
- New session / history list work against sql.js in the browser
- `npm run build` passes
