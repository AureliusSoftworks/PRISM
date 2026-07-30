import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";

import {
  buildDebateExhibitSpritePrompt,
  normalizeGeneratedDebateExhibitImage,
  normalizeUploadedDebateExhibitImage,
} from "../debate-exhibit-image.ts";

const serverSource = readFileSync(
  new URL("../server.ts", import.meta.url),
  "utf8",
);

describe("Debate exhibit image guardrails", () => {
  it("keeps every synthesis prompt on the same object-sprite art bible", () => {
    const prompt = buildDebateExhibitSpritePrompt({
      adjective: "Rusty",
      object: "spoon",
    });
    assert.match(prompt, /exactly: "Rusty spoon"/u);
    assert.match(prompt, /PRISM evidence-exhibit house style/u);
    assert.match(prompt, /same consistent three-quarter view/u);
    assert.match(prompt, /exactly one complete subject/u);
    assert.match(prompt, /#FF00FF/u);
    assert.match(prompt, /No extra props/u);
  });

  it("removes the generated magenta key and emits a square PNG", async () => {
    const source = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 4,
        background: { r: 255, g: 0, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 42,
              height: 58,
              channels: 4,
              background: { r: 104, g: 76, b: 44, alpha: 1 },
            },
          })
            .png()
            .toBuffer(),
          left: 27,
          top: 19,
        },
      ])
      .png()
      .toBuffer();
    const normalized = await normalizeGeneratedDebateExhibitImage(source);
    const metadata = await sharp(normalized.pngBytes).metadata();
    const corner = await sharp(normalized.pngBytes)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 1024);
    assert.equal(corner[3], 0);
  });

  it("accepts an uploaded PNG data URL and keeps a visible fallback subject", async () => {
    const source = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: { r: 245, g: 245, b: 245, alpha: 1 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 24,
              height: 24,
              channels: 4,
              background: { r: 40, g: 80, b: 120, alpha: 1 },
            },
          })
            .png()
            .toBuffer(),
          left: 20,
          top: 12,
        },
      ])
      .png()
      .toBuffer();
    const normalized = await normalizeUploadedDebateExhibitImage(
      `data:image/png;base64,${source.toString("base64")}`,
    );
    const metadata = await sharp(normalized.pngBytes).metadata();
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 1024);
  });

  it("keeps upload local and forces LOCAL synthesis through the offline image path", () => {
    assert.match(
      serverSource,
      /route\("POST", "\/api\/debates\/exhibits\/upload"/u,
    );
    assert.match(
      serverSource,
      /async function persistUploadedDebateExhibitImageAsset[\s\S]*?'debate'[\s\S]*?'upload'[\s\S]*?'player-upload'[\s\S]*?'debate_exhibit'/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/debates\/exhibits\/synthesize"[\s\S]*?normalizeResponseMode\([\s\S]*?=== "local" \|\| userBlocksOnlineCapabilities\(user\)/u,
    );
    assert.match(
      serverSource,
      /source: "debate_exhibit"[\s\S]*?normalizeGeneratedDebateExhibitImage/u,
    );
  });
});
