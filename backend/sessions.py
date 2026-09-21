import json
from pathlib import Path

CHATS_DIR = Path(__file__).parent / "chats"
INDEX_FILE = CHATS_DIR / "index.json"

def session_path(session_id):
    return CHATS_DIR / f"{session_id}.json"

def new_messages(system):
    return [system.copy()]

def preview_of(messages):
    for msg in messages:
        if msg.get("role") == "user":
            return msg.get("content")[:60]
    return "No Messages"

def load_index():
    if not INDEX_FILE.exists():
        return {"current": None, "sessions": []}
    return json.loads(INDEX_FILE.read_text())

def save_index(index):
    CHATS_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(json.dumps(index, indent=2))
    
def next_session_id(index):
    ids = [int(row["id"]) for row in index["sessions"]]
    return str(max(ids) + 1) if ids else "1"

def load_session(session_id):
    data = json.loads(session_path(session_id).read_text())
    return data["messages"]


def save_session(session_id, messages, index):
    CHATS_DIR.mkdir(parents=True, exist_ok=True)
    session_path(session_id).write_text(
        json.dumps({"id": session_id, "messages": messages}, indent=2)
    )
    index["current"] = session_id
    for row in index["sessions"]:
        if row["id"] == session_id:
            row["preview"] = preview_of(messages)
            save_index(index)
            return
    index["sessions"].append({"id": session_id, "preview": preview_of(messages)})
    save_index(index)
    
def create_session(index, system):
    session_id = next_session_id(index)
    messages = new_messages(system)
    save_session(session_id, messages, index)
    return session_id, messages