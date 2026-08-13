import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  botLibraryGroupGlyphTriangles,
  createBotLibraryGroupGlyphIdentity,
  normalizeBotLibraryGroupGlyphIdentity,
  rerollBotLibraryGroupGlyphIdentity,
  resolveBotLibraryGroupGlyphIdentity,
} from "./botLibraryGroupGlyph.ts";

describe("bot library group glyphs", () => {
  it("is deterministic, triangle-only, and safely falls back for legacy groups", () => {
    const first = botLibraryGroupGlyphTriangles("group:friends");
    const repeated = botLibraryGroupGlyphTriangles("group:friends");
    const other = botLibraryGroupGlyphTriangles("group:colleagues");

    assert.deepEqual(first, repeated);
    assert.notDeepEqual(first, other);
    assert.ok(first.length >= 4 && first.length <= 6);
    assert.ok(first.every((triangle) => triangle.points.split(" ").length === 3));
    assert.deepEqual(resolveBotLibraryGroupGlyphIdentity("group:friends"), {
      version: 1,
      seed: "legacy-group:group:friends",
    });
  });

  it("normalizes versioned identity and rerolls only to a new deterministic recipe", () => {
    const identity = createBotLibraryGroupGlyphIdentity("group:friends");
    const rerolled = rerollBotLibraryGroupGlyphIdentity("group:friends", identity);

    assert.deepEqual(normalizeBotLibraryGroupGlyphIdentity(identity), identity);
    assert.equal(normalizeBotLibraryGroupGlyphIdentity({ version: 2, seed: "x" }), null);
    assert.notEqual(rerolled.seed, identity.seed);
    assert.deepEqual(
      rerollBotLibraryGroupGlyphIdentity("group:friends", identity),
      rerolled,
    );
    assert.notDeepEqual(
      botLibraryGroupGlyphTriangles("group:friends", identity),
      botLibraryGroupGlyphTriangles("group:friends", rerolled),
    );
  });
});
