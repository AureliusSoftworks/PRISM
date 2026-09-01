import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";
import { CURRENT_MANSION_ROOM_ART_CONTRACT } from "@localai/shared";
import {
  applyDebateMysteryMosaicPresentationV1,
  buildDebateMysteryIllustratedRoomUpgradePromptV1,
  debateMysteryIllustratedRoomSubjectIdV1,
  DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1,
  renderDebateMysteryRoomArtV1,
} from "../debate-mystery-room-art.ts";

async function colorfulRoomFixture(): Promise<Buffer> {
  const width = 96;
  const height = 54;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = (x * 13 + y * 5) % 256;
      pixels[offset + 1] = (x * 7 + y * 17) % 256;
      pixels[offset + 2] = (x * 19 + y * 3) % 256;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function navigationRoomFixture(): Promise<Buffer> {
  const width = 1600;
  const height = 900;
  const pixels = Buffer.alloc(width * height * 3, 8);
  for (let y = 180; y < 720; y += 1) {
    for (let x = 640; x < 960; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = 232;
      pixels[offset + 1] = 224;
      pixels[offset + 2] = 208;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("debate mystery room Mosaic and Upgraded derivatives", () => {
  it("normalizes the authored Mosaic base deterministically without reducing it to a fixed palette", async () => {
    const source = await colorfulRoomFixture();
    const first = await renderDebateMysteryRoomArtV1(source);
    const second = await renderDebateMysteryRoomArtV1(source);
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(first.mimeType, "image/webp");
    assert.equal(first.variant, "mosaic-reference");

    const metadata = await sharp(first.bytes).metadata();
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 1080);

    const { data, info } = await sharp(first.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set<string>();
    for (let offset = 0; offset < data.length; offset += info.channels * 997) {
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    }
    assert.ok(colors.size > 72, `expected an unrestricted authored palette, found ${colors.size} sampled colors`);
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.version, 6);
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.defaultStyle, "pixel-art");
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.defaultPresentation, "mosaic");
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.upgradeStyle, "realistic");
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.source, "synthesized-pixel-art");
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.deterministicFilter, false);
    assert.equal(
      DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.realisticUpgradeSource,
      "accepted-gridless-pixel-art-upgrade",
    );
    assert.deepEqual(
      DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.mosaicPresentation,
      CURRENT_MANSION_ROOM_ART_CONTRACT.pixelArt.grid,
    );
  });

  it("assigns one logical source sample to every complete Mosaic tessera", async () => {
    const gridless = await renderDebateMysteryRoomArtV1(await colorfulRoomFixture(), {
      variant: "mosaic-reference",
      format: "png",
    });
    const mosaic = await applyDebateMysteryMosaicPresentationV1(gridless.bytes, {
      format: "png",
    });
    assert.equal(mosaic.width, 1920);
    assert.equal(mosaic.height, 1080);
    assert.equal(mosaic.cellSize, 6);
    assert.equal(mosaic.mimeType, "image/png");

    const presented = await sharp(mosaic.bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let brighter = 0;
    let darker = 0;
    for (let cellY = 0; cellY < mosaic.height; cellY += mosaic.cellSize) {
      for (let cellX = 0; cellX < mosaic.width; cellX += mosaic.cellSize) {
        const sampleOffset = ((cellY + 1) * mosaic.width + cellX + 1) * presented.info.channels;
        for (let y = cellY + 1; y < cellY + mosaic.cellSize; y += 1) {
          for (let x = cellX + 1; x < cellX + mosaic.cellSize; x += 1) {
            const offset = (y * mosaic.width + x) * presented.info.channels;
            assert.deepEqual(
              [...presented.data.subarray(offset, offset + 3)],
              [...presented.data.subarray(sampleOffset, sampleOffset + 3)],
              `sub-cell detail survived inside tessera ${cellX / mosaic.cellSize},${cellY / mosaic.cellSize}`,
            );
          }
        }
        const gridOffset = (cellY * mosaic.width + cellX) * presented.info.channels;
        const interiorLuminance = presented.data[sampleOffset]! + presented.data[sampleOffset + 1]! + presented.data[sampleOffset + 2]!;
        const gridLuminance = presented.data[gridOffset]! + presented.data[gridOffset + 1]! + presented.data[gridOffset + 2]!;
        if (gridLuminance > interiorLuminance) brighter += 1;
        if (gridLuminance < interiorLuminance) darker += 1;
      }
    }
    assert.ok(brighter > 0);
    assert.ok(darker > 0);
    assert.ok(
      Math.abs(brighter - darker) < (brighter + darker) * 0.08,
      `expected a balanced grid, found ${brighter} brighter and ${darker} darker pixels`,
    );
  });

  it("keeps the one-sample-per-tessera invariant in delivered WebP bytes", async () => {
    const mosaic = await applyDebateMysteryMosaicPresentationV1(
      await navigationRoomFixture(),
    );
    assert.equal(mosaic.mimeType, "image/webp");
    const { data, info } = await sharp(mosaic.bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let cellY = 0; cellY < info.height; cellY += mosaic.cellSize) {
      for (let cellX = 0; cellX < info.width; cellX += mosaic.cellSize) {
        const expected = ((cellY + 1) * info.width + cellX + 1) * info.channels;
        const corner = ((cellY + 5) * info.width + cellX + 5) * info.channels;
        assert.deepEqual(
          [...data.subarray(corner, corner + 3)],
          [...data.subarray(expected, expected + 3)],
        );
      }
    }
  });

  it("keeps the Upgraded derivative reference gridless without quantization or nearest-neighbour filtering", async () => {
    const result = await renderDebateMysteryRoomArtV1(await colorfulRoomFixture(), {
      variant: "mosaic-reference",
      format: "png",
    });
    const { data, info } = await sharp(result.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1920);
    assert.equal(info.height, 1080);
    let adjacentVariation = false;
    for (let x = 1; x < info.width && !adjacentVariation; x += 1) {
      const left = x * info.channels;
      const right = (x + 1) * info.channels;
      adjacentVariation = data[left] !== data[right]
        || data[left + 1] !== data[right + 1]
        || data[left + 2] !== data[right + 2];
    }
    assert.equal(adjacentVariation, true);
  });

  it("keeps architectural landmark boundaries at their source-relative coordinates", async () => {
    const result = await renderDebateMysteryRoomArtV1(await navigationRoomFixture(), {
      format: "png",
    });
    const { data, info } = await sharp(result.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const row = Math.round(info.height * 0.5);
    const brightXs: number[] = [];
    for (let x = 0; x < info.width; x += 1) {
      const offset = (row * info.width + x) * info.channels;
      if (data[offset]! > 180 && data[offset + 1]! > 180) brightXs.push(x);
    }
    assert.ok(brightXs.length > 0);
    assert.ok(Math.abs(brightXs[0]! - 768) <= 6, `left edge moved to ${brightXs[0]}`);
    assert.ok(Math.abs(brightXs.at(-1)! - 1151) <= 6, `right edge moved to ${brightXs.at(-1)}`);
  });

  it("defines a spoiler-safe HD-derivative performance contract", () => {
    const prompt = buildDebateMysteryIllustratedRoomUpgradePromptV1({
      roomName: "Castle Foyer",
      houseStylePrompt: "A moonlit stone castle.",
      roomBrief: "A broad staircase rises behind the entry hall.",
    });
    assert.match(prompt, /strict composition and geometry reference/i);
    assert.match(prompt, /high-definition interpretation/i);
    assert.match(prompt, /high-resolution Mosaic room image/i);
    assert.match(prompt, /photographic depth/i);
    assert.match(prompt, /without changing navigation/i);
    assert.match(prompt, /inventing clues/i);
    assert.match(prompt, /mystery remains immutable/i);
    assert.equal(
      debateMysteryIllustratedRoomSubjectIdV1("room-4"),
      "room-4:illustrated-v1",
    );
  });

  it("wires Mosaic synthesis and shared presentation delivery", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.match(server, /size: "1280x720",[\s\S]{0,100}quality: "high"/u);
    assert.match(server, /newly authored Mosaic room plate/u);
    assert.match(
      server,
      /Reskin this exact annotated[\s\S]{0,760}genuine polished high-resolution hand-crafted Mosaic plate[\s\S]{0,500}Do not imitate a painting/u,
    );
    assert.doesNotMatch(server, /Premium illustrated adventure-game background/u);
    assert.match(server, /generatedPixelArt[\s\S]{0,180}renderDebateMysteryRoomArtV1/u);
    assert.match(server, /ctx\.query\.get\("style"\) === "mosaic"[\s\S]{0,240}applyDebateMysteryMosaicPresentationV1/u);
    assert.ok(
      [...server.matchAll(/applyDebateMysteryMosaicPresentationV1/gu)].length >= 4,
      "sealed, installed-mansion, and saved room delivery should share the Mosaic presentation",
    );
    assert.match(server, /mystery-room-art\/upgrade/u);
    assert.match(server, /session\.responseMode === "local"[\s\S]{0,220}LOCAL never sends venue art/u);
  });
});
