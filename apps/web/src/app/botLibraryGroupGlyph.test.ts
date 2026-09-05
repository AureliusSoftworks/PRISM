import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeBotLibraryGroupGlyphIdentity } from "./botLibraryGroupGlyph.ts";

describe("legacy bot library group glyph data", () => {
  it("continues to normalize versioned identity for old backups", () => {
    assert.deepEqual(
      normalizeBotLibraryGroupGlyphIdentity({
        version: 1,
        seed: "legacy-group:group:friends",
      }),
      {
      version: 1,
      seed: "legacy-group:group:friends",
      },
    );
    assert.equal(normalizeBotLibraryGroupGlyphIdentity({ version: 2, seed: "x" }), null);
    assert.equal(normalizeBotLibraryGroupGlyphIdentity(null), null);
  });
});
