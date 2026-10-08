#!/usr/bin/env python3
"""Score Frieza against the golden set.

Each question is retrieved from the Z canon index, then sent to the model.
On a failure the retrieved passages are printed first. If the right fact is
not in those passages, the search missed. If it is there, the model ignored it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

GOLDEN_PATH = Path(__file__).parent / "golden.json"
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def visible_text(text: str) -> str:
    """Same cleaning as api.visible_reply, without raising on an empty reply."""
    if not isinstance(text, str):
        return ""
    return _THINK.sub("", text).strip()


def score(reply: str, item: dict) -> tuple[bool, list[str], list[str]]:
    text = visible_text(reply).casefold()
    if not text:
        return False, ["(empty reply)"], []

    missing: list[str] = []
    forbidden: list[str] = []

    for needle in item.get("must_include") or []:
        if needle.casefold() not in text:
            missing.append(needle)

    for group in item.get("must_include_any") or []:
        if not group:
            continue
        if not any(opt.casefold() in text for opt in group):
            missing.append(" or ".join(group))

    for needle in item.get("must_not") or []:
        if needle.casefold() in text:
            forbidden.append(needle)

    return not missing and not forbidden, missing, forbidden


def failure_lines(item: dict, missing: list[str], forbidden: list[str]) -> list[str]:
    lines: list[str] = []
    if missing:
        lines.append(f"      missing: {missing}")
    if forbidden:
        lines.append(f"      forbidden: {forbidden}")
    prompt_line = item.get("prompt_line") or ""
    if item.get("group") == "heldout":
        lines.append(
            "      not in the prompt. Add this line to prompts/frieza.txt only if you want that fact covered:"
        )
    else:
        lines.append("      edit this line in prompts/frieza.txt:")
    lines.append(f"      {prompt_line}")
    return lines


def group_of(item: dict) -> str:
    return "heldout" if item.get("group") == "heldout" else "prompt"


def retrieved_lines(passages) -> list[str]:
    if not passages:
        return ["      retrieved: (none)"]
    lines = []
    for passage in passages:
        text = passage.text.replace("\n", " ").strip()
        lines.append(f"      retrieved: [{passage.source}] {text}")
    return lines


_traced_ask = None


def _ask_once(question: str):
    from model import SYSTEM, complete
    from rag import prepare

    messages, passages = prepare(
        [SYSTEM, {"role": "user", "content": question}]
    )
    return complete(messages), passages


def ask_with_passages(question: str):
    global _traced_ask
    from rag import wrap_trace

    if _traced_ask is None:
        _traced_ask = wrap_trace(_ask_once, "retrieve_and_complete")
    return _traced_ask(question)


def ask(question: str) -> str:
    reply, _passages = ask_with_passages(question)
    return reply


def _joined_passages(passages) -> str:
    return "\n".join(passage.text for passage in passages)


def _run_retrieval(items) -> None:
    """Hit when the retrieved text satisfies the same checks as score."""
    from rag import default_embeddings, retrieve

    embeddings = default_embeddings()
    counts = {
        "prompt": {"passed": 0, "total": 0},
        "heldout": {"passed": 0, "total": 0},
    }
    print(f"Items: {len(items)} (retrieval only)\n")

    for item in items:
        item_id = item["id"]
        bucket = group_of(item)
        counts[bucket]["total"] += 1
        try:
            passages = retrieve(item["question"], embeddings=embeddings)
        except Exception as exc:  # noqa: BLE001 — report and continue
            print(f"FAIL  {item_id}  [{bucket}]")
            print(f"      error: {exc}\n")
            continue

        ok, missing, forbidden = score(_joined_passages(passages), item)
        label = "PASS" if ok else "FAIL"
        if ok:
            counts[bucket]["passed"] += 1
        print(f"{label}  {item_id}  [{bucket}]")
        if not ok:
            sources = ", ".join(passage.source for passage in passages) or "(none)"
            print(f"      sources: {sources}")
            if missing:
                print(f"      missing: {missing}")
            if forbidden:
                print(f"      forbidden: {forbidden}")
        print()

    prompt = counts["prompt"]
    heldout = counts["heldout"]
    prompt_rate = (prompt["passed"] / prompt["total"]) if prompt["total"] else 1.0
    heldout_rate = (heldout["passed"] / heldout["total"]) if heldout["total"] else 0.0
    total_passed = prompt["passed"] + heldout["passed"]
    total = prompt["total"] + heldout["total"]
    rate = (total_passed / total) if total else 1.0
    print(f"Prompt: {prompt['passed']}/{prompt['total']} ({prompt_rate:.0%})")
    print(f"Held-out: {heldout['passed']}/{heldout['total']} ({heldout_rate:.0%})")
    print(f"Hit rate: {total_passed}/{total} ({rate:.0%})")


def main() -> None:
    parser = argparse.ArgumentParser(description="DB/DBZ golden eval")
    parser.add_argument("--limit", type=int, default=0, help="Max items (0 = all)")
    parser.add_argument(
        "--min-pass",
        type=float,
        default=0.0,
        help="Exit 1 if the prompt-group pass rate is below this (default 0.0). Held-out misses do not fail the run.",
    )
    parser.add_argument(
        "--retrieval-only",
        action="store_true",
        help="Score retrieved passages and skip the model.",
    )
    args = parser.parse_args()

    items = json.loads(GOLDEN_PATH.read_text())
    if args.limit > 0:
        items = items[: args.limit]

    if args.retrieval_only:
        _run_retrieval(items)
        return

    from model import MODEL

    counts = {
        "prompt": {"passed": 0, "total": 0},
        "heldout": {"passed": 0, "total": 0},
    }
    print(f"Model: {MODEL}")
    print(f"Items: {len(items)}\n")

    for item in items:
        item_id = item["id"]
        bucket = group_of(item)
        counts[bucket]["total"] += 1
        try:
            raw, passages = ask_with_passages(item["question"])
        except Exception as exc:  # noqa: BLE001 — report and continue
            print(f"FAIL  {item_id}  [{bucket}]")
            print(f"      error: {exc}\n")
            continue

        ok, missing, forbidden = score(raw, item)
        label = "PASS" if ok else "FAIL"
        if ok:
            counts[bucket]["passed"] += 1
        preview = visible_text(raw).replace("\n", " ")[:200]
        print(f"{label}  {item_id}  [{bucket}]")
        if not ok:
            for line in retrieved_lines(passages):
                print(line)
            for line in failure_lines(item, missing, forbidden):
                print(line)
        print(f"      reply: {preview}\n")

    prompt = counts["prompt"]
    heldout = counts["heldout"]
    prompt_rate = (prompt["passed"] / prompt["total"]) if prompt["total"] else 1.0
    heldout_rate = (heldout["passed"] / heldout["total"]) if heldout["total"] else 0.0
    print(f"Prompt: {prompt['passed']}/{prompt['total']} ({prompt_rate:.0%})")
    print(f"Held-out: {heldout['passed']}/{heldout['total']} ({heldout_rate:.0%})")
    if prompt_rate < args.min_pass:
        sys.exit(1)


if __name__ == "__main__":
    main()
