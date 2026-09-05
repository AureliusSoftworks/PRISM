import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("Debate optimized and compact cast avatars keep authored thinking frames", () => {
  assert.match(
    pageSource,
    /showThinkingSpinner=\{avatarState\.thinking\}/u,
  );
  assert.doesNotMatch(
    pageSource,
    /showThinkingSpinner=\{[\s\S]{0,100}avatarState\.compact/u,
  );
  assert.match(
    pageSource,
    /faceThinkingFrames=\{faceStyle\.thinkingFrames\}[\s\S]{0,200}faceThinkingScale=\{faceStyle\.thinkingScale\}[\s\S]{0,200}faceThinkingOffsetX=\{faceStyle\.thinkingOffsetX\}[\s\S]{0,200}faceThinkingOffsetY=\{faceStyle\.thinkingOffsetY\}/u,
  );
});
