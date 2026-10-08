import sqlite3
import sys
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import sessions


@pytest.fixture(autouse=True)
def chat_db(tmp_path, monkeypatch):
    monkeypatch.setattr(sessions, "DB_PATH", tmp_path / "chat.sqlite")
    sessions.init_db()


def test_create_assigns_increasing_ids():
    first_id, first_messages = sessions.create_session()
    second_id, second_messages = sessions.create_session()

    assert first_id == "1"
    assert second_id == "2"
    assert first_messages == []
    assert second_messages == []
    assert sessions.load_session(first_id) == []
    assert sessions.load_session(second_id) == []


def test_save_load_roundtrip_preserves_order():
    session_id, messages = sessions.create_session()
    messages = messages + [
        {"role": "user", "content": "Who killed Frieza?"},
        {"role": "assistant", "content": "Future Trunks."},
        {"role": "user", "content": "On Earth?"},
    ]

    sessions.save_session(session_id, messages)

    assert sessions.load_session(session_id) == messages


def test_missing_session():
    with pytest.raises(LookupError):
        sessions.load_session("9")
    with pytest.raises(LookupError):
        sessions.load_session("nope")


def test_save_drops_system_rows():
    session_id, _messages = sessions.create_session()
    sessions.save_session(
        session_id,
        [
            {"role": "system", "content": "Old prompt."},
            {"role": "user", "content": "Who killed Frieza?"},
            {"role": "assistant", "content": "Future Trunks."},
        ],
    )
    assert sessions.load_session(session_id) == [
        {"role": "user", "content": "Who killed Frieza?"},
        {"role": "assistant", "content": "Future Trunks."},
    ]


def test_failed_save_keeps_previous_messages():
    session_id, messages = sessions.create_session()
    saved = messages + [
        {"role": "user", "content": "Who built the Dragon Radar?"},
        {"role": "assistant", "content": "Bulma."},
    ]
    sessions.save_session(session_id, saved)

    with pytest.raises(ValueError):
        sessions.save_session(
            session_id,
            saved
            + [
                {"role": "user", "content": "And the radar's inventor?"},
                {"role": "assistant"},
            ],
        )

    assert sessions.load_session(session_id) == saved


def test_concurrent_creates_get_distinct_ids():
    results = []
    errors = []

    def create():
        try:
            session_id, _ = sessions.create_session()
            results.append(session_id)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=create) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert len(results) == 2
    assert len(set(results)) == 2
    for session_id in results:
        assert sessions.load_session(session_id) == []


def test_character_latest_and_delete():
    frieza_id, _ = sessions.create_session("frieza")
    goku_id, _ = sessions.create_session("goku")
    assert sessions.session_character(goku_id) == "goku"
    assert sessions.latest_session_id("goku") == goku_id
    assert sessions.latest_session_id("frieza") == frieza_id
    assert sessions.latest_session_id("vegeta") is None

    sessions.delete_session(goku_id)
    assert sessions.latest_session_id("goku") is None
    assert sessions.load_session(frieza_id) == []
    with pytest.raises(LookupError):
        sessions.load_session(goku_id)
    with pytest.raises(LookupError):
        sessions.delete_session(goku_id)


def test_migrate_adds_character_column(tmp_path, monkeypatch):
    db = tmp_path / "old.sqlite"
    monkeypatch.setattr(sessions, "DB_PATH", db)
    conn = sqlite3.connect(db)
    conn.execute(
        "CREATE TABLE sessions (id INTEGER PRIMARY KEY, preview TEXT NOT NULL)"
    )
    conn.execute("INSERT INTO sessions (preview) VALUES ('No Messages')")
    conn.commit()
    conn.close()

    sessions.init_db()

    assert sessions.latest_session_id("frieza") == "1"
    assert sessions.session_character("1") == "frieza"


def test_persistence_across_connections():
    session_id, messages = sessions.create_session()
    messages = messages + [{"role": "user", "content": "Name the eternal dragon."}]
    sessions.save_session(session_id, messages)

    conn = sqlite3.connect(sessions.DB_PATH)
    try:
        stored = conn.execute(
            """
            SELECT role, content FROM messages
            WHERE session_id = ?
            ORDER BY position
            """,
            (int(session_id),),
        ).fetchall()
        preview = conn.execute(
            "SELECT preview FROM sessions WHERE id = ?",
            (int(session_id),),
        ).fetchone()
    finally:
        conn.close()

    assert stored == [
        ("user", "Name the eternal dragon."),
    ]
    assert preview[0] == "Name the eternal dragon."
