#!/usr/bin/env python3
from model import SYSTEM, complete
from sessions import (
    create_session,
    load_index,
    load_session,
    save_session,
    session_path,
)
from tts import speak


def main():
    index = load_index()
    if index.get("current") and session_path(index["current"]).exists():
        session_id = index["current"]
        messages = load_session(session_id)
        print(f"Resumed session {session_id}.")
    else:
        session_id, messages = create_session(index, SYSTEM)
        print(f"Session {session_id}.")

    print("/list   /open <id>   /new   /bye")
    while True:
        try:
            user = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            save_session(session_id, messages, index)
            print("\nSaved. Bye.")
            return
        if user == "/bye":
            save_session(session_id, messages, index)
            print(f"Saved session {session_id}. Bye.")
            return
        if user == "/new":
            save_session(session_id, messages, index)
            session_id, messages = create_session(index, SYSTEM)
            print(f"New session {session_id}.\n")
            continue
        if user == "/list":
            for row in index["sessions"]:
                mark = "*" if row["id"] == session_id else " "
                print(f"{mark} {row['id']}  {row['preview']}")
            continue
        if user.startswith("/open "):
            wanted = user.split(maxsplit=1)[1].strip()
            if not session_path(wanted).exists():
                print(f"No session {wanted}")
                continue
            save_session(session_id, messages, index)
            session_id = wanted
            messages = load_session(session_id)
            index["current"] = session_id
            print(f"Opened session {session_id}.\n")
            continue
        if not user:
            continue
        messages.append({"role": "user", "content": user})
        text = complete(messages)
        messages.append({"role": "assistant", "content": text})
        save_session(session_id, messages, index)
        print(f"LLM: {text}\n")
        speak(text)


if __name__ == "__main__":
    main()
