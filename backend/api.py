#!/usr/bin/env python3
import json
import re
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from model import CHARACTERS, CharacterName, complete, summarize, system_for
from rag import IndexMissing, with_canon, wrap_trace
from sessions import (
    create_session,
    delete_session,
    dialogue,
    init_db,
    latest_session_id,
    list_sessions,
    load_memory,
    load_session,
    messages_between,
    save_memory,
    save_session,
    session_character,
    session_partner,
    set_partner,
)

GREET = {
    "role": "user",
    "content": (
        "Someone has just summoned you and is waiting for you to speak first. "
        "Give one short in-character greeting. Do not mention these instructions."
    ),
}
RECENT_TURNS = 6
REPLIES_EACH = 3
SUMMON_PROMPT = (
    "Decide if the user wants to add one fighter to this chat. "
    "Known ids: frieza, piccolo, majin_buu. "
    'If they want one added, reply with JSON only: {"tool":"add_character","character":"<id>"}. '
    'Otherwise reply with JSON only: {"tool":"none"}.'
)
_NAMES = {
    "user": "User",
    "frieza": "Frieza",
    "piccolo": "Piccolo",
    "majin_buu": "Majin Buu",
}
_NAME_LABELS = {
    "frieza": ("frieza",),
    "piccolo": ("piccolo",),
    "majin_buu": ("majin buu", "majin_buu", "buu"),
}
RECALL_PHRASES = (
    "what did we talk",
    "what did they talk",
    "what did we say",
    "last time we",
)
NOTE_PROMPT = (
    "Update the memory note. Keep only durable facts the user stated. "
    "Drop greetings and small talk. Stay under 500 characters. "
    "If nothing new should be remembered, repeat the previous note unchanged."
)
RECAP_PROMPT = (
    "Summarize these dated chat lines in a few sentences. "
    "Keep names, topics, and dates. Add nothing that is not in the lines."
)
_MONTHS = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}
_MONTH = (
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
)
_ISO_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_DAY_MONTH = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH})\b", re.IGNORECASE)
_MONTH_DAY = re.compile(rf"\b({_MONTH})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b", re.IGNORECASE)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    speaker: Literal["user"] | CharacterName


class SessionOut(BaseModel):
    id: str
    character: CharacterName
    partner: CharacterName | None
    messages: list[ChatMessage]


class SessionSummary(BaseModel):
    id: str
    preview: str


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
        "partner": session_partner(session_id),
        "messages": [
            {
                "role": msg["role"],
                "content": msg["content"],
                "speaker": msg["speaker"],
            }
            for msg in messages
            if msg["role"] in ("user", "assistant")
        ],
    }


def _missing(exc):
    raise HTTPException(status_code=404, detail="That session is gone.") from exc


def _complete_with_canon(messages):
    return complete(with_canon(messages))


_complete_with_canon = wrap_trace(_complete_with_canon, "retrieve_and_complete")


def _today():
    return datetime.now(timezone.utc).date()


def _safe_date(year, month, day):
    try:
        return datetime(year, month, day).date()
    except ValueError:
        return None


def _explicit_dates(text, today):
    found = []
    occupied = []

    def overlaps(start, end):
        return any(start < stop and end > begin for begin, stop in occupied)

    for match in _ISO_DATE.finditer(text):
        parsed = _safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if parsed is None:
            continue
        found.append((match.start(), parsed))
        occupied.append((match.start(), match.end()))
    for pattern, day_group, month_group in (
        (_DAY_MONTH, 1, 2),
        (_MONTH_DAY, 2, 1),
    ):
        for match in pattern.finditer(text):
            if overlaps(match.start(), match.end()):
                continue
            month = _MONTHS.get(match.group(month_group).lower())
            parsed = _safe_date(today.year, month, int(match.group(day_group))) if month else None
            if parsed is None:
                continue
            found.append((match.start(), parsed))
            occupied.append((match.start(), match.end()))
    found.sort(key=lambda item: item[0])
    return [item[1] for item in found]


