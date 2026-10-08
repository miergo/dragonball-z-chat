import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from canon.fetch_sagas import keep_intro_and_plot


SAMPLE = """
The Raditz Saga is the first saga.

==Plot==
===Arrival of Raditz===
Raditz arrives on Earth.

==Characters==
* Goku
"""


def test_keeps_intro_and_plot_and_drops_characters():
    kept = keep_intro_and_plot(SAMPLE)
    assert "The Raditz Saga is the first saga." in kept
    assert "Plot" in kept
    assert "Arrival of Raditz" in kept
    assert "Raditz arrives on Earth." in kept
    assert "Characters" not in kept
    assert "Goku" not in kept
