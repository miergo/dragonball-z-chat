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
    assert body["messages"] == []
    session_id = body["id"]

    assert sessions.load_session(session_id) == []

    greeted = client.post(f"/sessions/{session_id}/greet")
    assert greeted.status_code == 200
    assert greeted.json()["messages"] == [
        {"role": "assistant", "content": "Very well."}
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
        {"role": "assistant", "content": "Very well."},
        {"role": "user", "content": "Hey"},
        {"role": "assistant", "content": "Very well."},
    ]

    removed = client.delete(f"/sessions/{session_id}")
    assert removed.status_code == 204
    assert client.get(f"/sessions/{session_id}").status_code == 404


def test_fresh_false_reopens_latest(client):
    first = client.post("/sessions", json={"character": "vegeta"}, params={"fresh": True})
    second = client.post("/sessions", json={"character": "vegeta"}, params={"fresh": True})
    resumed = client.post("/sessions", json={"character": "vegeta"}, params={"fresh": False})
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
        {"role": "user", "content": "Who killed Nappa?"},
        {"role": "assistant", "content": "Vegeta killed Nappa."},
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
    assert stored[0] == {"role": "user", "content": "Who built the Dragon Radar?"}
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