def _asks_about_chat(text):
    if any(phrase in text for phrase in RECALL_PHRASES):
        return True
    if "yesterday" not in text:
        return False
    return any(word in text for word in ("talk", "said", "say", "chat", "we ", "you "))


def recall_span(text, today=None):
    """Inclusive start and exclusive end for a past-chat question, or None."""
    today = today or _today()
    lowered = text.lower()
    if not _asks_about_chat(lowered):
        return None
    dates = _explicit_dates(text, today)
    if len(dates) >= 2:
        start, last = dates[0], dates[-1]
        if last < start:
            start, last = last, start
        return start.isoformat(), (last + timedelta(days=1)).isoformat()
    if len(dates) == 1:
        day = dates[0]
        return day.isoformat(), (day + timedelta(days=1)).isoformat()
    if "yesterday" in lowered:
        day = today - timedelta(days=1)
        return day.isoformat(), today.isoformat()
    start = today - timedelta(days=7)
    return start.isoformat(), (today + timedelta(days=1)).isoformat()


def _latest_user(turns):
    for msg in reversed(turns):
        if msg.get("role") == "user":
            return msg.get("content") or ""
    return ""


def _latest_reply(turns):
    for msg in reversed(turns):
        if msg.get("role") == "assistant":
            return msg.get("content") or ""
    return ""


def _recent(turns):
    kept = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in dialogue(turns)
        if msg.get("role") in ("user", "assistant")
    ]
    return kept[-RECENT_TURNS:]


def _model_messages(session_id, messages, recap=""):
    character = session_character(session_id)
    prompt = [system_for(character)]
    note = load_memory(character).strip()
    if note:
        prompt.append({"role": "system", "content": "What you already know:\n" + note})
    if recap.strip():
        prompt.append({"role": "system", "content": "Earlier chats:\n" + recap.strip()})
    prompt.extend(_recent(messages))
    return prompt


def _lookup_recap(character, turns):
    span = recall_span(_latest_user(turns))
    if span is None:
        return ""
    rows = messages_between(character, span[0], span[1])
    if not rows:
        return ""
    lines = "\n".join(
        f"[{row['created_at']}] {row.get('speaker') or row['role']}: {row['content']}"
        for row in rows
    )
    try:
        return visible_reply(
            summarize(
                [
                    {"role": "system", "content": RECAP_PROMPT},
                    {"role": "user", "content": lines},
                ]
            )
        )
    except Exception as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        return ""


def _refresh_note(character, turns, reply=None):
    previous = load_memory(character)
    spoken = reply if reply is not None else _latest_reply(turns)
    try:
        notes = visible_reply(
            summarize(
                [
                    {"role": "system", "content": NOTE_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"Previous note:\n{previous}\n\n"
                            f"User: {_latest_user(turns)}\n"
                            f"Reply: {spoken}"
                        ),
                    },
                ]
            )
        )
    except Exception as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        return
    save_memory(character, notes)


def _greet_turn(session_id):
    note = load_memory(session_character(session_id)).strip()
    if not note:
        return GREET
    return {
        "role": "user",
        "content": GREET["content"] + " You already know this about them: " + note,
    }


def _speaker_label(who):
    if who in _NAMES:
        return _NAMES[who]
    return str(who).replace("_", " ").title()


def _character_id(name):
    if not isinstance(name, str):
        return None
    key = re.sub(r"[\s-]+", "_", name.strip().lower())
    if key in CHARACTERS:
        return key
    compact = key.replace("_", "")
    if compact in ("buu", "majinbuu"):
        return "majin_buu"
    return None


def _json_object(text):
    if not isinstance(text, str) or not text.strip():
        return None
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if fence:
        stripped = fence.group(1).strip()
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            data = json.loads(stripped[start : end + 1])
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    return data


