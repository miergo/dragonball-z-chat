#!/usr/bin/env python3
from model import SYSTEM, complete
# from tts import speak
from sessions import (
    create_session,
    current_session_id,
    init_db,
    list_sessions,
    load_session,
    save_session,
    session_exists,
    set_current,
)


def main():
    init_db()
    session_id = current_session_id()
    if session_id and session_exists(session_id):
        messages = load_session(session_id)
        print(f"Resumed session {session_id}.")
    else:
        session_id, messages = create_session(SYSTEM)
        print(f"Session {session_id}.")

    print("/list   /open <id>   /new   /bye")
    while True:
        try:
            user = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            save_session(session_id, messages)
            print("\nSaved. Bye.")
            return
        if user == "/bye":
            save_session(session_id, messages)
            print(f"Saved session {session_id}. Bye.")
            return
        if user == "/new":
            save_session(session_id, messages)
            session_id, messages = create_session(SYSTEM)
            print(f"New session {session_id}.\n")
            continue
        if user == "/list":
            for row in list_sessions():
                mark = "*" if row["id"] == session_id else " "
                print(f"{mark} {row['id']}  {row['preview']}")
            continue
        if user.startswith("/open "):
            wanted = user.split(maxsplit=1)[1].strip()
            if not session_exists(wanted):
                print(f"No session {wanted}")
                continue
            save_session(session_id, messages)
            session_id = wanted
            messages = load_session(session_id)
            set_current(session_id)
            print(f"Opened session {session_id}.\n")
            continue
        if not user:
            continue
        messages.append({"role": "user", "content": user})
        text = complete(messages)
        messages.append({"role": "assistant", "content": text})
        save_session(session_id, messages)
        print(f"LLM: {text}\n")
        # speak(text)


if __name__ == "__main__":
    main()
