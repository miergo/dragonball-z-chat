import json
import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import api
import sessions
from model import system_for


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "DB_PATH", tmp_path / "chat.sqlite")
    monkeypatch.setattr(api, "complete", lambda _messages: "Very well.")
    monkeypatch.setattr(api, "summarize", lambda _messages: "Noted.")
    monkeypatch.setattr(api, "with_canon", lambda messages: list(messages))
    with TestClient(api.app) as test_client:
        yield test_client


def test_list_sessions_newest_first_per_character(client):
    first = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True}).json()
    client.post(f"/sessions/{first['id']}/messages", json={"content": "Kaio-ken?"})
    second = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True}).json()
    sessions.create_session("goku")

    listed = client.get("/sessions", params={"character": "frieza"})
    assert listed.status_code == 200
    assert listed.json() == [
        {"id": second["id"], "preview": "No Messages"},
        {"id": first["id"], "preview": "Kaio-ken?"},
    ]


def test_open_fresh_greet_send_and_delete(client):
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    assert created.status_code == 200
    body = created.json()
    assert body["character"] == "frieza"
    assert body["partner"] is None
    assert body["messages"] == []
    session_id = body["id"]

    assert sessions.load_session(session_id) == []

    greeted = client.post(f"/sessions/{session_id}/greet")
    assert greeted.status_code == 200
    assert greeted.json()["messages"] == [
        {"role": "assistant", "content": "Very well.", "speaker": "frieza"}
    ]
    saved = sessions.load_session(session_id)
    assert [msg["role"] for msg in saved] == ["assistant"]
    assert "instructions" not in saved[-1]["content"]

    again = client.post(f"/sessions/{session_id}/greet")
    assert again.json()["messages"] == greeted.json()["messages"]

    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "  Hey  "},
    )
    assert sent.status_code == 200
    assert sent.json()["messages"] == [
        {"role": "assistant", "content": "Very well.", "speaker": "frieza"},
        {"role": "user", "content": "Hey", "speaker": "user"},
        {"role": "assistant", "content": "Very well.", "speaker": "frieza"},
    ]

    removed = client.delete(f"/sessions/{session_id}")
    assert removed.status_code == 204
    assert client.get(f"/sessions/{session_id}").status_code == 404


def test_fresh_false_reopens_latest(client):
    first = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    second = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    resumed = client.post("/sessions", json={"character": "frieza"}, params={"fresh": False})
    assert first.json()["id"] != second.json()["id"]
    assert resumed.json()["id"] == second.json()["id"]

    other = client.post("/sessions", json={"character": "piccolo"})
    assert other.json()["id"] != second.json()["id"]
    assert other.json()["messages"] == []


def test_failed_reply_keeps_saved_history(client, monkeypatch):
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    before = sessions.load_session(session_id)

    def explode(_messages):
        raise RuntimeError("down")

    monkeypatch.setattr(api, "complete", explode)
    failed = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "You there?"},
    )
    assert failed.status_code == 502
    assert sessions.load_session(session_id) == before


def test_unknown_character(client):
    res = client.post("/sessions", json={"character": "beerus"})
    assert res.status_code == 422


def test_canon_context_is_not_saved(client, monkeypatch):
    def fake_with_canon(messages):
        copied = [dict(message) for message in messages]
        copied.insert(
            1,
            {
                "role": "system",
                "content": "Canon passages:\n[vegeta_saga.txt]\nVegeta killed Nappa.",
            },
        )
        return copied

    def fake_complete(messages):
        assert any(message["content"].startswith("Canon passages:") for message in messages)
        return "Vegeta killed Nappa."

    monkeypatch.setattr(api, "with_canon", fake_with_canon)
    monkeypatch.setattr(api, "complete", fake_complete)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Who killed Nappa?"},
    )
    assert sent.status_code == 200
    assert sent.json()["messages"] == [
        {"role": "user", "content": "Who killed Nappa?", "speaker": "user"},
        {"role": "assistant", "content": "Vegeta killed Nappa.", "speaker": "frieza"},
    ]
    saved = sessions.load_session(session_id)
    assert [message["role"] for message in saved] == ["user", "assistant"]
    assert all("Canon passages:" not in message["content"] for message in saved)
    assert all(message["role"] != "system" for message in saved)