def _mentions(text, candidates):
    lowered = text.lower()
    patterns = []
    for name in candidates:
        for label in _NAME_LABELS.get(name, (name.replace("_", " "),)):
            patterns.append((name, label))
    patterns.sort(key=lambda item: len(item[1]), reverse=True)
    found = {}
    occupied = []
    for name, label in patterns:
        for match in re.finditer(rf"\b{re.escape(label)}\b", lowered):
            span = (match.start(), match.end())
            if any(span[0] < end and span[1] > start for start, end in occupied):
                continue
            occupied.append(span)
            start = match.start()
            if name not in found or start < found[name]:
                found[name] = start
    return [name for name, _start in sorted(found.items(), key=lambda item: item[1])]


def _paired_address(text, character, partner):
    lowered = text.lower()
    for left in _NAME_LABELS.get(character, ()):
        for right in _NAME_LABELS.get(partner, ()):
            if re.search(rf"\b{re.escape(left)}\s+and\s+{re.escape(right)}\b", lowered):
                return True
            if re.search(rf"\b{re.escape(right)}\s+and\s+{re.escape(left)}\b", lowered):
                return True
    return False


def _comma_addresses(text, candidates):
    lowered = text.lower()
    found = []
    for name in candidates:
        for label in _NAME_LABELS.get(name, ()):
            if re.search(rf"\b{re.escape(label)}\s*,", lowered):
                found.append(name)
                break
    return found


def _leading_address(text, candidates):
    lowered = text.lower().lstrip()
    for name in candidates:
        for label in _NAME_LABELS.get(name, ()):
            if re.match(rf"(?:hey\s+|ok\s+|yo\s+)?{re.escape(label)}\b", lowered):
                return name
    return None


def _first_speaker(text, character, partner):
    """Who opens a duo turn. One addressed fighter goes first; otherwise character 1."""
    if "between you two" in text.lower():
        return character
    mentioned = _mentions(text, (character, partner))
    if len(mentioned) == 1:
        return mentioned[0]
    if len(mentioned) != 2 or _paired_address(text, character, partner):
        return character
    addressed = _comma_addresses(text, mentioned)
    if len(addressed) == 1:
        return addressed[0]
    if len(addressed) > 1:
        return character
    lead = _leading_address(text, mentioned)
    if lead:
        return lead
    return character


def _summon_word(text, character):
    if not re.search(r"\bsummon\b", text, re.IGNORECASE):
        return None
    others = [name for name in CHARACTERS if name != character]
    mentioned = _mentions(text, others)
    return mentioned[0] if mentioned else None


def _choose_partner(user_text, character):
    """One short decision. Invalid JSON falls back to 'summon' plus a known name."""
    try:
        raw = visible_reply(
            complete(
                [
                    {"role": "system", "content": SUMMON_PROMPT},
                    {"role": "user", "content": user_text},
                ]
            )
        )
    except Exception as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        raw = ""
    payload = _json_object(raw)
    if payload is not None and payload.get("tool") != "add_character":
        return None
    if payload is not None:
        chosen = _character_id(payload.get("character"))
        if chosen and chosen != character:
            return chosen
    return _summon_word(user_text, character)


def _heard(speaker, msg):
    who = msg.get("speaker")
    if not isinstance(who, str) or not who.strip():
        who = "user" if msg.get("role") == "user" else speaker
    else:
        who = who.strip()
    content = msg.get("content") or ""
    if who == speaker:
        return {"role": "assistant", "content": content}
    return {"role": "user", "content": f"{_speaker_label(who)}: {content}"}


def _canon_for(user_line):
    prepared = with_canon([{"role": "user", "content": user_line}])
    for msg in prepared:
        content = msg.get("content") or ""
        if msg.get("role") == "system" and content.startswith("Canon passages:"):
            return {"role": "system", "content": content}
    return None


def _prompt_for(speaker, turns, turn_start, recap, canon=None):
    """Prompt for one speaker. This turn stays whole so reply 7 still has the question."""
    prompt = [system_for(speaker)]
    if canon:
        prompt.append(canon)
    note = load_memory(speaker).strip()
    if note:
        prompt.append({"role": "system", "content": "What you already know:\n" + note})
    if recap.strip():
        prompt.append({"role": "system", "content": "Earlier chats:\n" + recap.strip()})
    prior = [
        msg
        for msg in turns[:turn_start]
        if msg.get("role") in ("user", "assistant")
    ]
    current = [
        msg
        for msg in turns[turn_start:]
        if msg.get("role") in ("user", "assistant")
    ]
    prompt.extend(_heard(speaker, msg) for msg in prior[-RECENT_TURNS:])
    prompt.extend(_heard(speaker, msg) for msg in current)
    return prompt


