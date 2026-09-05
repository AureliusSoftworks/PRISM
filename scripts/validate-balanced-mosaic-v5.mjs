#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { validateMansionPackageManifestV1 } from
  "../packages/shared/src/portableMysteryPackage.ts";
import { decodeInternalMansionPackageV1 } from
  "../apps/api/src/debate-mystery-mansion-codec.ts";
import { openPortableMysteryEnvelopeV1 } from
  "../apps/api/src/debate-mystery-package-envelope.ts";
import {
  applyDebateMysteryMosaicPresentationV1,
  renderDebateMysteryRoomArtV1,
} from "../apps/api/src/debate-mystery-room-art.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const synthesizedDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1",
);
const packageDirectory = join(synthesizedDirectory, "packages");
const bundledOutputDirectory = join(
  repositoryRoot,
  "apps/web/public/debate/mystery/rooms",
);
const reviewDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/mosaic-balanced-v5-review",
);

const packagePairs = [
  ["Asterion Observatory", "asterion-observatory-synthesized-pixel-art-v4.mansion", "asterion-observatory-balanced-mosaic-v5.mansion"],
  ["Banyan House", "banyan-house-synthesized-pixel-art-v4.mansion", "banyan-house-balanced-mosaic-v5.mansion"],
  ["Blackwood House", "blackwood-house-synthesized-pixel-art-v4.mansion", "blackwood-house-balanced-mosaic-v5.mansion"],
  ["Briarwatch Manor", "briarwatch-manor-synthesized-pixel-art-v4.mansion", "briarwatch-manor-balanced-mosaic-v5.mansion"],
];

async function decodePackage(name) {
  const envelope = openPortableMysteryEnvelopeV1({
    envelope: await readFile(join(packageDirectory, name)),
  });
  return decodeInternalMansionPackageV1(envelope.payload);
}

