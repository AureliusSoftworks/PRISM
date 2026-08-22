import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const component = readFileSync(
  new URL("./SlateCreativeStudiosDesk.tsx", import.meta.url),
  "utf8",
);

describe("Slate Creative Studios desk", () => {
  it("keeps three focused desks behind one temporary surface", () => {
    assert.match(component, /\["sources", "Source Shelf"\]/u);
    assert.match(component, /\["visuals", "Visual Bible"\]/u);
    assert.match(component, /\["review", "Review Circle"\]/u);
    assert.match(component, /desk === "sources"/u);
    assert.match(component, /desk === "visuals"/u);
    assert.match(component, /desk === "review"/u);
  });

  it("makes Source Shelf promotion explicit and preserves its boundary", () => {
    assert.match(component, /outside Canon and Mirror/u);
    assert.match(component, /method: "PATCH"/u);
    assert.match(component, /\/sources\/\$\{encodeURIComponent\(source\.id\)\}\/promote/u);
    assert.match(component, /Promote snapshot/u);
  });

  it("treats generated images as studies before pin or rejection", () => {
    assert.match(component, /Every image begins as a study/u);
    assert.match(component, /label="Visual studies"/u);
    assert.match(component, /onSynthesize=\{createVisualStudy\}/u);
    assert.match(component, /\/visual-references\/\$\{encodeURIComponent\(visual\.id\)\}\/pin/u);
    assert.match(component, /\/visual-references\/\$\{encodeURIComponent\(visual\.id\)\}\/reject/u);
  });

  it("limits owned reviewers and adds one optional guest", () => {
    assert.match(component, /selectedReviewers\.length >= 3/u);
    assert.match(component, /Guest reader/u);
    assert.match(component, /reviewerBotIds: selectedReviewers/u);
    assert.match(component, /The Room Note cannot alter prose or Canon/u);
  });
});
