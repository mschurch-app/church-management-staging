"""Generate original, deterministic PCM audio. No third-party recordings or network."""
from pathlib import Path
import math
import struct
import wave

RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / "assets/audio/life-tree"


def tone(samples, frequency, start, duration, amplitude):
    for i in range(int(duration * RATE)):
        t = i / RATE
        # Soft attack, exponential piano-like decay, and click-free release.
        envelope = min(1, t / .025) * math.exp(-3 * t / duration)
        envelope *= min(1, (duration - t) / .08)
        value = math.sin(2 * math.pi * frequency * t)
        value += .18 * math.sin(4 * math.pi * frequency * t)
        index = round(start * RATE) + i
        if index < len(samples):
            samples[index] += amplitude * envelope * value


def write(name, samples, peak):
    maximum = max(abs(v) for v in samples)
    pcm = b"".join(struct.pack("<h", round(v / maximum * peak * 32767)) for v in samples)
    with wave.open(str(ROOT / (name + ".wav")), "wb") as output:
        output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        output.writeframes(pcm)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    music = [0.] * (RATE * 16)
    phrases = [
        [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46],
        [523.25, 587.33, 659.25, 783.99, 698.46, 659.25, 587.33, 523.25],
    ]
    for phrase, notes in enumerate(phrases):
        for index, note in enumerate(notes):
            tone(music, note, phrase * 8 + index * .9, 1.4, .45)
        for note in ([130.81, 164.81, 196] if phrase == 0 else [174.61, 220, 261.63]):
            tone(music, note, phrase * 8, 7.8, .16)
    write("reading", music, .38)
    effects = {
        "open": [600, 840], "water": [880, 660, 990],
        "celebration": [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5],
        "wind": [320, 240, 380], "journal": [784, 1046],
    }
    for name, notes in effects.items():
        samples = [0.] * round((len(notes) * .14 + .3) * RATE)
        for index, note in enumerate(notes):
            tone(samples, note, index * .14, .3, .5)
        write(name, samples, .55)


if __name__ == "__main__":
    main()
