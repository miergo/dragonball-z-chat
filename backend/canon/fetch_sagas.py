#!/usr/bin/env python3
"""Download Dragon Ball Z saga pages and keep the intro plus the Plot.

Fandom does not serve the MediaWiki extracts API, so this reads parse wikitext
and turns that into plain text. It does not import the chat API or sessions.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


OUT = Path(__file__).parent
API = "https://dragonball.fandom.com/api.php"
WIKI = "https://dragonball.fandom.com/wiki/"
PAUSE_S = 0.4

# Wiki page title, output path under canon/. z/ is Z, super/ is not.
SAGAS = [
    ("Raditz_Saga", "z/raditz_saga.txt"),
    ("Vegeta_Saga", "z/vegeta_saga.txt"),
    ("Namek_Saga", "z/namek_saga.txt"),
    ("Captain_Ginyu_Saga", "z/captain_ginyu_saga.txt"),
    ("Frieza_Saga", "z/frieza_saga.txt"),
    ("Garlic_Jr._Saga", "z/garlic_jr_saga.txt"),
    ("Trunks_Saga", "z/trunks_saga.txt"),
    ("Androids_Saga", "z/androids_saga.txt"),
    ("Imperfect_Cell_Saga", "z/imperfect_cell_saga.txt"),
    ("Perfect_Cell_Saga", "z/perfect_cell_saga.txt"),
    ("Cell_Games_Saga", "z/cell_games_saga.txt"),
    ("Other_World_Saga", "z/other_world_saga.txt"),
    ("Great_Saiyaman_Saga", "z/great_saiyaman_saga.txt"),
    ("World_Tournament_Saga", "z/world_tournament_saga.txt"),
    ("Babidi_Saga", "z/babidi_saga.txt"),
    ("Majin_Buu_Saga", "z/majin_buu_saga.txt"),
    ("Fusion_Saga", "z/fusion_saga.txt"),
    ("Kid_Buu_Saga", "z/kid_buu_saga.txt"),
    ("Gods_of_the_Universe_Saga", "super/gods_of_the_universe_saga.txt"),
    ("Peaceful_World_Saga", "z/peaceful_world_saga.txt"),
]

_HEADING = re.compile(r"^(=+)([^=].*?)\1\s*$")
_LINK = re.compile(r"\[\[(.*?)\]\]", re.DOTALL)
_TAG = re.compile(r"<[^>]+>")
_BOLD = re.compile(r"''+")


_DROP_TEMPLATES = {
    "seealso",
    "spoiler",
    "scroll box",
    "main",
    "quote",
    "gallery",
    "sagas",
    "directory",
}


def _read_template(text: str, start: int) -> tuple[str, int]:
    depth = 0
    j = start
    while j < len(text) - 1:
        if text.startswith("{{", j):
            depth += 1
            j += 2
        elif text.startswith("}}", j):
            depth -= 1
            j += 2
            if depth == 0:
                return text[start + 2 : j - 2], j
        else:
            j += 1
    return "", len(text)


def _template_text(inner: str) -> str:
    name, _, rest = inner.partition("|")
    key = name.strip().casefold()
    if "infobox" in key or key.startswith("cite") or key in _DROP_TEMPLATES:
        return ""
    if not rest:
        return ""
    first = rest.split("|", 1)[0].strip()
    if "=" in first:
        return ""
    return first


def strip_templates(text: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(text):
        if text.startswith("{{", i):
            inner, i = _read_template(text, i)
            out.append(_template_text(inner))
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def strip_files(text: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(text):
        if text.startswith("[[", i) and _file_prefix(text, i + 2):
            depth = 0
            j = i
            while j < len(text) - 1:
                if text.startswith("[[", j):
                    depth += 1
                    j += 2
                elif text.startswith("]]", j):
                    depth -= 1
                    j += 2
                    if depth == 0:
                        break
                else:
                    j += 1
            else:
                j = len(text)
            i = j
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def _file_prefix(text: str, i: int) -> bool:
    head = text[i : i + 6].casefold()
    return head.startswith("file:") or head.startswith("image:")


def _link_label(inner: str) -> str:
    label = inner.split("|")[-1].strip()
    if label.casefold().startswith(("category:", "file:", "image:")):
        return ""
    if ":" in inner.split("|")[0] and "|" not in inner:
        return ""
    return label


def wiki_to_text(wikitext: str) -> str:
    text = strip_files(wikitext)
    text = strip_templates(text)
    text = _LINK.sub(lambda match: _link_label(match.group(1)), text)
    text = _BOLD.sub("", text)
    text = text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    text = re.sub(r"<gallery\b[^>]*>.*?</gallery>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = _TAG.sub("", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _heading(line: str) -> tuple[int, str] | None:
    match = _HEADING.match(line.strip())
    if not match:
        return None
    return len(match.group(1)), match.group(2).strip()


def keep_intro_and_plot(wikitext: str) -> str:
    """Return the lead intro and the Plot section, including plot subsections."""
    lines = wiki_to_text(wikitext).splitlines()
    plot_at = None
    for index, line in enumerate(lines):
        heading = _heading(line)
        if heading == (2, "Plot") or (heading and heading[0] == 2 and heading[1].casefold() == "plot"):
            plot_at = index
            break
    if plot_at is None:
        raise LookupError("no Plot heading")

    kept = lines[: plot_at + 1]
    for line in lines[plot_at + 1 :]:
        heading = _heading(line)
        if heading and heading[0] == 2:
            break
        kept.append(line)

    presented: list[str] = []
    for line in kept:
        heading = _heading(line)
        presented.append(heading[1] if heading else line)
    body = "\n".join(presented)
    body = re.sub(r"[ \t]{2,}", " ", body)
    body = re.sub(r" +([,.;:])", r"\1", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def display_title(page: str) -> str:
    return page.replace("_", " ")


def fetch_wikitext(page: str) -> str:
    query = urllib.parse.urlencode(
        {"action": "parse", "page": page, "prop": "wikitext", "format": "json"}
    )
    req = urllib.request.Request(
        f"{API}?{query}",
        headers={"User-Agent": "dragonball-z-chat saga fetch"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.load(resp)
    return payload["parse"]["wikitext"]["*"]


def page_text(page: str, body: str) -> str:
    return f"{display_title(page)}\n{WIKI}{page}\n\n{body.strip()}\n"


def main() -> None:
    failures: list[str] = []
    
    for index, (page, filename) in enumerate(SAGAS):
        path = OUT / filename
        if path.exists():
            print(f"skip {filename} already exists", file=sys.stderr)
            continue
        if index:
            time.sleep(PAUSE_S)
        try:
            body = keep_intro_and_plot(fetch_wikitext(page))
        except (LookupError, KeyError, urllib.error.URLError) as exc:
            print(f"FAIL  {page}: {exc}", file=sys.stderr)
            failures.append(page)
            continue
        
        
        path = OUT / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(page_text(page, body), encoding="utf-8")
        print(f"wrote {filename}")
    if failures:
        print("missing Plot or page:", ", ".join(failures), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
