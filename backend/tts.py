import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
PIPER = ROOT / "piper" / "piper"
VOICE = ROOT / "voices" / "en_GB-jenny_dioco-medium.onnx"
WAV = Path("/tmp/frieza.wav")


def spoken_text(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def speak(text: str) -> None:
    text = spoken_text(text)
    if not text:
        return
    subprocess.run(
        [str(PIPER), "--model", str(VOICE), "--output_file", str(WAV)],
        input=text.encode(),
        check=False,
    )
    subprocess.run(["paplay", str(WAV)], check=False)
