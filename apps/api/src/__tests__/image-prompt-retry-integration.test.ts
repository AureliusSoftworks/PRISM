import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const assistantImageSource = readFileSync(
  new URL("../assistant-sent-image.ts", import.meta.url),
  "utf8",
);

function sourceSlice(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

function countMatches(source: string, pattern: RegExp): number {
  return Array.from(source.matchAll(pattern)).length;
}

describe("generated image prompt retry integration", () => {
  it("covers Signal and Slate asset generation before local fallback", () => {
    const signal = sourceSlice(
      serverSource,
      "async function generateAndPersistSignalArtworkAsset",
      "async function generateAndPersistSlateCoverAsset",
    );
    const slate = sourceSlice(
      serverSource,
      "async function generateAndPersistSlateCoverAsset",
      "function buildRoutes",
    );

    assert.ok(countMatches(signal, /runImagePromptAttempts/gu) >= 2);
    assert.ok(countMatches(slate, /runImagePromptAttempts/gu) >= 2);
    assert.match(signal, /promptOnlyFallback: localPrompt/u);
    assert.match(
      signal,
      /attempt\.useSourceImage && sourceImageBytes[\s\S]{0,160}editImage\(attempt\.prompt/u,
    );
    assert.match(
      signal,
      /runImagePromptAttempts[\s\S]{0,2200}modelId: lenientFallbackModel/u,
    );
    assert.match(
      slate,
      /runImagePromptAttempts[\s\S]{0,1800}modelId: lenientFallbackModel/u,
    );
  });

  it("covers Zen wallpapers and every Images-panel asset purpose", () => {
    const zenWallpaper = sourceSlice(
      serverSource,
      'route("POST", "/api/conversations/:id/zen-wallpaper"',
      'route("POST", "/api/conversations/:id/title"',
    );
    const images = sourceSlice(
      serverSource,
      'route("POST", "/api/images/generate"',
      'route("POST", "/api/ollama/pull-primary"',
    );

    assert.ok(countMatches(zenWallpaper, /runImagePromptAttempts/gu) >= 2);
    assert.ok(countMatches(images, /runImagePromptAttempts/gu) >= 2);
    assert.match(images, /purpose: imagePurpose/u);
    assert.match(images, /profilePictureBotId/u);
    assert.match(images, /GROUP_ROOM_WALLPAPER_IMAGE_PURPOSE/u);
    assert.match(images, /promptOnlyFallback: localPromptForModel/u);
  });

  it("tries repaired assistant-image prompts before the lenient local model", () => {
    assert.match(assistantImageSource, /const buildRecoveryAttempts/u);
    assert.ok(
      countMatches(assistantImageSource, /runImagePromptAttempts/gu) >= 2,
    );
    const onlineRecovery = sourceSlice(
      assistantImageSource,
      "const recoveryAttempts = await buildRecoveryAttempts();",
      "if (!lenientFb) return deniedResult();",
    );
    assert.match(onlineRecovery, /runImagePromptAttempts/u);
    assert.match(onlineRecovery, /generateImage\(attempt\.prompt/u);
  });
});

