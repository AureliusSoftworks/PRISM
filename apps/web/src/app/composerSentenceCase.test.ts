import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyComposerSentenceCaseInsertion,
  applyComposerSentenceCaseToDraft,
} from "./composerSentenceCase.ts";

describe("applyComposerSentenceCaseInsertion", () => {
  it("capitalizes the first letter at the start of a draft", () => {
    assert.equal(applyComposerSentenceCaseInsertion("", "hello"), "Hello");
    assert.equal(applyComposerSentenceCaseInsertion("  ", "hi"), "Hi");
  });

  it("capitalizes after sentence-ending punctuation", () => {
    assert.equal(
      applyComposerSentenceCaseInsertion("Wait. ", "really"),
      "Really",
    );
    assert.equal(
      applyComposerSentenceCaseInsertion('Done!" ', "next"),
      "Next",
    );
  });

  it("leaves mid-sentence inserts alone", () => {
    assert.equal(
      applyComposerSentenceCaseInsertion("hello ", "world"),
      "world",
    );
  });

  it("does not rewrite already-capitalized letters", () => {
    assert.equal(applyComposerSentenceCaseInsertion("", "Hello"), "Hello");
  });
});

describe("applyComposerSentenceCaseToDraft", () => {
  it("sentence-cases multiple sentences without touching code spans", () => {
    assert.equal(
      applyComposerSentenceCaseToDraft("hello there. what now?"),
      "Hello there. What now?",
    );
    assert.equal(
      applyComposerSentenceCaseToDraft("run `teh cmd` then go."),
      "Run `teh cmd` then go.",
    );
  });

  it("capitalizes after newlines", () => {
    assert.equal(
      applyComposerSentenceCaseToDraft("one line\ntwo line"),
      "One line\nTwo line",
    );
  });

  it("does not capitalize inside @handles or domain names", () => {
    assert.equal(
      applyComposerSentenceCaseToDraft("@im hello there"),
      "@im hello there",
    );
    assert.equal(
      applyComposerSentenceCaseToDraft("see example.com/im now"),
      "See example.com/im now",
    );
  });
});