def test_old_and_new_sessions_send_the_current_prompt(client, monkeypatch):
    seen = []

    def fake_complete(messages):
        seen.append(messages)
        return "Very well."

    monkeypatch.setattr(api, "complete", fake_complete)
    monkeypatch.setattr(api, "with_canon", lambda messages: list(messages))
    current = system_for("frieza")

    fresh = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    fresh_id = fresh.json()["id"]
    sent = client.post(
        f"/sessions/{fresh_id}/messages",
        json={"content": "Who killed Nappa?"},
    )
    assert sent.status_code == 200
    assert seen[-1][0] == current
    assert all(message["role"] != "system" for message in sessions.load_session(fresh_id))

    old = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    old_id = int(old.json()["id"])
    conn = sqlite3.connect(sessions.DB_PATH)
    conn.execute(
        """
        INSERT INTO messages (session_id, position, role, content)
        VALUES (?, 0, 'system', 'You are Frieza from an older prompt.')
        """,
        (old_id,),
    )
    conn.commit()
    conn.close()

    resent = client.post(
        f"/sessions/{old_id}/messages",
        json={"content": "Who built the Dragon Radar?"},
    )
    assert resent.status_code == 200
    assert seen[-1][0] == current
    assert "older prompt" not in seen[-1][0]["content"]
    stored = sessions.load_session(str(old_id))
    assert stored[0]["role"] == "user"
    assert stored[0]["content"] == "Who built the Dragon Radar?"
    assert all(message["role"] != "system" for message in stored)


def test_greet_does_not_retrieve(client, monkeypatch):
    calls = []

    def track(messages):
        calls.append(messages)
        return list(messages)

    monkeypatch.setattr(api, "with_canon", track)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    greeted = client.post(f"/sessions/{session_id}/greet")
    assert greeted.status_code == 200
    assert calls == []


def test_missing_index_is_a_clear_error(client, monkeypatch, tmp_path):
    import rag

    monkeypatch.setattr(rag, "INDEX_DIR", tmp_path / "missing-index")
    monkeypatch.setattr(api, "with_canon", rag.with_canon)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    failed = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Who killed Nappa?"},
    )
    assert failed.status_code == 503
    assert "python -m rag" in failed.json()["detail"]
    saved = sessions.load_session(session_id)
    assert saved == []


def test_greet_mentions_existing_note(client, monkeypatch):
    seen = []

    def fake_complete(messages):
        seen.append(messages)
        return "Very well."

    monkeypatch.setattr(api, "complete", fake_complete)
    sessions.save_memory("piccolo", "Promised to train Gohan.")
    created = client.post("/sessions", json={"character": "piccolo"}, params={"fresh": True})
    greeted = client.post(f"/sessions/{created.json()['id']}/greet")
    assert greeted.status_code == 200
    assert seen[-1][-1]["content"].endswith(
        "You already know this about them: Promised to train Gohan."
    )
    assert "Promised to train Gohan." not in greeted.json()["messages"][0]["content"]


def test_note_stays_with_its_character(client, monkeypatch):
    seen = []

    def fake_complete(messages):
        seen.append(messages)
        return "Very well."

    monkeypatch.setattr(api, "complete", fake_complete)
    sessions.save_memory("piccolo", "Promised to train Gohan.")

    piccolo = client.post("/sessions", json={"character": "piccolo"}, params={"fresh": True})
    sent = client.post(
        f"/sessions/{piccolo.json()['id']}/messages",
        json={"content": "Hello"},
    )
    assert sent.status_code == 200
    assert any("Promised to train Gohan." in message["content"] for message in seen[-1])

    frieza = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    resent = client.post(
        f"/sessions/{frieza.json()['id']}/messages",
        json={"content": "Hello"},
    )
    assert resent.status_code == 200
    assert all("Promised to train Gohan." not in message["content"] for message in seen[-1])


def test_recall_sends_recap_and_does_not_save_it(client, monkeypatch):
    seen = []
    summaries = []

    def fake_summarize(messages):
        summaries.append(messages)
        if messages[0]["content"] == api.RECAP_PROMPT:
            return "On 11 October you asked to train Gohan."
        return "Promised to train Gohan."

    def fake_complete(messages):
        seen.append(messages)
        return "Very well."

    monkeypatch.setattr(api, "summarize", fake_summarize)
    monkeypatch.setattr(api, "complete", fake_complete)
    created = client.post("/sessions", json={"character": "piccolo"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.save_session(
        session_id,
        [
            {
                "role": "user",
                "content": "Train Gohan tomorrow.",
                "created_at": "2026-10-11T08:00:00Z",
            }
        ],
    )
    frieza, _messages = sessions.create_session("frieza")
    sessions.save_session(
        frieza,
        [{"role": "user", "content": "Frieza secret", "created_at": "2026-10-11T08:00:00Z"}],
    )

    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "What did we talk about from 2026-10-10 to 2026-10-13?"},
    )
    assert sent.status_code == 200
    assert any(
        message["content"] == "Earlier chats:\nOn 11 October you asked to train Gohan."
        for message in seen[-1]
    )
    recap_call = next(
        messages for messages in summaries if messages[0]["content"] == api.RECAP_PROMPT
    )
    assert "Train Gohan tomorrow." in recap_call[1]["content"]
    assert "Frieza secret" not in recap_call[1]["content"]
    saved = sessions.load_session(session_id)
    assert all("Earlier chats:" not in message["content"] for message in saved)
    assert all("On 11 October you asked" not in message["content"] for message in saved)


