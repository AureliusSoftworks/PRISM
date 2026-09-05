import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorials = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");

describe("Whodunnit Asset Library prop cameos", () => {
  it("retires the global exhibit setting while retaining its compatibility field", () => {
    assert.doesNotMatch(page, /Reuse synthesized exhibits/u);
    assert.doesNotMatch(page, /data-tutorial-target="whodunnit-reused-exhibits-setting"/u);
    assert.match(page, /debateWhodunnitReuseSynthesizedExhibits/u);
  });

  it("teaches the per-case capability-based opt in", () => {
    assert.match(tutorials, /Use relevant props from my Asset Library/u);
    assert.match(tutorials, /up to two compatible Items or Debate exhibits/u);
  });
});