def _raise_model_error(exc):
    print(f"model error: {type(exc).__name__}", file=sys.stderr)
    if isinstance(exc, IndexMissing):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    raise HTTPException(status_code=502, detail="The local model didn't answer.") from exc


def _prepare_turn(turns, character):
    turn_start = len(turns) - 1
    user_line = turns[turn_start].get("content") or ""
    recap = _lookup_recap(character, turns)
    try:
        canon = _canon_for(user_line)
    except Exception as exc:
        _raise_model_error(exc)
    return turn_start, recap, canon


def _complete_line(speaker, turns, turn_start, recap, canon, extra=()):
    prompt = _prompt_for(speaker, turns, turn_start, recap, canon)
    if extra:
        prompt.extend(extra)
    try:
        return visible_reply(complete(prompt))
    except Exception as exc:
        _raise_model_error(exc)


def _store_line(session_id, turns, speaker, text):
    turns.append({"role": "assistant", "content": text, "speaker": speaker})
    save_session(session_id, turns)
    _refresh_note(speaker, turns, reply=text)


def _speak(session_id, speaker, turns, turn_start, recap, canon, extra=()):
    text = _complete_line(speaker, turns, turn_start, recap, canon, extra)
    _store_line(session_id, turns, speaker, text)
    return text


def _greeting_pair(session_id, turns, character, partner):
    turn_start, recap, canon = _prepare_turn(turns, character)
    text = _complete_line(partner, turns, turn_start, recap, canon, extra=(GREET,))
    set_partner(session_id, partner)
    _store_line(session_id, turns, partner, text)
    _speak(session_id, character, turns, turn_start, recap, canon)
    return _view(session_id)


def _duo_exchange(session_id, turns, character, partner):
    turn_start, recap, canon = _prepare_turn(turns, character)
    _run_duo(session_id, turns, character, partner, turn_start, recap, canon)
    return _view(session_id)


def _sse(payload):
    return "data: " + json.dumps(payload) + "\n\n"


def _line_event(msg, partner, nxt):
    return {
        "type": "line",
        "message": {
            "role": msg["role"],
            "content": msg["content"],
            "speaker": msg["speaker"],
        },
        "partner": partner,
        "next": nxt,
    }


def _error_event(exc):
    detail = "The local model didn't answer."
    if isinstance(exc, HTTPException) and isinstance(exc.detail, str) and exc.detail:
        detail = exc.detail
    elif not isinstance(exc, HTTPException):
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
    return _sse({"type": "error", "detail": detail})


def _speakers(user_line, character, partner):
    first = _first_speaker(user_line, character, partner)
    second = partner if first == character else character
    return [first, second] * REPLIES_EACH


def _run_duo(session_id, turns, character, partner, turn_start, recap, canon):
    user_line = turns[turn_start].get("content") or ""
    for speaker in _speakers(user_line, character, partner):
        _speak(session_id, speaker, turns, turn_start, recap, canon)


def _duo_events(session_id, turns, character, partner, turn_start, recap, canon):
    user_line = turns[turn_start].get("content") or ""
    speakers = _speakers(user_line, character, partner)
    yield _sse({"type": "start", "partner": partner, "next": speakers[0]})
    for index, speaker in enumerate(speakers):
        try:
            _speak(session_id, speaker, turns, turn_start, recap, canon)
        except Exception as exc:
            yield _error_event(exc)
            return
        nxt = speakers[index + 1] if index + 1 < len(speakers) else None
        yield _sse(_line_event(turns[-1], partner, nxt))
    yield _sse({"type": "done", "partner": partner})


