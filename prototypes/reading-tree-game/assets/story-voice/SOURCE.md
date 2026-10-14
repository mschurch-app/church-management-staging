# Opening-story voice source

These AAC files are newly synthesized narration of this project's original
Chinese dialogue. They are not recordings or clones of a real speaker.

- Model: [hexgrad/Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)
- Model license: Apache-2.0, as published on the model card.
- Gardener preset: `zm_011`, generated with `scripts/generate-opening-voice.py`.
- Legacy protagonist clips retain the previous `zm_020` / `zf_001` presets.
- Current protagonist clips: `hero-male-youth-v2-NN.m4a` and
  `hero-female-youth-v2-NN.m4a`, newly generated with
  [Qwen3-TTS VoiceDesign](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign),
  using the [MLX Community 4-bit conversion](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit).
- Qwen3-TTS model license: Apache-2.0, as published on its model card.
- Voice descriptions specify a clear, light, youthful male protagonist and a
  separate bright, youthful female protagonist. These are designed synthetic
  voices, not clones of a real person. Instructions and hashes are retained in
  `hero-voices-youth-v2.json`.
- Protagonist generation: `scripts/generate-hero-voices.py`, `mlx-audio==0.5.8`.
- Delivery format: mono AAC in `.m4a`; current protagonists use 64 kbps.

The model checkpoint and generation dependencies are not shipped to the site.
Only the resulting dialogue clips are published.
