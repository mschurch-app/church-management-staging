"""Original deterministic seasonal loops. Writes only the festivals subdirectory."""
from pathlib import Path
import math
import struct
import wave
import argparse
import random

RATE = 22050
DURATION = 16
ROOT = Path(__file__).resolve().parents[1] / 'assets/audio/life-tree/festivals'
MELODIES = {
    'newyear': ([72, 76, 79, 84, 83, 79, 76, 74, 72, 79, 81, 84, 88, 84, 79, 76], 48, .28),
    'spring': ([72, 74, 76, 79, 81, 79, 76, 74, 72, 76, 79, 81, 84, 81, 79, 76], 48, .22),
    'anniversary': ([72, 76, 79, 81, 79, 76, 74, 72, 76, 79, 84, 83, 81, 79, 76, 72], 48, .24),
    'passion': ([62, 62, 65, 65, 64, 64, 62, 62, 57, 57, 60, 60, 62, 62, 62, 62], 38, .04),
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


def joyful_newyear():
    """Eight original bars at 120 BPM: bells, plucked chords, bass and soft drums."""
    samples = [0.] * (RATE * DURATION)
    beat = .5
    rng = random.Random(2027)

    def voice(midi, start, length, volume, kind='bell'):
        hz = frequency(midi)
        for i in range(round(length * RATE)):
            t = i / RATE
            attack = min(1., t / .006)
            release = min(1., (length - t) / .025)
            if kind == 'bell':
                value = (math.sin(2 * math.pi * hz * t) * math.exp(-9 * t)
                         + .34 * math.sin(2 * math.pi * hz * 2 * t) * math.exp(-15 * t)
                         + .13 * math.sin(2 * math.pi * hz * 3 * t) * math.exp(-22 * t))
            else:
                value = math.exp(-6 * t) * (math.sin(2 * math.pi * hz * t)
                         + .22 * math.sin(4 * math.pi * hz * t)
                         + .07 * math.sin(6 * math.pi * hz * t))
            samples[(round(start * RATE) + i) % len(samples)] += volume * attack * release * value

    # C, Am, F, G; a full phrase returns naturally to the opening tonic.
    chords = [(48, 60, 64, 67), (45, 57, 60, 64),
              (41, 53, 57, 60), (43, 55, 59, 62)]
    phrases = [
        [76, 79, 84, 79, 76, 79, 81, 79], [84, 83, 81, 79, 76, 74, 76, 79],
        [76, 81, 84, 81, 79, 76, 72, 76], [81, 79, 76, 74, 72, 76, 79, 81],
        [77, 81, 84, 81, 77, 76, 74, 77], [81, 84, 86, 84, 81, 79, 77, 76],
        [79, 83, 86, 83, 79, 81, 83, 86], [88, 86, 84, 83, 81, 79, 74, 79],
    ]
    for bar, phrase in enumerate(phrases):
        start = bar * 4 * beat
        root, *chord = chords[bar // 2]
        for i, midi in enumerate(phrase):
            voice(midi, start + i * beat / 2, .48, .28 if i % 2 == 0 else .22)
        for b in range(4):
            voice(root if b % 2 == 0 else root + 7, start + b * beat, .32, .19, 'pluck')
            for i, midi in enumerate(chord):
                voice(midi, start + (b + .5) * beat + i * .008, .28, .055, 'pluck')
        # Gentle accents: no loud crash or explosive sound over reading.
        for b in range(4):
            when = start + b * beat
            for i in range(round(.22 * RATE)):
                t = i / RATE
                value = math.sin(2 * math.pi * (46 * t + 3.2 * (1 - math.exp(-28 * t))))
                samples[(round(when * RATE) + i) % len(samples)] += .13 * value * min(1., t / .003) * math.exp(-24 * t)
            if b % 2:
                last = 0.
                for i in range(round(.10 * RATE)):
                    t = i / RATE
                    noise = rng.uniform(-1, 1)
                    value = .65 * (noise - last) + .35 * math.sin(2 * math.pi * 180 * t)
                    last = noise
                    samples[(round(when * RATE) + i) % len(samples)] += .05 * value * min(1., t / .002) * math.exp(-50 * t)
        for b in range(8):
            when = start + b * beat / 2
            last = 0.
            for i in range(round(.045 * RATE)):
                t = i / RATE
                noise = rng.uniform(-1, 1)
                value = noise - last
                last = noise
                samples[(round(when * RATE) + i) % len(samples)] += .018 * value * min(1., t / .001) * math.exp(-95 * t)
    return samples


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=list(MELODIES), help='Regenerate a single track')
    args = parser.parse_args()
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, (melody, bass, overtone) in MELODIES.items():
        if args.only and name != args.only:
            continue
        if name == 'newyear':
            samples = joyful_newyear()
        else:
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
