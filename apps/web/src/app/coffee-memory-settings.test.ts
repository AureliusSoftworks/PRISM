import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8"
);

describe("Coffee memory settings", () => {
  it("keeps cross-session continuity implicit instead of exposing a group control", () => {
    assert.doesNotMatch(pageSource, /memory-callbacks/u);
    assert.doesNotMatch(pageSource, /Memory callbacks/u);
    assert.match(
      tutorialSource,
      /automatically carries bounded summary-level memory from its recent non-private Coffee sessions/u
    );
  });
});
