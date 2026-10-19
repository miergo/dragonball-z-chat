# Dragon Ball Z Chat

[Open Dragon Weekly](https://miergo.github.io/dragonball-z-chat/)

Talk or type about Dragon Ball Z lore with Frieza, Piccolo, or Majin Buu. Two runtimes share this repo:

| Mode | Where | Who answers |
|------|--------|-------------|
| **Pages** | Static site (link above) | In-browser [WebLLM](https://webllm.mlc.ai/) (WebGPU) |
| **Local** | Python API + Vite | Tabby or Ollama on this machine |

Visitors never hit a Python server. CI rebuilds a canon RAG index and ships it with the static site. Details: [ARCHITECTURE.md](./ARCHITECTURE.md).

## GitHub Pages (visitor)

Needs a WebGPU-capable browser with enough memory. On first chat the site downloads **Qwen2.5-1.5B-Instruct** (WebLLM) into the browser cache.

On each send, a capped **hybrid RAG** path runs in the browser:

1. Embed the question and retrieve top hits from the shipped `rag-index.json` (score floor; soft-fail if RAG is cold)
2. Optionally rewrite the query once and re-retrieve
3. Extract a short fact from the hits (or a don’t-know cue — raw passages are not dumped into the prompt)
4. Stream a character reply, with lower temperature when lore is present

Sessions stay in the browser (sql.js + localStorage). Non-WebGPU devices still get the reel UI; live chat needs the capability gate to pass.

## Local development

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python api.py
```

```bash
# frontend (proxies /api → :8787)
cd frontend && npm install && npm run dev
```

The API listens on `http://127.0.0.1:8787`. Default LLM backend is Tabby at `http://127.0.0.1:5000` (`Qwen2.5-7B-Instruct-exl3`). Set `LLM_BACKEND=ollama` to use Ollama instead (`pip install ollama`).

On this path you can summon a second fighter into a session. They greet, then take turns: each speaks three times per user message (six lines total), streamed as each line finishes. The Pages/WebLLM chat path is single-speaker today.

Optional: rebuild the local Chroma index and export for the client with `python -m backend.rag` then `python scripts/export_rag_index.py` (CI does this before the Pages build).

**Stack:** Python backend (local LLM + API + canon index). TypeScript frontend (UI; WebLLM + client RAG on Pages).

GitHub Pages cannot host the Python process or a server-side model.
