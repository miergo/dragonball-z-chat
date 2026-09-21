# Dragon Ball Z Chat

Local chat app: talk or type about Dragon Ball Z lore. A local LLM answers in a character’s voice; replies are spoken with TTS.

**Stack:** Python backend (LLM + TTS + API) · TypeScript frontend · OpenAPI → generated TypeScript types.

The app is not implemented yet. When it is:

```bash
# backend (local)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# start the API (command TBD)

# frontend
cd frontend && npm install && npm run dev
```

Runs on local machine only. GitHub Pages cannot host the Python/LLM/TTS process.
