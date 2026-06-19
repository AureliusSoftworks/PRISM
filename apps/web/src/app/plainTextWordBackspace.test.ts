import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBotMentionMarkdown } from "./botMention.ts";
import {
  applyPlainTextWordBackspace,
  applyTaggedMentionBoundaryDelete,
  applyTaggedMentionWordBackspace,
} from "./plainTextWordBackspace.ts";

describe("applyPlainTextWordBackspace (engine)", () => {
  it("removes the following word when the caret is after spaces before that word", () => {
    const text = "@SpongeBob SquarePants";
    const caret = text.indexOf("SquarePants");
    const out = applyPlainTextWordBackspace(text, caret, caret);
    assert.ok(out);
    assert.equal(out.value, "@SpongeBob ");
    assert.equal(out.caret, caret);
  });

  it("backward-kills the word to the left of the caret when not in the forward case", () => {
    const text = "hello world";
    const caret = text.length;
    const out = applyPlainTextWordBackspace(text, caret, caret);
    assert.ok(out);
    assert.equal(out.value, "hello ");
    assert.equal(out.caret, "hello ".length);
  });
});

describe("applyTaggedMentionWordBackspace", () => {
  it("does not intercept normal prose (single-char backspace left to the browser)", () => {
    assert.equal(applyTaggedMentionWordBackspace("hello world", 11, 11), null);
  });

  it("word-deletes inside an active @ query", () => {
    const text = "@SpongeBob SquarePants";
    const caret = text.indexOf("SquarePants");
    const out = applyTaggedMentionWordBackspace(text, caret, caret);
    assert.ok(out);
    assert.equal(out.value, "@SpongeBob ");
    assert.equal(out.caret, caret);
  });

  it("word-deletes inside a committed prism-bot markdown label", () => {
    const md = formatBotMentionMarkdown({ id: "b1", name: "SpongeBob SquarePants" });
    const text = `Say hi to ${md} please`;
    const closeBracket = text.indexOf("]");
    const out = applyTaggedMentionWordBackspace(text, closeBracket, closeBracket);
    assert.ok(out);
    assert.match(out.value, /\[SpongeBob\]\(/);
    assert.match(out.value, /prism-bot:/);
  });

  it("removes the entire markdown mention when the label is a single word", () => {
    const md = formatBotMentionMarkdown({ id: "x", name: "Plankton" });
    const text = `Hi ${md}!`;
    const closeBracket = text.indexOf("]");
    const out = applyTaggedMentionWordBackspace(text, closeBracket, closeBracket);
    assert.ok(out);
    assert.equal(out.value, "Hi !");
    assert.equal(out.caret, "Hi ".length);
  });

  it("after shrinking to one word, the next backspace removes the whole mention", () => {
    const md = formatBotMentionMarkdown({ id: "x", name: "Harry Potter" });
    let text = `Hi ${md}!`;
    const close1 = text.indexOf("]");
    const step1 = applyTaggedMentionWordBackspace(text, close1, close1);
    assert.ok(step1);
    text = step1.value;
    const step2 = applyTaggedMentionWordBackspace(text, step1.caret, step1.caret);
    assert.ok(step2);
    assert.equal(step2.value, "Hi !");
    assert.equal(step2.caret, "Hi ".length);
  });

  it("returns null for a range selection", () => {
    assert.equal(applyTaggedMentionWordBackspace("abc", 0, 2), null);
  });
});

describe("applyTaggedMentionBoundaryDelete", () => {
  it("removes an entire committed mention on backspace from after the chip", () => {
    const md = formatBotMentionMarkdown({ id: "x", name: "Harry Potter" });
    const text = `Hi ${md}!`;
    const caret = "Hi ".length + md.length;
    const out = applyTaggedMentionBoundaryDelete(text, caret, caret, "backward");
    assert.ok(out);
    assert.equal(out.value, "Hi !");
    assert.equal(out.caret, "Hi ".length);
  });

  it("removes an entire committed mention on delete from before the chip", () => {
    const md = formatBotMentionMarkdown({ id: "x", name: "Harry Potter" });
    const text = `Hi ${md}!`;
    const caret = "Hi ".length;
    const out = applyTaggedMentionBoundaryDelete(text, caret, caret, "forward");
    assert.ok(out);
    assert.equal(out.value, "Hi !");
    assert.equal(out.caret, "Hi ".length);
  });

  it("returns null away from mention boundaries", () => {
    const md = formatBotMentionMarkdown({ id: "x", name: "Harry Potter" });
    const text = `Hi ${md}!`;
    assert.equal(
      applyTaggedMentionBoundaryDelete(text, "Hi [Harry".length, "Hi [Harry".length, "backward"),
      null
    );
  });
});
