import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import api
import sessions


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "DB_PATH", tmp_path / "chat.sqlite")
    monkeypatch.setattr(api, "complete", lambda _messages: "Very well.")
    with TestClient(api.app) as test_client:
        yield test_client


def test_open_fresh_greet_send_and_delete(client):
    created = client.post("/sessions", json={"character": "goku"}, params={"fresh": True})
    assert created.status_code == 200
    body = created.json()
    assert body["character"] == "goku"
    assert body["messages"] == []
    session_id = body["id"]

    stored = sessions.load_session(session_id)
    assert stored == [{"role": "system", "content": stored[0]["content"]}]
    assert "Goku" in stored[0]["content"]

    greeted = client.post(f"/sessions/{session_id}/greet")
    assert greeted.status_code == 200
    assert greeted.json()["messages"] == [
        {"role": "assistant", "content": "Very well."}
    ]
    saved = sessions.load_session(session_id)
    assert [msg["role"] for msg in saved] == ["system", "assistant"]
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
    created = client.post("/sessions", json={"character": "krillin"}, params={"fresh": True})
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
