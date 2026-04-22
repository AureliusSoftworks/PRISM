import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractMemoryCandidates } from "../memory-extraction.ts";

describe("extractMemoryCandidates", () => {
  it("pulls personal preference statements", () => {
    const candidates = extractMemoryCandidates(
      "I prefer concise answers. My favorite language is TypeScript."
    );
    assert.ok(candidates.length > 0);
  });
});
