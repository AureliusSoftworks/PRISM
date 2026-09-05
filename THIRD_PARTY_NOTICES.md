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

## PRISM Voice Pack

Prism bundles a quantized Kokoro 82M model and 28 English voice embeddings for local
English speech.

- Kokoro and `kokoro-js`: https://github.com/hexgrad/kokoro — Apache-2.0
- Kokoro 82M ONNX model: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX — Apache-2.0
- Transformers.js: https://github.com/huggingface/transformers.js — Apache-2.0
- Phonemizer.js: https://github.com/xenova/phonemizer.js — Apache-2.0
- ONNX Runtime: https://github.com/microsoft/onnxruntime — MIT

These licenses permit commercial use, modification, and redistribution subject
to their notice and attribution requirements. The names and recordings produced
by the voice pack are not an endorsement by the upstream projects.

The exact pinned revisions and SHA-256 checksums distributed by PRISM are listed
in `voice-assets.manifest.json`. Chatterbox Turbo ONNX remains a qualification
candidate and is not represented as a shipped Voice+ engine until its pinned
cross-platform package passes PRISM's release gate.

## Node.js Desktop Runtime

Steam desktop artifacts bundle the official Node.js v22.22.2 runtime so the
application does not depend on Node.js installed on the customer's machine.

- Project: https://nodejs.org/
- Release: https://nodejs.org/download/release/v22.22.2/
- License: MIT
- License text: https://github.com/nodejs/node/blob/v22.22.2/LICENSE

The exact platform archives and SHA-256 checksums distributed by PRISM are
pinned in `scripts/node-runtime-manifest.json`. The platform vendor scripts
verify those checksums before extracting the runtime.

## Desktop Runtime Components

### Qdrant

PRISM bundles Qdrant v1.17.1 for local vector search in the desktop runtime.

- Project: https://github.com/qdrant/qdrant
- Release: https://github.com/qdrant/qdrant/releases/tag/v1.17.1
- License: Apache-2.0

### Playwright Chromium

The desktop runtime bundles the Playwright Chromium headless renderer used by
the local document and media workflows.

- Playwright: https://github.com/microsoft/playwright — Apache-2.0
- Chromium: https://www.chromium.org/chromium-projects/ — BSD-style Chromium license
- The staged browser package retains its upstream `LICENSE.headless_shell` file.

### Sharp and libvips

Sharp and its platform-specific libvips binary are used for image processing.

- Sharp: https://github.com/lovell/sharp — Apache-2.0
- libvips: https://github.com/libvips/libvips — LGPL-3.0-or-later
- The staged packages retain their upstream license and notice files where
  supplied; the generated runtime inventory records the exact package metadata
  and source path used by each artifact.
