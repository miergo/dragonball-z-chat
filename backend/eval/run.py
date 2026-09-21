#!/usr/bin/env python3
"""Run the Dragon Ball / Z golden-set eval against the Frieza Ollama chat."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from model import MODEL, SYSTEM, complete

# from tts import speak  # eval stays silent; TTS is for the CLI only


GOLDEN_PATH = Path(__file__).parent / "golden.json"


def score(reply: str, item: dict) -> tuple[bool, list[str], list[str]]:
    text = reply.casefold()
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


def ask(question: str) -> str:
    reply = complete([SYSTEM, {"role": "user", "content": question}])
    # speak(reply)  # disabled for eval
    return reply


def main() -> None:
    parser = argparse.ArgumentParser(description="DB/DBZ golden eval")
    parser.add_argument("--limit", type=int, default=0, help="Max items (0 = all)")
    parser.add_argument(
        "--min-pass",
        type=float,
        default=0.0,
        help="Exit 1 if pass rate is below this (default 0.0)",
    )
    args = parser.parse_args()

    items = json.loads(GOLDEN_PATH.read_text())
    if args.limit > 0:
        items = items[: args.limit]

    passed = 0
    print(f"Model: {MODEL}")
    print(f"Items: {len(items)}\n")

    for item in items:
        item_id = item["id"]
        try:
            raw = ask(item["question"])
        except Exception as exc:  # noqa: BLE001 — report and continue
            print(f"FAIL  {item_id}")
            print(f"      error: {exc}\n")
            continue

        ok, missing, forbidden = score(raw, item)
        label = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        preview = raw.replace("\n", " ")[:200]
        print(f"{label}  {item_id}")
        if missing:
            print(f"      missing: {missing}")
        if forbidden:
            print(f"      forbidden: {forbidden}")
        print(f"      reply: {preview}\n")

    total = len(items)
    rate = (passed / total) if total else 0.0
    print(f"Score: {passed}/{total} ({rate:.0%})")
    if rate < args.min_pass:
        sys.exit(1)


if __name__ == "__main__":
    main()
