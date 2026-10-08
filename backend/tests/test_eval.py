import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from eval.run import ask, failure_lines, score, visible_text

GOLDEN = ROOT / "eval" / "golden.json"
PROMPT = ROOT / "prompts" / "frieza.txt"


RADAR = {
    "group": "prompt",
    "must_include": ["bulma"],
    "must_include_any": [],
    "must_not": [],
    "prompt_line": "Bulma built the Dragon Radar.",
}

FACE = {
    "group": "prompt",
    "must_include": [],
    "must_include_any": [],
    "must_not": ["beard", "mustache", "moustache"],
    "prompt_line": "Do not describe a beard, mustache, or stroking facial hair. Frieza has none.",
}

DENDE = {
    "group": "heldout",
    "must_include": ["dende"],
    "must_include_any": [],
    "must_not": [],
    "prompt_line": "Dende became the new Guardian of Earth after Kami fused with Piccolo.",
}


def test_heldout_lines_are_not_already_in_the_prompt():
    items = json.loads(GOLDEN.read_text())
    prompt = PROMPT.read_text().casefold()
    heldout = [item for item in items if item["group"] == "heldout"]
    assert heldout
    for item in items:
        assert item["group"] in ("prompt", "heldout")
        assert item["prompt_line"]
    for item in heldout:
        assert item["prompt_line"].casefold() not in prompt


def test_keyword_hidden_in_think_block_fails():
    reply = "<think>bulma built it</think> I do not recall."
    ok, missing, forbidden = score(reply, RADAR)
    assert not ok
    assert missing == ["bulma"]
    assert forbidden == []


def test_empty_reply_fails():
    ok, missing, forbidden = score("   ", FACE)
    assert not ok
    assert missing == ["(empty reply)"]
    assert forbidden == []

    ok, missing, _forbidden = score("<think>only a thought</think>", FACE)
    assert not ok
    assert missing == ["(empty reply)"]


def test_prompt_failure_names_the_line_to_edit():
    _ok, missing, forbidden = score("I do not recall.", RADAR)
    lines = failure_lines(RADAR, missing, forbidden)
    assert "      edit this line in prompts/frieza.txt:" in lines
    assert "      Bulma built the Dragon Radar." in lines
    assert not any("not in the prompt" in line for line in lines)


def test_prompt_group_asks_the_model():
    items = [
        item
        for item in json.loads(GOLDEN.read_text())
        if item["group"] == "prompt"
    ]
    failed = []
    for item in items:
        reply = ask(item["question"])
        ok, missing, forbidden = score(reply, item)
        if ok:
            continue
        preview = visible_text(reply).replace("\n", " ")[:200]
        detail = "\n".join(failure_lines(item, missing, forbidden))
        failed.append(f"{item['id']}\n{detail}\n      reply: {preview}")
    assert not failed, "\n\n".join(failed)


def test_heldout_failure_names_the_line_to_add():
    _ok, missing, forbidden = score("Kami stayed guardian.", DENDE)
    lines = failure_lines(DENDE, missing, forbidden)
    assert any("not in the prompt" in line for line in lines)
    assert any("only if you want that fact covered" in line for line in lines)
    assert "      Dende became the new Guardian of Earth after Kami fused with Piccolo." in lines
