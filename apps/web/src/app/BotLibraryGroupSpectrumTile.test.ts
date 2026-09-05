import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botLibraryGroupMonogram } from "./botLibraryGroupSpectrumTileUtils.ts";

describe("bot library group spectrum tile", () => {
  it("derives a restrained, stable monogram from the group name", () => {
    assert.equal(botLibraryGroupMonogram("Prism Power Collection"), "PC");
    assert.equal(botLibraryGroupMonogram("Rude & Interrupting"), "RI");
    assert.equal(botLibraryGroupMonogram("Coffee"), "CO");
    assert.equal(botLibraryGroupMonogram("  42 friends  "), "4F");
    assert.equal(botLibraryGroupMonogram("---"), "•");
  });
});
