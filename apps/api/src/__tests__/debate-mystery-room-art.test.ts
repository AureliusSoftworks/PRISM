import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
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

describe("debate mystery room Mosaic art", () => {
  it("renders a deterministic 1600x900 lossless Mosaic with an exact 5px cell grid", async () => {
    const source = await colorfulRoomFixture();
    const first = await renderDebateMysteryRoomArtV1(source);
    const second = await renderDebateMysteryRoomArtV1(source);
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(first.mimeType, "image/webp");

    const metadata = await sharp(first.bytes).metadata();
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.height, 900);

    const { data, info } = await sharp(first.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 3);
    const pixel = (x: number, y: number): number[] => {
      const offset = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(offset, offset + 3));
    };
    assert.deepEqual(pixel(1, 1), pixel(4, 4));
    assert.notDeepEqual(pixel(0, 1), pixel(1, 1));
    assert.notDeepEqual(pixel(1, 0), pixel(1, 1));
    assert.notDeepEqual(pixel(5, 6), pixel(6, 6));
  });

  it("keeps the upgrade reference gridless and capped at the approved 24 colors", async () => {
    const result = await renderDebateMysteryRoomArtV1(await colorfulRoomFixture(), {
      variant: "mosaic-reference",
      format: "png",
    });
    const { data, info } = await sharp(result.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set<string>();
    for (let offset = 0; offset < data.length; offset += info.channels) {
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    }
    assert.ok(colors.size <= DEBATE_MYSTERY_ROOM_ART_CONTRACT_V1.paletteColors, `found ${colors.size} colors`);
    const pixel = (x: number, y: number): number[] => {
      const offset = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(offset, offset + 3));
    };
    assert.deepEqual(pixel(0, 1), pixel(1, 1));
    assert.deepEqual(pixel(1, 0), pixel(1, 1));
  });

  it("defines a spoiler-safe Illustrated upgrade performance contract", () => {
    const prompt = buildDebateMysteryIllustratedRoomUpgradePromptV1({
      roomName: "Castle Foyer",
      houseStylePrompt: "A moonlit stone castle.",
      roomBrief: "A broad staircase rises behind the entry hall.",
    });
    assert.match(prompt, /strict composition and geometry reference/i);
    assert.match(prompt, /without changing navigation/i);
    assert.match(prompt, /inventing clues/i);
    assert.match(prompt, /mystery remains immutable/i);
    assert.equal(
      debateMysteryIllustratedRoomSubjectIdV1("room-4"),
      "room-4:illustrated-v1",
    );
  });

  it("wires low-cost future synthesis and server-side derived delivery", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.match(server, /size: "1280x720",[\s\S]{0,100}quality: "low"/u);
    assert.match(server, /ctx\.query\.get\("style"\) === "mosaic"[\s\S]{0,160}renderDebateMysteryRoomArtV1/u);
    assert.match(server, /mystery-room-art\/upgrade/u);
    assert.match(server, /session\.responseMode === "local"[\s\S]{0,180}LOCAL never sends mansion art/u);
  });
});
