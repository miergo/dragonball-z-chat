#!/usr/bin/env python3
import json
import os
import urllib.request
from pathlib import Path
from typing import Literal, get_args


# "tabby" talks to the local TabbyAPI server; "ollama" keeps the previous client.
BACKEND = os.environ.get("LLM_BACKEND", "tabby")
OLLAMA_MODEL = "kwangsuklee/Qwen3.5-9B.Q4_K_M-Claude-4.6-Opus-Reasoning-Distilled-v2:latest"
TABBY_URL = os.environ.get("TABBY_URL", "http://127.0.0.1:5000/v1/chat/completions")
TABBY_MODEL = os.environ.get("TABBY_MODEL", "Qwen2.5-7B-Instruct-exl3")

TABBY_API_KEY = os.environ.get("TABBY_API_KEY", os.environ.get("TABBY_API_KEY"))
if not TABBY_API_KEY:
    raise RuntimeError("Set TABBY_API_KEY to the key in .env")

MODEL = TABBY_MODEL if BACKEND == "tabby" else OLLAMA_MODEL
CharacterName = Literal[
    "frieza",
    "goku",
    "vegeta",
    "piccolo",
    "gohan",
    "trunks",
    "krillin",
]
CHARACTERS = get_args(CharacterName)
PROMPTS = Path(__file__).parent / "prompts"


def system_for(character):
    if character not in CHARACTERS:
        raise ValueError(f"Unknown character {character}")
    path = PROMPTS / f"{character}.txt"
    return {"role": "system", "content": path.read_text(encoding="utf-8").strip()}


SYSTEM = system_for("frieza")


def complete(messages):
    if BACKEND == "tabby":
        return _complete_tabby(messages)
    if BACKEND == "ollama":
        from ollama import chat as chat_ollama

        reply = chat_ollama(OLLAMA_MODEL, messages, stream=False)
        return reply.message.content
    raise ValueError(f"Unknown LLM_BACKEND {BACKEND!r} (use 'tabby' or 'ollama')")


def _complete_tabby(messages):
    if not TABBY_API_KEY:
        raise RuntimeError("Set TABBY_API_KEY to the key in tabbyAPI/api_tokens.yml")
    body = json.dumps(
        {"model": TABBY_MODEL, "messages": messages, "stream": False}
    ).encode()
    req = urllib.request.Request(
        TABBY_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {TABBY_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)
    return payload["choices"][0]["message"]["content"]
