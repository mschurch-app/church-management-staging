"""Original deterministic seasonal loops. Writes only the festivals subdirectory."""
from pathlib import Path
import math
import struct
import wave

RATE = 22050
DURATION = 16
ROOT = Path(__file__).resolve().parents[1] / 'assets/audio/life-tree/festivals'
MELODIES = {
    'newyear': ([72, 76, 79, 84, 83, 79, 76, 74, 72, 79, 81, 84, 88, 84, 79, 76], 48, .28),
    'spring': ([72, 74, 76, 79, 81, 79, 76, 74, 72, 76, 79, 81, 84, 81, 79, 76], 48, .22),
    'easter': ([67, 71, 74, 79, 78, 74, 71, 69, 67, 69, 71, 74, 79, 78, 74, 71], 43, .10),
    'pentecost': ([69, 72, 76, 79, 76, 74, 72, 69, 72, 76, 81, 79, 76, 74, 72, 76], 45, .16),
    'dragon': ([62, 65, 67, 69, 72, 69, 67, 65, 62, 67, 69, 74, 72, 69, 67, 65], 38, .25),
    'moon': ([64, 67, 71, 76, 74, 71, 67, 66, 64, 66, 67, 71, 76, 74, 71, 67], 40, .08),
    'light': ([57, 60, 64, 69, 67, 64, 62, 60, 57, 64, 67, 72, 71, 67, 64, 62], 33, .28),
    'thanksgiving': ([65, 69, 72, 74, 77, 74, 72, 69, 65, 67, 69, 72, 74, 72, 69, 67], 41, .14),
    'christmas': ([76, 79, 83, 86, 83, 79, 78, 74, 76, 79, 83, 88, 86, 83, 79, 76], 40, .32),
}


def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def note(samples, midi, start, length, volume, overtone):
    hz = frequency(midi)
    for i in range(round(length * RATE)):
        t = i / RATE
        envelope = min(1., t / .04) * min(1., (length - t) / .15) * math.exp(-2.8 * t / length)
        value = math.sin(2 * math.pi * hz * t) + overtone * math.sin(4 * math.pi * hz * t)
        samples[(round(start * RATE) + i) % len(samples)] += volume * envelope * value


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, (melody, bass, overtone) in MELODIES.items():
        samples = [0.] * (RATE * DURATION)
        for index, midi in enumerate(melody):
            note(samples, midi, index, 1.8, .4, overtone)
            if name in ('dragon', 'light'):
                note(samples, midi - 12, index + .5, .45, .10, .12)
        for start in (0, 8):
            for offset in (0, 7, 16):
                note(samples, bass + offset, start, 7.8, .12, .04)
        maximum = max(abs(value) for value in samples)
        pcm = b''.join(struct.pack('<h', round(value / maximum * .35 * 32767)) for value in samples)
        with wave.open(str(ROOT / (name + '.wav')), 'wb') as output:
            output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            output.writeframes(pcm)
        print(name, len(pcm), 'bytes')


if __name__ == '__main__':
    main()
