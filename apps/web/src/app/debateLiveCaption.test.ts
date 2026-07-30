import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  debateLiveCaptionPage,
  debateLiveCaptionPages,
  normalizeDebateLiveCaptionText,
} from "./debateLiveCaption.ts";

describe("Debate live captions", () => {
  it("removes raw Markdown furniture from speech shown on stage", () => {
    assert.equal(
      normalizeDebateLiveCaptionText(
        "That is **not** enough—it *failed*. Read [the brief](https://example.com).",
      ),
      "That is not enough—it failed. Read the brief.",
    );
  });

  it("paginates long speech into whole-word, sentence-aware beats", () => {
    const speech =
      "Public transit is shared civic infrastructure. Removing fares improves access to work, education, and public life while simplifying the system for everyone. This final sentence keeps the current turn readable without becoming a transcript wall.";
    const pages = debateLiveCaptionPages(speech, 96);

    assert.ok(pages.length >= 2);
    assert.equal(pages.join(" "), speech);
    assert.ok(pages.every((page) => !page.startsWith(" ")));
    assert.ok(pages.every((page) => !page.endsWith(" ")));
    assert.ok(pages[0]?.endsWith("."));
  });

  it("shows only the current readable page as streaming speech grows", () => {
    const speech =
      "People do not just need another lecture about the problem. They need a policy that protects the public while treating them like adults. That is the standard this side is defending.";
    const page = debateLiveCaptionPage(speech, 90);

    assert.ok(page.pageCount >= 2);
    assert.equal(page.pageIndex, page.pageCount - 1);
    assert.match(page.text, /That is the standard/u);
    assert.doesNotMatch(page.text, /People do not just/u);
  });
});
