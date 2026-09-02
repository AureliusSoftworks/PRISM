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
  validateDebateMysteryRoomArtSourceAlignmentV1,
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
    assert.match(prompt, /exact same scale across the full 16:9 frame/i);
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

  it("locks an Upgraded derivative to the Mosaic camera and rejects composition drift locally", async () => {
    const source = await navigationRoomFixture();
    const aligned = await validateDebateMysteryRoomArtSourceAlignmentV1({
      source,
      candidate: await sharp(source).resize(1600, 900, { fit: "fill" }).png().toBuffer(),
    });
    assert.equal(aligned.approved, true);

    const shifted = await sharp(source)
      .extract({ left: 160, top: 0, width: 1440, height: 900 })
      .extend({ right: 160, background: { r: 3, g: 8, b: 14 } })
      .png()
      .toBuffer();
    const rejected = await validateDebateMysteryRoomArtSourceAlignmentV1({ source, candidate: shifted });
    assert.equal(rejected.approved, false);
    assert.ok(rejected.correlation < rejected.minimumCorrelation);

    const blank = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 3, g: 8, b: 14 },
      },
    }).png().toBuffer();
    const blankRejected = await validateDebateMysteryRoomArtSourceAlignmentV1({
      source,
      candidate: blank,
    });
    assert.equal(blankRejected.approved, false);
  });

  it("wires Mosaic synthesis and shared presentation delivery", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const mansionBundles = readFileSync(
      new URL("../debate-mystery-mansion-bundles.ts", import.meta.url),
      "utf8",
    );
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
    assert.match(server, /sourceImageBytes: mosaicReference\.bytes[\s\S]{0,160}size: "1280x720"/u);
    assert.match(server, /validateDebateMysteryRoomArtSourceAlignmentV1[\s\S]{0,1100}sealDebateMysteryAssetBytesV1/u);
    assert.match(server, /session\.responseMode === "local"[\s\S]{0,220}LOCAL never sends venue art/u);
    assert.match(
      server,
      /roomId && category !== "mosaic_rooms"[\s\S]{0,180}room-specific retry must target Mosaic rooms/u,
    );
    assert.match(
      server,
      /rooms: \[selectedRoom\][\s\S]{0,360}attachDebateMysteryRoomAssetV2/u,
      "a selected fallback room should finish behind the blocking request instead of joining the general queue",
    );
    assert.match(
      server,
      /activeBackground\.controller\.abort\(\)[\s\S]{0,120}await activeBackground\.promise/u,
      "a player-selected room should take ownership from an opportunistic background generation run",
    );
    assert.match(
      server,
      /!selectedAsset \|\| selectedAsset\.status === "pending"[\s\S]{0,320}setDebateMysteryAssetPendingV1/u,
      "a room with no synthesis record or an interrupted pending record should be eligible for hidden generation",
    );
    assert.match(
      server,
      /selectedAsset\.status === "ready"[\s\S]{0,300}attachDebateMysteryRoomAssetV2/u,
      "a completed vault image should repair a stale session attachment without regeneration",
    );
    assert.match(
      server,
      /requestedRoomIds\?: ReadonlySet<string>[\s\S]{0,1800}requestedRoomIds && !requestedRoomIds\.has\(room\.id\)/u,
    );
    assert.match(
      server,
      /roomId \? new Set\(\[roomId\]\) : undefined/u,
      "the room-specific upgrade must not generate every room",
    );
    assert.match(
      mansionBundles,
      /const frozenLayout = state\.config\.mansionSnapshot\?\.layoutV2[\s\S]{0,500}structuredClone\(frozenLayout\)[\s\S]{0,500}roomArtCandidates: \[\]/u,
      "saving the venue must retain its frozen authored geometry instead of rebuilding a legacy grid",
    );
    assert.match(
      mansionBundles,
      /acceptedRoomAssetId:[\s\S]{0,260}acceptedRoomArtAnchorSha256:[\s\S]{0,180}roomAnchorContractSha256\(layoutV2, entity\.id\)/u,
      "promoted case room art must retain the exact anchor contract for its next mansion",
    );
  });
});
