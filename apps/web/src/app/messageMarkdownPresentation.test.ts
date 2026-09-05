import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { messageUsesFullMarkdownPresentation } from "./messageMarkdownPresentation.ts";

describe("messageUsesFullMarkdownPresentation", () => {
  it("recognizes the GFM structures supported in Chat and Zen", () => {
    for (const source of [
      "# Heading",
      "> Quote",
      "- list item",
      "1. ordered item",
      "- [x] task",
      "---",
      "~~removed~~",
      "**strong** and *emphasis*",
      "[Prism](https://example.com)",
      "Visit https://example.com",
      "`inline code`",
      "```ts\nconst prism = true;\n```",
      "Name | Hue\n--- | ---\nPia | Pink",
    ]) {
      assert.equal(
        messageUsesFullMarkdownPresentation(source),
        true,
        `${JSON.stringify(source)} should use full Markdown`,
      );
    }
  });

  it("leaves ordinary Zen dialogue on its expressive renderer", () => {
    for (const source of [
      "Hello there.",
      "Wait... really?",
      "A plain line\nand another plain line.",
    ]) {
      assert.equal(messageUsesFullMarkdownPresentation(source), false);
    }
  });
});
