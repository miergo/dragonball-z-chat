import sqlite3
from pathlib import Path

CHATS_DIR = Path(__file__).parent / "chats"
DB_PATH = CHATS_DIR / "chat.sqlite"

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    preview TEXT NOT NULL,
    character TEXT NOT NULL DEFAULT 'frieza'
);
CREATE TABLE IF NOT EXISTS messages (
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    position INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (session_id, position)
);
"""


def dialogue(messages):
    """User and assistant turns. System text stays in the prompt file."""
    return [dict(msg) for msg in messages if msg.get("role") != "system"]


def preview_of(messages):
    for msg in messages:
        if msg.get("role") == "user":
            return msg.get("content")[:60]
    return "No Messages"


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        cols = [row[1] for row in conn.execute("PRAGMA table_info(sessions)")]
        if "character" not in cols:
            conn.execute(
                "ALTER TABLE sessions ADD COLUMN character TEXT NOT NULL DEFAULT 'frieza'"
            )
        conn.commit()
    finally:
        conn.close()


def _session_id(session_id):
    try:
        return int(session_id)
    except (TypeError, ValueError):
        raise LookupError(f"No session {session_id}") from None


def _require_message(msg):
    if "role" not in msg or "content" not in msg:
        raise ValueError("message missing role or content")
    if not isinstance(msg["role"], str) or not isinstance(msg["content"], str):
        raise ValueError("message role and content must be strings")


def _replace_messages(conn, session_id, messages):
    conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    for position, msg in enumerate(messages):
        _require_message(msg)
        conn.execute(
            """
            INSERT INTO messages (session_id, position, role, content)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, position, msg["role"], msg["content"]),
        )


def load_session(session_id):
    sid = _session_id(session_id)
    conn = connect()
    try:
        found = conn.execute(
            "SELECT 1 FROM sessions WHERE id = ?", (sid,)
        ).fetchone()
        if found is None:
            raise LookupError(f"No session {session_id}")
        rows = conn.execute(
            """
            SELECT role, content FROM messages
            WHERE session_id = ?
            ORDER BY position
            """,
            (sid,),
        ).fetchall()
        return [{"role": role, "content": content} for role, content in rows]
    finally:
        conn.close()


def session_character(session_id):
    sid = _session_id(session_id)
    conn = connect()
    try:
        row = conn.execute(
            "SELECT character FROM sessions WHERE id = ?", (sid,)
        ).fetchone()
        if row is None:
            raise LookupError(f"No session {session_id}")
        return row[0]
    finally:
        conn.close()


def latest_session_id(character):
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id FROM sessions WHERE character = ? ORDER BY id DESC LIMIT 1",
            (character,),
        ).fetchone()
        return str(row[0]) if row else None
    finally:
        conn.close()


def list_sessions(character):
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT id, preview FROM sessions WHERE character = ? ORDER BY id DESC",
            (character,),
        ).fetchall()
        return [{"id": str(sid), "preview": preview} for sid, preview in rows]
    finally:
        conn.close()


def delete_session(session_id):
    sid = _session_id(session_id)
    conn = connect()
    try:
        with conn:
            found = conn.execute(
                "SELECT 1 FROM sessions WHERE id = ?", (sid,)
            ).fetchone()
            if found is None:
                raise LookupError(f"No session {session_id}")
            conn.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
            conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
    finally:
        conn.close()


def save_session(session_id, messages):
    sid = _session_id(session_id)
    conn = connect()
    try:
        with conn:
            found = conn.execute(
                "SELECT 1 FROM sessions WHERE id = ?", (sid,)
            ).fetchone()
            if found is None:
                raise LookupError(f"No session {session_id}")
            kept = dialogue(messages)
            _replace_messages(conn, sid, kept)
            conn.execute(
                "UPDATE sessions SET preview = ? WHERE id = ?",
                (preview_of(kept), sid),
            )
    finally:
        conn.close()


def create_session(character="frieza"):
    conn = connect()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO sessions (preview, character) VALUES (?, ?)",
                ("No Messages", character),
            )
            sid = cur.lastrowid
        return str(sid), []
    finally:
        conn.close()
