import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEBATE_FORUM_ACCENT_KEY_RGB,
  DEBATE_FORUM_ACCENT_KEY_SOURCE,
  normalizedDebateForumAccentColor,
  renderDebateForumAccentPixels,
  renderDebateForumAccentRolePixels,
} from "./debateForumAccentKeys.ts";

const keyedPixels = new Uint8ClampedArray([
  255, 0, 0, 220,
  0, 255, 0, 180,
  0, 0, 255, 140,
  24, 24, 24, 255,
]);

test("declares exact RGB authoring keys and aligned Forum sources", () => {
  assert.deepEqual(DEBATE_FORUM_ACCENT_KEY_RGB, {
    for: [255, 0, 0],
    moderator: [0, 255, 0],
    against: [0, 0, 255],
  });
  assert.deepEqual(DEBATE_FORUM_ACCENT_KEY_SOURCE, {
    backdrop: "/debate/forum-accent-keys.png",
    foreground: "/debate/forum-accent-keys-foreground.png",
  });
  for (const source of Object.values(DEBATE_FORUM_ACCENT_KEY_SOURCE)) {
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL(`../../public${source}`, import.meta.url),
        ),
      ),
      true,
    );
  }
});

test("extracts one key, preserves authored alpha, and hides every other source pixel", () => {
  assert.deepEqual(
    [...renderDebateForumAccentRolePixels(keyedPixels, "for", "#ff00aa")],
    [255, 0, 170, 220, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    [
      ...renderDebateForumAccentRolePixels(
        keyedPixels,
        "moderator",
        "#00ffaa",
      ),
    ],
    [0, 0, 0, 0, 0, 255, 170, 180, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    [
      ...renderDebateForumAccentRolePixels(
        keyedPixels,
        "against",
        "#aa00ff",
      ),
    ],
    [0, 0, 0, 0, 0, 0, 0, 0, 170, 0, 255, 140, 0, 0, 0, 0],
  );
});

test("replaces every visible key in one bounded stage raster", () => {
  assert.deepEqual(
    [
      ...renderDebateForumAccentPixels(keyedPixels, {
        for: "#ff00aa",
        moderator: "#00ffaa",
        against: "#aa00ff",
      }),
    ],
    [
      255, 0, 170, 220,
      0, 255, 170, 180,
      170, 0, 255, 140,
      0, 0, 0, 0,
    ],
  );
});

test("normalizes valid bot colors and safely falls back by seat", () => {
  assert.equal(normalizedDebateForumAccentColor("#8c6f77", "for"), "#fb0045");
  assert.equal(normalizedDebateForumAccentColor("not-a-color", "for"), "#42d9ff");
  assert.equal(
    normalizedDebateForumAccentColor(undefined, "moderator"),
    "#d9d2ff",
  );
  assert.equal(normalizedDebateForumAccentColor(null, "against"), "#ff5f8f");
});

test("preserves blended role boundaries and authored alpha without changing the source", () => {
  const source = new Uint8ClampedArray([
    128, 128, 0, 210,
    0, 64, 192, 127,
    220, 120, 20, 64,
    25, 25, 25, 255,
    255, 0, 0, 0,
  ]);
  const original = source.slice();
  assert.deepEqual(
    [...renderDebateForumAccentPixels(source, {
      for: "#ff00aa",
      moderator: "#00ffaa",
      against: "#aa00ff",
    })],
    [
      128, 128, 170, 210,
      128, 64, 234, 127,
      170, 85, 170, 64,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  );
  assert.deepEqual(source, original);
});
