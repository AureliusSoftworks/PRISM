import test from "node:test";
import assert from "node:assert/strict";
import {
  displayWordEndOffsets,
  isCaretInPrismBotMarkdownLockedRegion,
  prismBotMarkdownArrowCaret,
  shouldBlockPlainTextKeyInPrismBotLockedRegion,
} from "./prismBotMarkdownNav.ts";

test("displayWordEndOffsets splits on whitespace", () => {
  assert.deepEqual(displayWordEndOffsets("SpongeBob SquarePants"), [9, 21]);
});

const LINK = "[SpongeBob SquarePants](prism-bot://b)";

test("prismBotMarkdownArrowCaret moves by word inside label", () => {
  assert.equal(prismBotMarkdownArrowCaret(LINK, 1, "right"), 10);
  assert.equal(prismBotMarkdownArrowCaret(LINK, 10, "right"), 22);
  assert.equal(prismBotMarkdownArrowCaret(LINK, 22, "right"), LINK.length);
});

test("prismBotMarkdownArrowCaret left from after link lands on last word start", () => {
  assert.equal(prismBotMarkdownArrowCaret(LINK, LINK.length, "left"), 11);
  assert.equal(prismBotMarkdownArrowCaret(LINK, 11, "left"), 1);
  assert.equal(prismBotMarkdownArrowCaret(LINK, 1, "left"), 0);
});

test("prismBotMarkdownArrowCaret right from before link jumps into first word end", () => {
  assert.equal(prismBotMarkdownArrowCaret(`pre ${LINK}`, 4, "right"), 14);
});

test("isCaretInPrismBotMarkdownLockedRegion", () => {
  assert.equal(isCaretInPrismBotMarkdownLockedRegion(LINK, 5, 5), true);
  assert.equal(isCaretInPrismBotMarkdownLockedRegion(LINK, 0, 0), false);
});

test("shouldBlockPlainTextKeyInPrismBotLockedRegion blocks typing in label", () => {
  const ev = {
    key: "a",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
  };
  assert.equal(shouldBlockPlainTextKeyInPrismBotLockedRegion(LINK, 5, 5, ev), true);
  assert.equal(shouldBlockPlainTextKeyInPrismBotLockedRegion(LINK, 0, 0, ev), false);
});
