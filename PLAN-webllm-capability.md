# Plan: Device capability → WebGPU + RAM OK → Small WebLLM

Scope: **left branch only** of the hybrid tree (live local inference).  
Out of scope for this plan: HF Space / cloud fallback, wiring RAG (follow-up).

```
Device capability check
        │
        ├─ fail → (later) frozen / error UI
        │
        └─ WebGPU + RAM OK
                │
                └─ Lazy-load Small WebLLM → stream chat
```

---

## Goal

Only devices that can actually run in-browser inference start the model. Those devices use a **smaller** WebLLM build, loaded **lazily**, with a **capped context**, so AMD / shared-memory machines stop OOMing as often.

Static host stays GitHub Pages (free). No new paid services.

---

## Current vs target

| Today | Target |
|--------|--------|
| `initLLM()` on `createChat()` | Init only after capability OK **and** user opens chat / first Send |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (~1.6 GB VRAM est.) | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` (~0.9 GB VRAM est.) |
| WebGPU = `"gpu" in navigator` log only | Real gate: adapter + rough RAM heuristic |
| Full history to model | Last N turns (e.g. 6–8 messages) |
| OOM → red error | OOM / init fail → clear message + optional frozen later |

---

## Phase 0 — Capability module

**New file:** `frontend/src/runtime/device-capability.ts`

```ts
export type DeviceTier = "live" | "unsupported";

export async function assessDevice(): Promise<{
  tier: DeviceTier;
  reason?: string;
  adapterInfo?: string;
}>
```

### Checks (in order)

1. **`navigator.gpu`** exists  
2. **`await navigator.gpu.requestAdapter()`** succeeds (not just the property)  
3. **RAM heuristic** (best-effort; not perfect in browsers):
   - Prefer `navigator.deviceMemory` when present (Chrome): require **≥ 4** (GB) for 0.5B path; if missing, allow live but treat as “unknown”
   - Optional: fail live if `deviceMemory < 4` on shared-GPU suspicion (document as tunable)
4. Return `tier: "live"` or `"unsupported"` with a short `reason`

Do **not** download model weights during assess — only WebGPU probe.

**Wire:** call once from `main.ts` or first chat open; cache the result.

---

## Phase 1 — Small model + lazy engine

**File:** `frontend/src/runtime/client-llm.ts`

1. Change default:

   ```ts
   const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
   ```

   (Confirm ID against `@mlc-ai/web-llm` `prebuiltAppConfig.model_list` for the locked package version.)

2. Keep character `SYSTEM_PROMPTS` (may need slightly tighter “short replies” wording for 0.5B quality).

3. Export:

   - `ensureLLM(callbacks?)` — no-op if ready; else `CreateMLCEngine` once  
   - `isLLMReady()` / `getLLMError()`

4. **Remove** eager `initLLM()` from `initializeLocalApp()` in `chat-client.ts`.  
   Sessions can still init early (cheap). LLM waits for live path.

5. On Send (and optionally on chat `start` if tier is live):

   ```
   if tier !== "live" → show unsupported / frozen (phase 3 stub)
   else await ensureLLM(onProgress) → then chat(...)
   ```

6. Cap context before `chat()`:

   ```ts
   const MAX_HISTORY = 8; // messages
   contextMessages = contextMessages.slice(-MAX_HISTORY);
   // still must end with role: "user"
   ```

7. Keep `max_tokens` modest (e.g. 256–384) to limit KV growth.

---

## Phase 2 — UX for the live path

Minimal UI (no big redesign):

| State | Behavior |
|--------|----------|
| Assessing | Optional: “Checking device…” once |
| Live + loading model | Disable Send; show % from existing `onProgress` (reuse console + one status line in chat error/status area) |
| Live + ready | Normal send |
| Init / OOM failure | Message: “This device couldn’t load the local model.” + Retry button calling `ensureLLM` again |

Do not block the reel/summon; only chat send/load-model.

---

## Phase 3 — Stub the “fail” branch (don’t implement fully yet)

For this milestone, if `tier === "unsupported"` or LLM init fails:

- Keep form visible **or** hide send and show the status message  
- Hook point for later: `frozenChat`-style sample transcript  

Document in code: `// TODO: frozen fallback (right branch)`  

---

## Phase 4 — Verify

1. Chrome + WebGPU laptop: first Send shows download progress for **0.5B**, then replies  
2. Reload: model from cache, faster  
3. Browser without WebGPU (or adapter null): no weight download; clear unsupported message  
4. `npm run build` + Pages deploy  
5. After SW update: unregister once if old HTML cached  

Optional: Performance tab / Task Manager — peak memory should drop vs 1.5B.

---

## File touch list

| File | Change |
|------|--------|
| `frontend/src/runtime/device-capability.ts` | **New** — assess WebGPU + RAM |
| `frontend/src/runtime/client-llm.ts` | 0.5B model; `ensureLLM`; keep prompts |
| `frontend/src/chat/chat-client.ts` | No eager LLM; gate Send; history cap; progress line |
| `frontend/src/main.ts` | Optional early `assessDevice()` log / cache |
| `ARCHITECTURE.md` | Point left branch at this plan |
| `TASK.md` | Checklist for implementation |

No Python / CI changes required for this path (RAG still unwired).

---

## Risks & notes

- **0.5B quality** will be weaker at lore than 1.5B; system prompt “answer these exactly” lines matter more until RAG is wired.  
- **`deviceMemory`** is Chrome-oriented and spoofable; treat as heuristic, not security.  
- Adapter request may prompt permissions on some devices — call it at chat open, not on every keystroke.  
- Shared AMD memory can still OOM on 0.5B under load; failure path must be soft.

---

## Implementation order (when you say “build it”)

1. `device-capability.ts` + cache  
2. Switch `MODEL_ID` → 0.5B + `ensureLLM`  
3. Stop eager init; call `ensureLLM` on first Send if `live`  
4. History + `max_tokens` caps  
5. Minimal progress / error UX  
6. Build, commit, push Pages  

---

## Done when

- Capable devices run **small** WebLLM only after an explicit live gate + lazy load  
- Incapable devices never start a multi‑hundred‑MB download  
- Chat still works end-to-end on a known-good WebGPU machine with lower memory pressure than today
