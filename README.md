# Dragon Ball Z Chat

[Open Dragon Weekly](https://miergo.github.io/dragonball-z-chat/)

Local chat app: talk or type about Dragon Ball Z lore. A local LLM answers in a character’s voice. Summon a second fighter into the same session and they take turns on screen as each reply finishes.

**Stack:** Python backend (LLM + API). TypeScript frontend.

The Pages link is the reel. Chat and the model run on this machine.

**Characters:** Frieza, Piccolo, Majin Buu. In a solo chat, say something like “summon Piccolo” to add a partner. After that, each of your messages starts a short exchange (three replies each, six lines total). Those lines stream to the UI as they are saved.

```bash
# backend (local)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python api.py
```
```bash
# frontend
cd frontend && npm install && npm run dev
```

The API listens on `http://127.0.0.1:8787`. It expects a local Tabby server at `http://127.0.0.1:5000`.

Install [TabbyAPI](https://github.com/theroyallab/tabbyAPI) if you want a model that runs quickly on 8 GB of VRAM. Load `Qwen2.5-7B-Instruct-exl3` there.

Set `LLM_BACKEND=ollama` to use Ollama instead (`pip install ollama`).

GitHub Pages cannot host the Python process or the model.
