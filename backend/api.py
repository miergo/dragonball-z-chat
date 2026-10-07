#!/usr/bin/env python3
import re
import sys
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from model import CHARACTERS, CharacterName, complete, system_for
from sessions import (
    create_session,
    delete_session,
    init_db,
    latest_session_id,
    load_session,
    save_session,
    session_character,
    set_current,
)

GREET = {
    "role": "user",
    "content": (
        "Someone has just summoned you and is waiting for you to speak first. "
        "Give one short in-character greeting. Do not mention these instructions."
    ),
}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SessionOut(BaseModel):
    id: str
    character: CharacterName
    messages: list[ChatMessage]


class CreateSessionIn(BaseModel):
    character: CharacterName


class SendMessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


def visible_reply(text):
    if not isinstance(text, str):
        raise RuntimeError("empty model reply")
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if not cleaned:
        raise RuntimeError("empty model reply")
    return cleaned


def _view(session_id):
    messages = load_session(session_id)
    return {
        "id": str(session_id),
        "character": session_character(session_id),
        "messages": [
            {"role": msg["role"], "content": msg["content"]}
            for msg in messages
            if msg["role"] in ("user", "assistant")
        ],
    }


def _missing(exc):
    raise HTTPException(status_code=404, detail="That session is gone.") from exc


def _answer(session_id, messages):
    try:
        text = visible_reply(complete(messages))
    except Exception as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        raise HTTPException(
            status_code=502, detail="The local model didn't answer."
        ) from exc
    messages.append({"role": "assistant", "content": text})
    save_session(session_id, messages)
    return _view(session_id)


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = FastAPI(title="Dragon Ball Z Chat", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "characters": list(CHARACTERS)}


@app.post("/sessions", response_model=SessionOut)
def open_session(body: CreateSessionIn, fresh: bool = False):
    if not fresh:
        existing = latest_session_id(body.character)
        if existing:
            set_current(existing)
            return _view(existing)
    session_id, _messages = create_session(system_for(body.character), body.character)
    return _view(session_id)


@app.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str):
    try:
        return _view(session_id)
    except LookupError as exc:
        _missing(exc)


@app.delete("/sessions/{session_id}", status_code=204)
def remove_session(session_id: str):
    try:
        delete_session(session_id)
    except LookupError as exc:
        _missing(exc)


@app.post("/sessions/{session_id}/messages", response_model=SessionOut)
def send_message(session_id: str, body: SendMessageIn):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Say something first.")
    try:
        messages = load_session(session_id)
    except LookupError as exc:
        _missing(exc)
    messages.append({"role": "user", "content": content})
    return _answer(session_id, messages)


@app.post("/sessions/{session_id}/greet", response_model=SessionOut)
def greet(session_id: str):
    try:
        messages = load_session(session_id)
    except LookupError as exc:
        _missing(exc)
    if any(msg["role"] != "system" for msg in messages):
        return _view(session_id)
    try:
        text = visible_reply(complete(messages + [GREET]))
    except Exception as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        raise HTTPException(
            status_code=502, detail="The local model didn't answer."
        ) from exc
    messages.append({"role": "assistant", "content": text})
    save_session(session_id, messages)
    return _view(session_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8787)