def test_ordinary_question_skips_lookup(client, monkeypatch):
    summaries = []

    def fake_summarize(messages):
        summaries.append(messages[0]["content"])
        return "Noted."

    monkeypatch.setattr(api, "summarize", fake_summarize)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    sent = client.post(
        f"/sessions/{created.json()['id']}/messages",
        json={"content": "Who killed Nappa?"},
    )
    assert sent.status_code == 200
    assert summaries == [api.NOTE_PROMPT]


def test_lore_questions_skip_lookup(client, monkeypatch):
    summaries = []

    def fake_summarize(messages):
        summaries.append(messages[0]["content"])
        return "Noted."

    monkeypatch.setattr(api, "summarize", fake_summarize)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    for content in (
        "Who won the last time Frieza fought Goku?",
        "What did you say to Goku on Namek?",
    ):
        summaries.clear()
        sent = client.post(
            f"/sessions/{session_id}/messages",
            json={"content": content},
        )
        assert sent.status_code == 200
        assert summaries == [api.NOTE_PROMPT]


def test_summarizer_failure_keeps_reply_and_note(client, monkeypatch):
    def explode(_messages):
        raise RuntimeError("down")

    monkeypatch.setattr(api, "summarize", explode)
    sessions.save_memory("piccolo", "Old promise.")
    created = client.post("/sessions", json={"character": "piccolo"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.save_session(
        session_id,
        [{"role": "user", "content": "Train Gohan.", "created_at": "2026-10-11T08:00:00Z"}],
    )
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "What did we talk about on 2026-10-11?"},
    )
    assert sent.status_code == 200
    assert sent.json()["messages"][-1] == {
        "role": "assistant",
        "content": "Very well.",
        "speaker": "piccolo",
    }
    assert sessions.load_memory("piccolo") == "Old promise."


def test_prompt_keeps_the_recent_turns(client, monkeypatch):
    seen = []

    def fake_complete(messages):
        seen.append(messages)
        return "Very well."

    monkeypatch.setattr(api, "complete", fake_complete)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.save_session(
        session_id,
        [
            {
                "role": "user" if index % 2 == 0 else "assistant",
                "content": f"line {index}",
                "created_at": f"2026-10-01T00:00:0{index}Z",
            }
            for index in range(8)
        ],
    )
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Hello there"},
    )
    assert sent.status_code == 200
    dialogue = [message for message in seen[-1] if message["role"] != "system"]
    assert [message["content"] for message in dialogue] == [
        "line 3",
        "line 4",
        "line 5",
        "line 6",
        "line 7",
        "Hello there",
    ]
    assert set(dialogue[-1]) == {"role", "content"}


def _line_for(messages):
    system = messages[0]["content"]
    if system == system_for("piccolo")["content"]:
        return "Piccolo."
    if system == system_for("frieza")["content"]:
        return "Frieza."
    raise AssertionError("unexpected speaker prompt")


def _assistants(body):
    return [msg for msg in body["messages"] if msg["role"] == "assistant"]


def test_summon_piccolo_stops_after_two_lines(client, monkeypatch):
    calls = []

    def fake_complete(messages):
        calls.append(messages)
        if messages[0]["content"] == api.SUMMON_PROMPT:
            return '{"tool":"add_character","character":"piccolo"}'
        return _line_for(messages)

    monkeypatch.setattr(api, "complete", fake_complete)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    sent = client.post(
        f"/sessions/{created.json()['id']}/messages",
        json={"content": "Summon Piccolo"},
    )
    assert sent.status_code == 200
    body = sent.json()
    assert body["character"] == "frieza"
    assert body["partner"] == "piccolo"
    assistants = _assistants(body)
    assert len(assistants) == 2
    assert [msg["speaker"] for msg in assistants] == ["piccolo", "frieza"]
    assert [msg["content"] for msg in assistants] == ["Piccolo.", "Frieza."]
    assert len(calls) == 3
    assert calls[0][0]["content"] == api.SUMMON_PROMPT


def test_piccolo_directed_question_alternates_six_lines(client, monkeypatch):
    monkeypatch.setattr(api, "complete", lambda messages: _line_for(messages))
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.set_partner(session_id, "piccolo")
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Piccolo, do you think Frieza can beat Raditz?"},
    )
    assert sent.status_code == 200
    body = sent.json()
    assert body["partner"] == "piccolo"
    assistants = _assistants(body)
    assert len(assistants) == api.REPLIES_EACH * 2
    assert [msg["speaker"] for msg in assistants] == ["piccolo", "frieza"] * api.REPLIES_EACH


