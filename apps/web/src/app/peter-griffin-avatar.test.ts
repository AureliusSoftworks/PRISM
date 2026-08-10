import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BOT_AVATAR_DETAILS_CANVAS_SIZE,
  botAvatarDetailsPaintColorCode,
  decodeBotAvatarDetailsPaintColorMap,
} from "@localai/shared";
import { parsePrismBotArchive } from "./botArchive.ts";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const bundlePath = path.join(
  appRoot,
  "public/bot-marketplace/bots/bot-peter-griffin.bot",
);

function paintedBounds(
  colorMap: Uint8Array,
  includesY: (y: number) => boolean,
) {
  const points: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < BOT_AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < BOT_AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      if (
        includesY(y) &&
        botAvatarDetailsPaintColorCode(colorMap, x, y) !== 0
      ) {
        points.push({ x, y });
      }
    }
  }
  assert.ok(points.length > 0);
  return {
    count: points.length,
    x: [
      Math.min(...points.map((point) => point.x)),
      Math.max(...points.map((point) => point.x)),
    ],
    y: [
      Math.min(...points.map((point) => point.y)),
      Math.max(...points.map((point) => point.y)),
    ],
  };
}

describe("Peter Griffin avatar registration", () => {
  it("lowers the authored glasses and pupils without moving the chin", () => {
    const archive = parsePrismBotArchive(readFileSync(bundlePath));
    const bot = archive.botJson.bot;
    const paintColorMapBase64 =
      bot.avatarDetails?.screen.paintColorMapBase64 ?? null;
    const colorMap = decodeBotAvatarDetailsPaintColorMap(
      paintColorMapBase64,
    );

    assert.ok(colorMap);
    // The face is rendered at 90 degrees, so authored X controls screen Y.
    assert.equal(bot.faceEyeOffsetX, -0.1);
    assert.equal(bot.faceEyeOffsetY, 0.12);
    assert.equal(
      createHash("sha256").update(paintColorMapBase64 ?? "").digest("hex"),
      "546bf82cb7b7ba64b547a962cb53ad7de147fe471aaed763a5aa383e18e1def3",
    );
    assert.deepEqual(paintedBounds(colorMap, (y) => y < 81), {
      count: 86,
      x: [52, 87],
      y: [35, 49],
    });
    assert.deepEqual(paintedBounds(colorMap, (y) => y >= 81), {
      count: 38,
      x: [54, 74],
      y: [82, 88],
    });
  });
});
