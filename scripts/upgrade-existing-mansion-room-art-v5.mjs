#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MANSION_ROOM_ART_CONTRACT_V5,
} from "../packages/shared/src/portableMysteryPackage.ts";
import {
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
} from "../apps/api/src/debate-mystery-mansion-codec.ts";
import {
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "../apps/api/src/debate-mystery-package-envelope.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1/packages",
);

const jobs = [
  [
    "asterion-observatory-synthesized-pixel-art-v4.mansion",
    "asterion-observatory-balanced-mosaic-v5.mansion",
  ],
  [
    "banyan-house-synthesized-pixel-art-v4.mansion",
    "banyan-house-balanced-mosaic-v5.mansion",
  ],
  [
    "blackwood-house-synthesized-pixel-art-v4.mansion",
    "blackwood-house-balanced-mosaic-v5.mansion",
  ],
  [
    "briarwatch-manor-synthesized-pixel-art-v4.mansion",
    "briarwatch-manor-balanced-mosaic-v5.mansion",
  ],
];

await mkdir(packageDirectory, { recursive: true });
for (const [inputName, outputName] of jobs) {
  const envelope = openPortableMysteryEnvelopeV1({
    envelope: await readFile(join(packageDirectory, inputName)),
  });
  const decoded = decodeInternalMansionPackageV1(envelope.payload);
  decoded.manifest.roomArt = DEFAULT_MANSION_ROOM_ART_CONTRACT_V5;
  decoded.manifest.provenance.generatedWith = [
    ...new Set([
      ...decoded.manifest.provenance.generatedWith,
      "PRISM balanced Mosaic presentation V1",
    ]),
  ];

  const payload = encodeInternalMansionPackageV1(decoded);
  const expandedBytes = [...decoded.assets.values()]
    .reduce((total, bytes) => total + bytes.byteLength, 0);
  const sealed = sealPortableMysteryEnvelopeV1({
    payload,
    mode: envelope.header.encryptionMode,
    metadata: {
      packageType: "mansion",
      title: decoded.manifest.title,
      creatorName: decoded.manifest.creator.name,
      compatibility: decoded.manifest.compatibility,
      expandedBytes,
      assetCount: decoded.manifest.assets.length,
      contentWarnings: decoded.manifest.contentWarnings,
      creatorSignature: null,
    },
  });
  await writeFile(join(packageDirectory, outputName), sealed);
  process.stdout.write(`${basename(inputName)} -> ${basename(outputName)}\n`);
}
