#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { validateMansionPackageManifestV1 } from
  "../packages/shared/src/portableMysteryPackage.ts";
import { decodeInternalMansionPackageV1 } from
  "../apps/api/src/debate-mystery-mansion-codec.ts";
import { openPortableMysteryEnvelopeV1 } from
  "../apps/api/src/debate-mystery-package-envelope.ts";
import { applyDebateMysteryMosaicPresentationV1 } from
  "../apps/api/src/debate-mystery-room-art.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1/packages",
);
const reviewDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/mosaic-tessera-v6-review",
);
const packages = [
  ["Asterion Observatory", "asterion-observatory-tessera-mosaic-v6.mansion"],
  ["Banyan House", "banyan-house-tessera-mosaic-v6.mansion"],
  ["Blackwood House", "blackwood-house-tessera-mosaic-v6.mansion"],
  ["Briarwatch Manor", "briarwatch-manor-tessera-mosaic-v6.mansion"],
];

async function decodePackage(name) {
  const envelope = openPortableMysteryEnvelopeV1({
    envelope: await readFile(join(packageDirectory, name)),
  });
  return decodeInternalMansionPackageV1(envelope.payload);
}

async function tesseraViolations(bytes, cellSize) {
  const { data, info } = await sharp(bytes).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  let violations = 0;
  for (let cellY = 0; cellY < info.height; cellY += cellSize) {
    for (let cellX = 0; cellX < info.width; cellX += cellSize) {
      const sample = ((cellY + 1) * info.width + cellX + 1) * info.channels;
      for (let y = cellY + 1; y < cellY + cellSize; y += 1) {
        for (let x = cellX + 1; x < cellX + cellSize; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          if (
            data[offset] !== data[sample] ||
            data[offset + 1] !== data[sample + 1] ||
            data[offset + 2] !== data[sample + 2]
          ) violations += 1;
        }
      }
    }
  }
  return violations;
}

let roomCount = 0;
let asterionFoyer = null;
for (const [label, packageName] of packages) {
  const decoded = await decodePackage(packageName);
  assert.deepEqual(validateMansionPackageManifestV1(decoded.manifest), [], `${label} manifest`);
  assert.equal(decoded.manifest.roomArt?.version, 6, `${label} contract`);
  for (const room of decoded.manifest.rooms) {
    const descriptor = decoded.manifest.assets.find((asset) => asset.id === room.roomAssetId);
    assert.ok(descriptor, `${label} / ${room.name} descriptor`);
    const source = decoded.assets.get(descriptor.archivePath);
    assert.ok(source, `${label} / ${room.name} bytes`);
    const mosaic = await applyDebateMysteryMosaicPresentationV1(source);
    assert.equal(
      await tesseraViolations(mosaic.bytes, mosaic.cellSize),
      0,
      `${label} / ${room.name} contains sub-cell detail`,
    );
    roomCount += 1;
    if (label === "Asterion Observatory" && room.name === "Foyer") {
      asterionFoyer = mosaic.bytes;
    }
  }
}

assert.ok(asterionFoyer, "Asterion Foyer was not found.");
await mkdir(reviewDirectory, { recursive: true });
const fullReviewPath = join(reviewDirectory, "asterion-foyer-tessera-mosaic-v6.png");
await sharp(asterionFoyer).png({ compressionLevel: 9 }).toFile(fullReviewPath);
const detailReviewPath = join(reviewDirectory, "asterion-foyer-tessera-detail-v6.png");
await sharp(asterionFoyer)
  .extract({ left: 510, top: 270, width: 240, height: 160 })
  .resize(960, 640, { kernel: sharp.kernel.nearest })
  .png({ compressionLevel: 9 })
  .toFile(detailReviewPath);

process.stdout.write(`${JSON.stringify({
  mansions: packages.length,
  importedRooms: roomCount,
  subCellViolations: 0,
  fullReviewPath,
  detailReviewPath,
}, null, 2)}\n`);