def _greet_events(session_id, turns, character, partner, turn_start, recap, canon):
    yield _sse({"type": "start", "next": partner})
    try:
        text = _complete_line(partner, turns, turn_start, recap, canon, extra=(GREET,))
        set_partner(session_id, partner)
        _store_line(session_id, turns, partner, text)
    except Exception as exc:
        yield _error_event(exc)
        return
    yield _sse(_line_event(turns[-1], partner, character))
    try:
        _speak(session_id, character, turns, turn_start, recap, canon)
    except Exception as exc:
        yield _error_event(exc)
        return
    yield _sse(_line_event(turns[-1], partner, None))
    yield _sse({"type": "done", "partner": partner})


def _single_reply(session_id, turns, character):
    recap = _lookup_recap(character, turns)
    try:
        text = visible_reply(_complete_with_canon(_model_messages(session_id, turns, recap)))
    except IndexMissing as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        raise HTTPException(
            status_code=502, detail="The local model didn't answer."
        ) from exc
    turns.append({"role": "assistant", "content": text})
    save_session(session_id, turns)
    _refresh_note(character, turns)
    return _view(session_id)


def _answer(session_id, messages):
    turns = dialogue(messages)
    character = session_character(session_id)
    partner = session_partner(session_id)
    if partner:
        return _duo_exchange(session_id, turns, character, partner)
    chosen = _choose_partner(_latest_user(turns), character)
    if chosen:
        return _greeting_pair(session_id, turns, character, chosen)
    return _single_reply(session_id, turns, character)


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


@app.get("/sessions", response_model=list[SessionSummary])
def get_sessions(character: CharacterName):
    return list_sessions(character)


@app.post("/sessions", response_model=SessionOut)
def open_session(body: CreateSessionIn, fresh: bool = False):
    if not fresh:
        existing = latest_session_id(body.character)
        if existing:
            return _view(existing)
    session_id, _messages = create_session(body.character)
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


def _wants_stream(request):
    return "text/event-stream" in request.headers.get("accept", "")


STREAM_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@app.post("/sessions/{session_id}/messages", response_model=SessionOut)
def send_message(session_id: str, body: SendMessageIn, request: Request):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Say something first.")
    try:
        messages = load_session(session_id)
    except LookupError as exc:
        _missing(exc)
    messages.append({"role": "user", "content": content})
    if not _wants_stream(request):
        return _answer(session_id, messages)
    turns = dialogue(messages)
    character = session_character(session_id)
    partner = session_partner(session_id)
    if partner:
        turn_start, recap, canon = _prepare_turn(turns, character)
        return StreamingResponse(
            _duo_events(session_id, turns, character, partner, turn_start, recap, canon),
            media_type="text/event-stream",
            headers=STREAM_HEADERS,
        )
    chosen = _choose_partner(_latest_user(turns), character)
    if not chosen:
        return _single_reply(session_id, turns, character)
    turn_start, recap, canon = _prepare_turn(turns, character)
    return StreamingResponse(
        _greet_events(session_id, turns, character, chosen, turn_start, recap, canon),
        media_type="text/event-stream",
        headers=STREAM_HEADERS,
    )


@app.post("/sessions/{session_id}/greet", response_model=SessionOut)
def greet(session_id: str):
    try:
        messages = load_session(session_id)
    except LookupError as exc:
        _missing(exc)
    turns = dialogue(messages)
    if turns:
        return _view(session_id)
    try:
        text = visible_reply(complete(_model_messages(session_id, turns) + [_greet_turn(session_id)]))
    except Exception as exc:
        print(f"model error: {type(exc).__name__}", file=sys.stderr)
        raise HTTPException(
            status_code=502, detail="The local model didn't answer."
        ) from exc
    turns.append({"role": "assistant", "content": text})
    save_session(session_id, turns)
    return _view(session_id)


if __name__ == "__main__":
    import uvicorn

    backend = Path(__file__).resolve().parent
    uvicorn.run(
        "api:app",
        host="127.0.0.1",
        port=8787,
        reload=True,
        reload_dirs=[str(backend)],
        app_dir=str(backend),
    )
