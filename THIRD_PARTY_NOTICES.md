# Third-Party Notices

## Lucide Icons

Prism uses selected icons from Lucide for the expanded bot glyph picker.

- Project: https://lucide.dev
- License: ISC
- Commercial use: allowed

Lucide includes icons derived from Feather Icons, which are available under the
MIT License. Both ISC and MIT permit commercial use, modification, and
distribution, subject to preserving applicable license/copyright notices when
redistributing the source materials.

## sherpa-onnx

Prism uses sherpa-onnx for bundled, offline English text-to-speech.

- Project: https://github.com/k2-fsa/sherpa-onnx
- Package: `sherpa-onnx-node` 1.13.4
- License: Apache-2.0

## KittenTTS Nano 0.2

Prism bundles the sherpa-onnx conversion of KittenTTS Nano 0.2 for offline
speech synthesis.

- Model: https://huggingface.co/KittenML/kitten-tts-nano-0.2
- Packaged model: `kitten-nano-en-v0_2-fp16`
- License included with the model archive: Apache-2.0
- Archive SHA-256: `0345a8a2f4a710cb8f7912c9a731ded8b3e1e69b33a871efa95c2e64651518fe`

The converted archive also contains eSpeak NG phonemizer data. eSpeak NG is
GPL-3.0-or-later; its complete license is distributed at
`apps/api/tts-models/ESPEAK-NG-COPYING`. Distribution of this combined runtime
remains a release/legal-review gate before Prism ships the bundled engine.
