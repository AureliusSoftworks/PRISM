import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";
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

describe("debate mystery room Pixel Art", () => {
  it("normalizes authored Pixel Art deterministically without reducing it to a fixed palette", async () => {
    const source = await colorfulRoomFixture();
    const first = await renderDebateMysteryRoomArtV1(source);
    const second = await renderDebateMysteryRoomArtV1(source);
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(first.mimeType, "image/webp");

    const metadata = await sharp(first.bytes).metadata();
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 1080);

    const { data, info } = await sharp(first.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set<string>();
    for (let offset = 0; offset < data.length; offset += info.channels * 997) {
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    }
    assert.ok(colors.size > 72, `expected an unrestricted authored palette, found ${colors.size} sampled colors`);
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.version, 5);
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.source, "synthesized-pixel-art");
    assert.equal(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.deterministicFilter, false);
    assert.deepEqual(DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.mosaicPresentation, {
      logicalWidth: 320,
      logicalHeight: 180,
      blend: "normal",
      luminanceSplit: "scene-grid-median",
      lineAlpha: 84,
      lineDelta: 36,
      sourcePreserving: true,
    });
  });

  it("applies the approved balanced Normal grid without changing non-grid pixels", async () => {
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

    const [base, presented] = await Promise.all([
      sharp(gridless.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(mosaic.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    let nonGridChanged = 0;
    let brighter = 0;
    let darker = 0;
    let signedDelta = 0;
    for (let y = 0; y < base.info.height; y += 1) {
      for (let x = 0; x < base.info.width; x += 1) {
        const offset = (y * base.info.width + x) * base.info.channels;
        const delta =
          (presented.data[offset]! - base.data[offset]!) +
          (presented.data[offset + 1]! - base.data[offset + 1]!) +
          (presented.data[offset + 2]! - base.data[offset + 2]!);
        const gridPixel = x % mosaic.cellSize === 0 || y % mosaic.cellSize === 0;
        if (!gridPixel && delta !== 0) nonGridChanged += 1;
        if (gridPixel && delta > 0) brighter += 1;
        if (gridPixel && delta < 0) darker += 1;
        if (gridPixel) signedDelta += delta / 3;
      }
    }
    assert.equal(nonGridChanged, 0);
    assert.ok(brighter > 0);
    assert.ok(darker > 0);
    assert.ok(
      Math.abs(brighter - darker) < (brighter + darker) * 0.08,
      `expected a balanced grid, found ${brighter} brighter and ${darker} darker pixels`,
    );
    assert.ok(
      Math.abs(signedDelta / (brighter + darker)) < 1,
      "balanced grid should not materially shift overall exposure",
    );
  });

  it("keeps the realistic-upgrade reference gridless without quantization or nearest-neighbour filtering", async () => {
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

  it("defines a spoiler-safe Realistic upgrade performance contract", () => {
    const prompt = buildDebateMysteryIllustratedRoomUpgradePromptV1({
      roomName: "Castle Foyer",
      houseStylePrompt: "A moonlit stone castle.",
      roomBrief: "A broad staircase rises behind the entry hall.",
    });
    assert.match(prompt, /strict composition and geometry reference/i);
    assert.match(prompt, /realistic version/i);
    assert.match(prompt, /high-resolution pixel-art room image/i);
    assert.match(prompt, /photographic depth/i);
    assert.match(prompt, /without changing navigation/i);
    assert.match(prompt, /inventing clues/i);
    assert.match(prompt, /mystery remains immutable/i);
    assert.equal(
      debateMysteryIllustratedRoomSubjectIdV1("room-4"),
      "room-4:illustrated-v1",
    );
  });

  it("wires future Pixel Art synthesis and shared Mosaic presentation delivery", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.match(server, /size: "1280x720",[\s\S]{0,100}quality: "high"/u);
    assert.match(server, /genuine polished high-resolution hand-crafted pixel art/u);
    assert.match(server, /generatedPixelArt[\s\S]{0,180}renderDebateMysteryRoomArtV1/u);
    assert.match(server, /ctx\.query\.get\("style"\) === "mosaic"[\s\S]{0,240}applyDebateMysteryMosaicPresentationV1/u);
    assert.ok(
      [...server.matchAll(/applyDebateMysteryMosaicPresentationV1/gu)].length >= 4,
      "sealed, installed-mansion, and saved room delivery should share the Mosaic presentation",
    );
    assert.match(server, /mystery-room-art\/upgrade/u);
    assert.match(server, /session\.responseMode === "local"[\s\S]{0,180}LOCAL never sends mansion art/u);
  });
});
