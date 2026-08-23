import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorials = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");

describe("Whodunnit synthesized exhibit reuse", () => {
  it("offers an opt-in Debate setting and saves it through account settings", () => {
    assert.match(page, /Reuse synthesized exhibits/u);
    assert.match(page, /data-tutorial-target="whodunnit-reused-exhibits-setting"/u);
    assert.match(page, /debateWhodunnitReuseSynthesizedExhibits/u);
    assert.match(page, /The\s+object and artwork return; their previous meaning\s+does not\./u);
  });

  it("teaches that reuse keeps the prop but discards the old argument", () => {
    assert.match(tutorials, /Settings → Debate can also let new cases draw up to two physical props/u);
    assert.match(tutorials, /authors entirely new relevance and case facts without carrying over the old argument/u);
  });
});
