#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  applyDebateMysteryMosaicPresentationV1,
} from "../apps/api/src/debate-mystery-room-art.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1",
);
const outputDirectory = join(repositoryRoot, "apps/web/public/debate/mystery/rooms");
const reviewDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/mosaic-tessera-v6-review",
);
await mkdir(reviewDirectory, { recursive: true });

const sourceNames = (await readdir(sourceDirectory))
  .filter((name) => /\.(?:png|jpe?g|webp)$/iu.test(name))
  .filter((name) => !/^(?:space|jungle)-room-/iu.test(name))
  .sort((left, right) => left.localeCompare(right));

async function assertUniformTesserae(label, bytes, cellSize) {
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
  assert.equal(violations, 0, `${label} retained ${violations} sub-cell pixels`);
}

let foyerMosaic = null;
for (const sourceName of sourceNames) {
  const source = await readFile(join(sourceDirectory, sourceName));
  const mosaic = await applyDebateMysteryMosaicPresentationV1(source);
  await assertUniformTesserae(sourceName, mosaic.bytes, mosaic.cellSize);
  const outputName = `${basename(sourceName, extname(sourceName))}-mosaic.webp`;
  await writeFile(join(outputDirectory, outputName), mosaic.bytes);
  if (sourceName === "foyer.png") foyerMosaic = mosaic.bytes;
}

assert.ok(foyerMosaic, "Foyer source was not found.");
const fullReviewPath = join(reviewDirectory, "prism-foyer-tessera-mosaic-v6.png");
await sharp(foyerMosaic).png({ compressionLevel: 9 }).toFile(fullReviewPath);
const detailReviewPath = join(reviewDirectory, "prism-foyer-tessera-detail-v6.png");
await sharp(foyerMosaic)
  .extract({ left: 720, top: 300, width: 240, height: 160 })
  .resize(960, 640, { kernel: sharp.kernel.nearest })
  .png({ compressionLevel: 9 })
  .toFile(detailReviewPath);

process.stdout.write(`${JSON.stringify({
  bundledRooms: sourceNames.length,
  logicalSamples: "320x180",
  tesseraSize: "6x6",
  subCellViolations: 0,
  fullReviewPath,
  detailReviewPath,
}, null, 2)}\n`);