async function verifyTreatment(label, source) {
  const [gridless, mosaic] = await Promise.all([
    renderDebateMysteryRoomArtV1(source, { variant: "mosaic-reference", format: "png" }),
    applyDebateMysteryMosaicPresentationV1(source, { format: "png" }),
  ]);
  const [base, presented] = await Promise.all([
    sharp(gridless.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(mosaic.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  let gridChanged = 0;
  let nonGridChanged = 0;
  let brighter = 0;
  let darker = 0;
  let signedDelta = 0;
  for (let y = 0; y < base.info.height; y += 1) {
    for (let x = 0; x < base.info.width; x += 1) {
      const offset = (y * base.info.width + x) * base.info.channels;
      const delta =
        (presented.data[offset] - base.data[offset]) +
        (presented.data[offset + 1] - base.data[offset + 1]) +
        (presented.data[offset + 2] - base.data[offset + 2]);
      const gridPixel = x % mosaic.cellSize === 0 || y % mosaic.cellSize === 0;
      if (gridPixel && delta !== 0) gridChanged += 1;
      if (!gridPixel && delta !== 0) nonGridChanged += 1;
      if (gridPixel && delta > 0) brighter += 1;
      if (gridPixel && delta < 0) darker += 1;
      if (gridPixel) signedDelta += delta / 3;
    }
  }
  assert.equal(nonGridChanged, 0, `${label} changed a non-grid pixel`);
  assert.ok(gridChanged > 600_000, `${label} did not receive the complete grid`);
  assert.ok(brighter > 0 && darker > 0, `${label} did not balance light and dark grid lines`);
  const meanSignedWholeImageDelta = signedDelta / (base.info.width * base.info.height);
  assert.ok(
    Math.abs(meanSignedWholeImageDelta) < 0.8,
    `${label} shifted whole-image exposure by ${meanSignedWholeImageDelta}`,
  );
  return {
    label,
    gridChanged,
    nonGridChanged,
    brighter,
    darker,
    meanSignedWholeImageDelta: Number(meanSignedWholeImageDelta.toFixed(3)),
  };
}

async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

const sources = [];
const bundledNames = (await readdir(synthesizedDirectory))
  .filter((name) => /\.(?:png|jpe?g|webp)$/iu.test(name))
  .filter((name) => !/^(?:space|jungle)-room-/iu.test(name))
  .sort((left, right) => left.localeCompare(right));
for (const name of bundledNames) {
  const outputName = `${basename(name, extname(name))}-mosaic.webp`;
  const metadata = await sharp(join(bundledOutputDirectory, outputName)).metadata();
  assert.equal(metadata.width, 1920, `${outputName} width`);
  assert.equal(metadata.height, 1080, `${outputName} height`);
  sources.push({
    label: `PRISM / ${basename(name, extname(name))}`,
    bytes: await readFile(join(synthesizedDirectory, name)),
  });
}

const packages = new Map();
for (const [label, v4Name, v5Name] of packagePairs) {
  const [v4, v5] = await Promise.all([decodePackage(v4Name), decodePackage(v5Name)]);
  const errors = validateMansionPackageManifestV1(v5.manifest);
  assert.deepEqual(errors, [], `${label} V5 manifest`);
  assert.equal(v5.manifest.roomArt?.version, 5, `${label} room-art contract`);
  assert.deepEqual(
    [...v5.assets.entries()],
    [...v4.assets.entries()],
    `${label} source assets must remain byte-identical`,
  );
  packages.set(label, v5);
  for (const room of v5.manifest.rooms) {
    const descriptor = v5.manifest.assets.find((asset) => asset.id === room.roomAssetId);
    assert.ok(descriptor, `${label} / ${room.name} room descriptor`);
    const bytes = v5.assets.get(descriptor.archivePath);
    assert.ok(bytes, `${label} / ${room.name} room bytes`);
    sources.push({ label: `${label} / ${room.name}`, bytes });
  }
}

const metrics = await mapConcurrent(sources, 4, (source) =>
  verifyTreatment(source.label, source.bytes));

const representatives = [
  ["PRISM · Foyer", sources.find((source) => source.label === "PRISM / foyer")?.bytes],
  ["Asterion · Foyer", null],
  ["Banyan · Foyer", null],
  ["Blackwood · Rooftop Lounge", null],
  ["Briarwatch · Foyer", null],
];
for (const representative of representatives.slice(1)) {
  const [mansionLabel, roomName] = representative[0].split(" · ");
  const mansion = packages.get(
    mansionLabel === "Asterion" ? "Asterion Observatory" :
      mansionLabel === "Banyan" ? "Banyan House" :
        mansionLabel === "Blackwood" ? "Blackwood House" : "Briarwatch Manor",
  );
  const room = mansion.manifest.rooms.find((candidate) => candidate.name === roomName);
  const descriptor = mansion.manifest.assets.find((asset) => asset.id === room.roomAssetId);
  representative[1] = mansion.assets.get(descriptor.archivePath);
}

const tileWidth = 480;
const tileHeight = 270;
const tiles = [];
for (const [label, bytes] of representatives) {
  assert.ok(bytes, `${label} representative bytes`);
  const mosaic = await applyDebateMysteryMosaicPresentationV1(bytes, { format: "png" });
  const image = await sharp(mosaic.bytes).resize(tileWidth, tileHeight).png().toBuffer();
  const escapedLabel = label.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const caption = Buffer.from(
    `<svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="230" width="${tileWidth}" height="40" fill="#050811" fill-opacity="0.82"/>` +
      `<text x="18" y="256" fill="#f4f2ff" font-size="18" font-family="Arial, sans-serif" font-weight="700">${escapedLabel}</text>` +
    `</svg>`,
  );
  tiles.push(await sharp(image).composite([{ input: caption }]).png().toBuffer());
}

await mkdir(reviewDirectory, { recursive: true });
const contactSheet = join(reviewDirectory, "all-mansions-balanced-mosaic-v5-contact-sheet.png");
await sharp({
  create: {
    width: tileWidth * 3,
    height: tileHeight * 2,
    channels: 3,
    background: "#050811",
  },
})
  .composite(tiles.map((input, index) => ({
    input,
    left: (index % 3) * tileWidth,
    top: Math.floor(index / 3) * tileHeight,
  })))
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(contactSheet);

process.stdout.write(`${JSON.stringify({
  bundledRooms: bundledNames.length,
  installedMansionRooms: sources.length - bundledNames.length,
  totalRooms: sources.length,
  packages: packagePairs.length,
  maxAbsoluteWholeImageDelta: Math.max(
    ...metrics.map((entry) => Math.abs(entry.meanSignedWholeImageDelta)),
  ),
  contactSheet,
}, null, 2)}\n`);
