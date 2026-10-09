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

    loaded = sessions.load_session(session_id)
    assert [(msg["role"], msg["content"], msg["speaker"]) for msg in loaded] == [
        ("user", "Who killed Frieza?", "user"),
        ("assistant", "Future Trunks.", "frieza"),
        ("user", "On Earth?", "user"),
    ]
    assert all(msg["created_at"] for msg in loaded)

    sessions.save_session(
        session_id,
        [
            {"role": "user", "content": "Who killed Frieza?", "speaker": "user"},
            {"role": "assistant", "content": "Future Trunks.", "speaker": "piccolo"},
        ],
    )
    spoken = sessions.load_session(session_id)
    assert [msg["speaker"] for msg in spoken] == ["user", "piccolo"]


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
    loaded = sessions.load_session(session_id)
    assert [(msg["role"], msg["content"]) for msg in loaded] == [
        ("user", "Who killed Frieza?"),
        ("assistant", "Future Trunks."),
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

    assert [(msg["role"], msg["content"]) for msg in sessions.load_session(session_id)] == [
        ("user", "Who built the Dragon Radar?"),
        ("assistant", "Bulma."),
    ]


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

    sessions.set_partner(frieza_id, "piccolo")
    assert sessions.session_partner(frieza_id) == "piccolo"
    assert sessions.session_partner(goku_id) is None
    with pytest.raises(ValueError):
        sessions.set_partner(frieza_id, "majin_buu")
    assert sessions.session_partner(frieza_id) == "piccolo"
    assert [item["id"] for item in sessions.list_sessions("frieza")] == [frieza_id]
    assert sessions.list_sessions("piccolo") == []

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
    conn.execute(
        """
        CREATE TABLE messages (
            session_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT,
            PRIMARY KEY (session_id, position)
        )
        """
    )
    conn.execute(
        """
        INSERT INTO messages (session_id, position, role, content, created_at)
        VALUES (1, 0, 'assistant', 'Very well.', '2026-10-01T00:00:00Z')
        """
    )
    conn.commit()
    conn.close()

    sessions.init_db()

    assert sessions.latest_session_id("frieza") == "1"
    assert sessions.session_character("1") == "frieza"
    assert sessions.session_partner("1") is None
    assert sessions.load_session("1")[0]["speaker"] == "frieza"


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


def test_rewrite_keeps_created_at():
    session_id, _messages = sessions.create_session()
    sessions.save_session(
        session_id,
        [{"role": "user", "content": "Train Gohan.", "created_at": "2026-10-10T12:00:00Z"}],
    )
    loaded = sessions.load_session(session_id)
    sessions.save_session(
        session_id,
        loaded + [{"role": "assistant", "content": "At dawn."}],
    )

    again = sessions.load_session(session_id)
    assert again[0]["created_at"] == "2026-10-10T12:00:00Z"
    assert again[1]["created_at"]
    assert again[1]["created_at"] != "2026-10-10T12:00:00Z"


def test_messages_between_filters_character_and_dates():
    piccolo, _piccolo_messages = sessions.create_session("piccolo")
    frieza, _frieza_messages = sessions.create_session("frieza")
    sessions.save_session(
        piccolo,
        [
            {"role": "user", "content": "October talk", "created_at": "2026-10-11T08:00:00Z"},
            {
                "role": "assistant",
                "content": "A" * 400,
                "created_at": "2026-10-11T09:00:00Z",
            },
            {"role": "user", "content": "Later", "created_at": "2026-10-20T08:00:00Z"},
        ],
    )
    sessions.save_session(
        frieza,
        [{"role": "user", "content": "Frieza secret", "created_at": "2026-10-11T08:00:00Z"}],
    )
    conn = sqlite3.connect(sessions.DB_PATH)
    conn.execute(
        """
        INSERT INTO messages (session_id, position, role, content, created_at)
        VALUES (?, 3, 'user', 'No time', NULL)
        """,
        (int(piccolo),),
    )
    conn.commit()
    conn.close()

    rows = sessions.messages_between("piccolo", "2026-10-10", "2026-10-14", limit=10)
    assert [row["content"] for row in rows] == ["October talk", ("A" * 177) + "..."]
    assert all(row["content"] != "Later" for row in rows)
    assert all(row["content"] != "No time" for row in rows)
    assert all(row["content"] != "Frieza secret" for row in rows)


def test_memory_is_capped_per_character():
    sessions.save_memory("piccolo", "p" * 600)
    sessions.save_memory("frieza", "cold")
    assert sessions.load_memory("piccolo") == "p" * 500
    assert sessions.load_memory("frieza") == "cold"
    sessions.save_memory("piccolo", "   ")
    assert sessions.load_memory("piccolo") == ""
