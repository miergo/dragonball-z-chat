import sqlite3
from datetime import datetime, timezone
from pathlib import Path

CHATS_DIR = Path(__file__).parent / "chats"
DB_PATH = CHATS_DIR / "chat.sqlite"
NOTE_MAX = 500
LINE_MAX = 180

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    preview TEXT NOT NULL,
    character TEXT NOT NULL DEFAULT 'frieza',
    partner TEXT
);
CREATE TABLE IF NOT EXISTS messages (
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    position INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT,
    speaker TEXT,
    PRIMARY KEY (session_id, position)
);
CREATE TABLE IF NOT EXISTS memory (
    character TEXT PRIMARY KEY,
    notes TEXT NOT NULL
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
        if "partner" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN partner TEXT")
        message_cols = [row[1] for row in conn.execute("PRAGMA table_info(messages)")]
        if "created_at" not in message_cols:
            conn.execute("ALTER TABLE messages ADD COLUMN created_at TEXT")
        if "speaker" not in message_cols:
            conn.execute("ALTER TABLE messages ADD COLUMN speaker TEXT")
        conn.execute(
            """
            UPDATE messages
            SET speaker = 'user'
            WHERE speaker IS NULL AND role = 'user'
            """
        )
        conn.execute(
            """
            UPDATE messages
            SET speaker = (
                SELECT sessions.character FROM sessions
                WHERE sessions.id = messages.session_id
            )
            WHERE speaker IS NULL AND role = 'assistant'
            """
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


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _created_at_for_save(msg):
    if "created_at" in msg and msg["created_at"] is None:
        return None
    stamp = msg.get("created_at")
    if isinstance(stamp, str) and stamp.strip():
        return stamp
    return _now()


def _clip(text):
    text = text.strip()
    if len(text) <= LINE_MAX:
        return text
    return text[: LINE_MAX - 3].rstrip() + "..."


def _speaker_for(msg, character):
    speaker = msg.get("speaker")
    if isinstance(speaker, str) and speaker.strip():
        return speaker.strip()
    if msg.get("role") == "user":
        return "user"
    if msg.get("role") == "assistant":
        return character
    return None


def _replace_messages(conn, session_id, messages, character):
    conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    for position, msg in enumerate(messages):
        _require_message(msg)
        conn.execute(
            """
            INSERT INTO messages (session_id, position, role, content, created_at, speaker)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                position,
                msg["role"],
                msg["content"],
                _created_at_for_save(msg),
                _speaker_for(msg, character),
            ),
        )


def load_session(session_id):
    sid = _session_id(session_id)
    conn = connect()
    try:
        found = conn.execute(
            "SELECT character FROM sessions WHERE id = ?", (sid,)
        ).fetchone()
        if found is None:
            raise LookupError(f"No session {session_id}")
        character = found[0]
        rows = conn.execute(
            """
            SELECT role, content, created_at, speaker FROM messages
            WHERE session_id = ?
            ORDER BY position
            """,
            (sid,),
        ).fetchall()
        return [
            {
                "role": role,
                "content": content,
                "created_at": created_at,
                "speaker": _speaker_for(
                    {"role": role, "speaker": speaker}, character
                ),
            }
            for role, content, created_at, speaker in rows
        ]
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


def session_partner(session_id):
    sid = _session_id(session_id)
    conn = connect()
    try:
        row = conn.execute(
            "SELECT partner FROM sessions WHERE id = ?", (sid,)
        ).fetchone()
        if row is None:
            raise LookupError(f"No session {session_id}")
        return row[0]
    finally:
        conn.close()


def set_partner(session_id, partner):
    """Store the one partner. A different partner on a full session is refused."""
    if not isinstance(partner, str) or not partner.strip():
        raise ValueError("partner must be a character id")
    partner = partner.strip()
    sid = _session_id(session_id)
    conn = connect()
    try:
        with conn:
            row = conn.execute(
                "SELECT partner FROM sessions WHERE id = ?", (sid,)
            ).fetchone()
            if row is None:
                raise LookupError(f"No session {session_id}")
            current = row[0]
            if current is not None and current != partner:
                raise ValueError("session already has a partner")
            if current == partner:
                return
            conn.execute(
                "UPDATE sessions SET partner = ? WHERE id = ?",
                (partner, sid),
            )
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
                "SELECT character FROM sessions WHERE id = ?", (sid,)
            ).fetchone()
            if found is None:
                raise LookupError(f"No session {session_id}")
            kept = dialogue(messages)
            _replace_messages(conn, sid, kept, found[0])
            conn.execute(
                "UPDATE sessions SET preview = ? WHERE id = ?",
                (preview_of(kept), sid),
            )
    finally:
        conn.close()


def load_memory(character):
    conn = connect()
    try:
        row = conn.execute(
            "SELECT notes FROM memory WHERE character = ?",
            (character,),
        ).fetchone()
        return row[0] if row else ""
    finally:
        conn.close()


def save_memory(character, notes):
    text = (notes or "").strip()[:NOTE_MAX]
    conn = connect()
    try:
        with conn:
            if not text:
                conn.execute("DELETE FROM memory WHERE character = ?", (character,))
            else:
                conn.execute(
                    """
                    INSERT INTO memory (character, notes) VALUES (?, ?)
                    ON CONFLICT(character) DO UPDATE SET notes = excluded.notes
                    """,
                    (character, text),
                )
    finally:
        conn.close()


def messages_between(character, start, end, limit=20):
    """Lines for one character in [start, end). Null timestamps stay out."""
    if start >= end or limit < 1:
        return []
    conn = connect()
    try:
        rows = conn.execute(
            """
            SELECT messages.created_at, messages.role, messages.content, messages.speaker
            FROM messages
            JOIN sessions ON sessions.id = messages.session_id
            WHERE sessions.character = ?
              AND messages.role IN ('user', 'assistant')
              AND messages.created_at IS NOT NULL
              AND messages.created_at >= ?
              AND messages.created_at < ?
            ORDER BY messages.created_at, messages.session_id, messages.position
            LIMIT ?
            """,
            (character, start, end, limit),
        ).fetchall()
        return [
            {
                "created_at": created_at,
                "role": role,
                "content": _clip(content),
                "speaker": speaker,
            }
            for created_at, role, content, speaker in rows
        ]
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
