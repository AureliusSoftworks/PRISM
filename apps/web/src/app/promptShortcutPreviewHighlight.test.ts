import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePromptShortcutOptionGroupRanges,
  resolvePromptShortcutPreviewHighlightRanges,
} from "./promptShortcutPreviewHighlight.ts";

describe("resolvePromptShortcutOptionGroupRanges", () => {
  it("highlights pipe-separated brace options", () => {
    assert.deepEqual(resolvePromptShortcutOptionGroupRanges("Pick {apple|banana|grape} today"), [
      { start: 5, end: 25 },
    ]);
  });

  it("supports spaced options and multiple groups", () => {
    assert.deepEqual(resolvePromptShortcutOptionGroupRanges("Use {red | blue} with {soft|sharp} edges"), [
      { start: 4, end: 16 },
      { start: 22, end: 34 },
    ]);
  });

  it("ignores wildcard braces, empty options, and nested braces", () => {
    assert.deepEqual(resolvePromptShortcutOptionGroupRanges("{TOPIC} {apple|} {{a|b}}"), []);
  });
});

describe("resolvePromptShortcutPreviewHighlightRanges", () => {
  it("combines resolved wildcard ranges with option groups", () => {
    assert.deepEqual(
      resolvePromptShortcutPreviewHighlightRanges("Ask cozy about {apple|banana}.", [
        { key: "MOOD", value: "cozy", start: 4, end: 8 },
      ]),
      [
        { start: 4, end: 8 },
        { start: 15, end: 29 },
      ]
    );
  });

  it("does not duplicate an option group already covered by a wildcard replacement", () => {
    assert.deepEqual(
      resolvePromptShortcutPreviewHighlightRanges("Ask {apple|banana} now", [
        { key: "FRUIT", value: "{apple|banana}", start: 4, end: 18 },
      ]),
      [{ start: 4, end: 18 }]
    );
  });
});