def test_between_you_two_starts_with_frieza(client, monkeypatch):
    monkeypatch.setattr(api, "complete", lambda messages: _line_for(messages))
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.set_partner(session_id, "piccolo")
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Between you two, who wins?"},
    )
    assert sent.status_code == 200
    assistants = _assistants(sent.json())
    assert len(assistants) == api.REPLIES_EACH * 2
    assert [msg["speaker"] for msg in assistants] == ["frieza", "piccolo"] * api.REPLIES_EACH


def test_one_character_session_appends_one_reply(client, monkeypatch):
    calls = []

    def fake_complete(messages):
        calls.append(messages)
        if messages[0]["content"] == api.SUMMON_PROMPT:
            return '{"tool":"none"}'
        return "Very well."

    monkeypatch.setattr(api, "complete", fake_complete)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    sent = client.post(
        f"/sessions/{created.json()['id']}/messages",
        json={"content": "Who killed Nappa?"},
    )
    assert sent.status_code == 200
    body = sent.json()
    assert body["partner"] is None
    assert body["messages"] == [
        {"role": "user", "content": "Who killed Nappa?", "speaker": "user"},
        {"role": "assistant", "content": "Very well.", "speaker": "frieza"},
    ]
    assert len(calls) == 2


def test_summoning_a_third_character_does_not_add_one(client, monkeypatch):
    calls = []

    def fake_complete(messages):
        calls.append(messages)
        if messages[0]["content"] == api.SUMMON_PROMPT:
            return '{"tool":"add_character","character":"majin_buu"}'
        if messages[0]["content"] == system_for("majin_buu")["content"]:
            raise AssertionError("third character was prompted")
        return _line_for(messages)

    monkeypatch.setattr(api, "complete", fake_complete)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.set_partner(session_id, "piccolo")
    before = len(calls)
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Summon Majin Buu"},
    )
    assert sent.status_code == 200
    body = sent.json()
    assert body["partner"] == "piccolo"
    assert body["character"] == "frieza"
    assistants = _assistants(body)
    assert len(assistants) == api.REPLIES_EACH * 2
    assert "majin_buu" not in {msg["speaker"] for msg in body["messages"]}
    turn_calls = calls[before:]
    assert len(turn_calls) == api.REPLIES_EACH * 2
    assert all(call[0]["content"] != api.SUMMON_PROMPT for call in turn_calls)


def _events(response):
    events = []
    for block in response.text.split("\n\n"):
        data = next((row[6:] for row in block.split("\n") if row.startswith("data: ")), None)
        if data:
            events.append(json.loads(data))
    return events


def test_stream_accept_on_a_single_reply_stays_json(client):
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    sent = client.post(
        f"/sessions/{created.json()['id']}/messages",
        json={"content": "Who killed Nappa?"},
        headers={"Accept": "text/event-stream"},
    )
    assert sent.status_code == 200
    assert sent.headers["content-type"].startswith("application/json")
    assert sent.json()["partner"] is None
    assert len(_assistants(sent.json())) == 1


def test_duo_stream_emits_each_line(client, monkeypatch):
    monkeypatch.setattr(api, "complete", lambda messages: _line_for(messages))
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.set_partner(session_id, "piccolo")
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Piccolo, do you think Frieza can beat Raditz?"},
        headers={"Accept": "text/event-stream"},
    )
    assert sent.status_code == 200
    assert "text/event-stream" in sent.headers["content-type"]
    events = _events(sent)
    lines = [event for event in events if event["type"] == "line"]
    assert events[0] == {"type": "start", "partner": "piccolo", "next": "piccolo"}
    assert [event["message"]["speaker"] for event in lines] == ["piccolo", "frieza"] * api.REPLIES_EACH
    assert len(lines) == 6
    assert lines[0]["next"] == "frieza"
    assert lines[-1]["next"] is None
    assert events[-1] == {"type": "done", "partner": "piccolo"}


def test_duo_stream_reports_an_error_after_a_saved_line(client, monkeypatch):
    calls = {"n": 0}

    def fake_complete(messages):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return _line_for(messages)

    monkeypatch.setattr(api, "complete", fake_complete)
    created = client.post("/sessions", json={"character": "frieza"}, params={"fresh": True})
    session_id = created.json()["id"]
    sessions.set_partner(session_id, "piccolo")
    sent = client.post(
        f"/sessions/{session_id}/messages",
        json={"content": "Piccolo, do you think Frieza can beat Raditz?"},
        headers={"Accept": "text/event-stream"},
    )
    assert sent.status_code == 200
    events = _events(sent)
    assert [event["type"] for event in events] == ["start", "line", "error"]
    assert events[1]["message"]["content"] == "Piccolo."
    stored = client.get(f"/sessions/{session_id}").json()
    assert [msg["content"] for msg in stored["messages"]] == [
        "Piccolo, do you think Frieza can beat Raditz?",
        "Piccolo.",
    ]
