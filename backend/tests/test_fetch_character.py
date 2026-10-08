import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from canon.fetch_character import keep_intro_appearance_personality


SAMPLE = """
{{Directory|Characters|Villains}}
<gallery>
Poster.png|A poster
</gallery>
Frieza is the emperor of the universe.

==Concept and creation==
Akira Toriyama designed him.

==Appearance==
He is short, with white skin and purple sections.

==Personality==
He is polite until insulted.
===Relationship with Frost===
He looks down on Frost.

==References==
A book.
"""


def test_keeps_intro_appearance_and_personality():
    kept = keep_intro_appearance_personality(SAMPLE)
    assert "Frieza is the emperor of the universe." in kept
    assert "Appearance" in kept
    assert "white skin and purple sections" in kept
    assert "Personality" in kept
    assert "polite until insulted" in kept
    assert "Relationship with Frost" in kept
    assert "looks down on Frost" in kept
    assert "Concept and creation" not in kept
    assert "Toriyama" not in kept
    assert "References" not in kept
    assert "A book." not in kept
    assert "Characters" not in kept
    assert "Poster.png" not in kept
    assert "A poster" not in kept
