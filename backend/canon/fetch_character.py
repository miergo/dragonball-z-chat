#!/usr/bin/env python3
"""Save a character wiki page under canon/characters for the RAG index.

Keeps the lead intro, Appearance, and Personality. Does not write the voice
prompt, import the chat API or sessions, or download again when the file exists.
"""

from __future__ import annotations

import re
import sys
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from canon.fetch_sagas import (  # noqa: E402
    _heading,
    display_title,
    fetch_wikitext,
    page_text,
    wiki_to_text,
)


CHARACTERS = Path(__file__).parent / "characters"


def _present(lines: list[str]) -> str:
    presented: list[str] = []
    for line in lines:
        heading = _heading(line)
        presented.append(heading[1] if heading else line)
    body = "\n".join(presented)
    body = re.sub(r"[ \t]{2,}", " ", body)
    body = re.sub(r" +([,.;:])", r"\1", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def keep_intro_appearance_personality(wikitext: str) -> str:
    """Return the lead intro plus Appearance and Personality, with subsections."""
    lines = wiki_to_text(wikitext).splitlines()
    intro: list[str] = []
    sections: dict[str, list[str]] = {}
    current: list[str] | None = None
    for line in lines:
        heading = _heading(line)
        if heading and heading[0] == 2:
            current = [line]
            sections[heading[1].casefold()] = current
            continue
        if current is None:
            intro.append(line)
        else:
            current.append(line)

    missing = [name for name in ("Appearance", "Personality") if name.casefold() not in sections]
    if missing:
        raise LookupError("missing " + " and ".join(missing))

    kept = intro + sections["appearance"] + sections["personality"]
    return _present(kept)


def slug_for(page: str) -> str:
    return display_title(page).casefold().replace(" ", "_")


def page_arg(argv: list[str]) -> str:
    if len(argv) < 2 or not " ".join(argv[1:]).strip():
        raise SystemExit("usage: python canon/fetch_character.py Frieza")
    return " ".join(argv[1:]).strip().replace(" ", "_")


def main() -> None:
    page = page_arg(sys.argv)
    slug = slug_for(page)
    source = CHARACTERS / f"{slug}.txt"
    CHARACTERS.mkdir(parents=True, exist_ok=True)

    if source.is_file():
        print(f"skip {source.name} already exists", file=sys.stderr)
        return

    try:
        body = keep_intro_appearance_personality(fetch_wikitext(page))
    except (LookupError, KeyError, urllib.error.URLError) as exc:
        print(f"FAIL  {page}: {exc}", file=sys.stderr)
        sys.exit(1)
    source.write_text(page_text(page, body), encoding="utf-8")
    print(f"wrote {source.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
