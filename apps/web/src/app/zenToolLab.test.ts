import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ZEN_TOOL_LAB_DEV_IMAGE_ID,
  ZEN_TOOL_LAB_TOOLS,
  buildZenToolLabMessageSample,
  isZenToolLabDevImageId,
  zenToolLabStoryLabel,
  type ZenToolLabToolId,
} from "./zenToolLab.ts";

describe("Zen Tool Lab", () => {
  it("keeps tool ids stable", () => {
    assert.deepEqual(
      ZEN_TOOL_LAB_TOOLS.map((tool) => tool.id),
      [
        "ask-question",
        "ask-question-binary",
        "story-actions",
        "generated-image-result",
        "zen-display",
      ] satisfies ZenToolLabToolId[]
    );
  });

  it("builds a four-option AskQuestion sample", () => {
    const sample = buildZenToolLabMessageSample("ask-question");
    assert.equal(sample.askQuestion?.name, "AskQuestion");
    assert.equal(sample.askQuestion?.options.length, 4);
  });

  it("builds a binary AskQuestion sample", () => {
    const sample = buildZenToolLabMessageSample("ask-question-binary");
    assert.equal(sample.askQuestion?.name, "AskQuestion");
    assert.deepEqual(
      sample.askQuestion?.options.map((option) => option.label),
      ["Yes", "No"]
    );
  });

  it("falls back for blank story action labels", () => {
    assert.equal(zenToolLabStoryLabel("  Mark   this  page  ", "Bookmark"), "Mark this page");
    assert.equal(zenToolLabStoryLabel("   ", "Bookmark"), "Bookmark");
    assert.equal(zenToolLabStoryLabel(null, "End Story"), "End Story");
  });

  it("builds a dev image result sample with a static display URL", () => {
    const sample = buildZenToolLabMessageSample("generated-image-result");
    assert.equal(sample.sentGeneratedImage?.imageId, ZEN_TOOL_LAB_DEV_IMAGE_ID);
    assert.equal(isZenToolLabDevImageId(sample.sentGeneratedImage?.imageId), true);
    assert.match(sample.sentGeneratedImage?.displayUrl ?? "", /^\/story-themes\//);
  });

  it("builds normalized Zen display placement metadata", () => {
    const sample = buildZenToolLabMessageSample("zen-display");
    assert.equal(sample.zenDisplay?.v, 1);
    assert.deepEqual(sample.zenDisplay?.lines?.map((line) => line.align), [
      "center",
      "center",
    ]);
    assert.ok(
      sample.zenDisplay?.lines?.every(
        (line) =>
          typeof line.x === "number" &&
          line.x >= 0 &&
          line.x <= 1 &&
          typeof line.y === "number" &&
          line.y >= 0 &&
          line.y <= 1
      )
    );
  });
});
