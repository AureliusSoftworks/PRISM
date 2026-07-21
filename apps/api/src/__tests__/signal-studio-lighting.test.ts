import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import { generateSignalStudioLightingMap } from "../signal-studio-lighting.ts";

async function studioFixture(
  width: number,
  height: number,
  bright: boolean,
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const surface = y / Math.max(1, height - 1);
      const hotspot = Math.max(
        0,
        1 - Math.hypot(x - width * 0.72, y - height * 0.3) / (width * 0.3),
      );
      pixels[offset] = Math.round((bright ? 78 : 18) + surface * 82 + hotspot * 92);
      pixels[offset + 1] = Math.round((bright ? 92 : 24) + surface * 68 + hotspot * 60);
      pixels[offset + 2] = Math.round((bright ? 116 : 34) + surface * 52 + hotspot * 38);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("Signal Studio lighting map", () => {
  it("builds one deterministic alpha receiver map from mismatched Light/Dark sources", async () => {
    const day = await studioFixture(320, 180, true);
    const night = await studioFixture(240, 160, false);
    const first = await generateSignalStudioLightingMap(day, night);
    const second = await generateSignalStudioLightingMap(day, night);

    assert.equal(first.width, 240);
    assert.equal(first.height, 160);
    assert.deepEqual(first.pngBytes, second.pngBytes);

    const { data, info } = await sharp(first.pngBytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    const alpha = Array.from(
      { length: first.width * first.height },
      (_, index) => data[index * 4 + 3]!,
    );
    assert.ok(Math.max(...alpha) - Math.min(...alpha) > 20);
    assert.ok(alpha.some((value) => value > 0 && value < 255));
    const middleRow = alpha.slice(
      Math.floor(first.height / 2) * first.width,
      (Math.floor(first.height / 2) + 1) * first.width,
    );
    assert.ok(Math.max(...middleRow) - Math.min(...middleRow) > 8);
  });
});
