# Retired speech model source

- Model: `kitten-nano-en-v0_2-fp16`
- Source: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kitten-nano-en-v0_2-fp16.tar.bz2
- Upstream: https://huggingface.co/KittenML/kitten-tts-nano-0.2
- Archive SHA-256: `0345a8a2f4a710cb8f7912c9a731ded8b3e1e69b33a871efa95c2e64651518fe`
- Model license: Apache-2.0; the archive's complete `LICENSE` is retained inside the model directory.
- Phonemizer data: eSpeak NG, GPL-3.0-or-later. Its complete license is retained as `ESPEAK-NG-COPYING`.
- Runtime: `sherpa-onnx-node` 1.13.4

This model was replaced by native macOS and Windows system speech and is no
longer staged into packaged Prism runtimes. Its source files remain in the
repository temporarily as a non-shipping migration artifact.

The eSpeak NG license interaction must be reviewed before release packaging is
approved; keeping this manifest and the full licenses is necessary but does not
replace that review.
