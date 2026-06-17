import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveLeadingDevCommandTextRanges } from "./tiptapPrismDevCommandHighlight.ts";

describe("resolveLeadingDevCommandTextRanges", () => {
  it("returns null for non-command text", () => {
    const out = resolveLeadingDevCommandTextRanges("hello world");
    assert.equal(out, null);
  });

  it("recognizes /clear as a highlighted dev command", () => {
    const out = resolveLeadingDevCommandTextRanges("/clear");
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 6,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("recognizes custom prompt shortcuts", () => {
    const out = resolveLeadingDevCommandTextRanges("/summarize-this -f notes");
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 15,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("resolves command bounds for a leading slash command", () => {
    const out = resolveLeadingDevCommandTextRanges("  /echo \"hello\"");
    assert.deepEqual(out, {
      commandStart: 2,
      commandEnd: 7,
      quotedStringRanges: [{ start: 8, end: 15 }],
      actionTokenRanges: [],
    });
  });

  it("only highlights the first immediate quoted token after command", () => {
    const out = resolveLeadingDevCommandTextRanges("/dev askquestion \"pick one\"");
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 4,
      quotedStringRanges: [],
      actionTokenRanges: [],
    });
  });

  it("supports escaped quotes inside the first quoted token", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "say \\"hi\\""');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 18 }],
      actionTokenRanges: [],
    });
  });

  it("highlights --wait argument after quoted message", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "hello" --wait 5');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 13 }],
      actionTokenRanges: [],
      argumentStart: 14,
      argumentEnd: 22,
    });
  });

  it("highlights -load argument after quoted message", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "hello" -load 1.5');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 13 }],
      actionTokenRanges: [],
      argumentStart: 14,
      argumentEnd: 23,
    });
  });

  it("highlights --wait even before number is typed", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "hello" --wait');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 13 }],
      actionTokenRanges: [],
      argumentStart: 14,
      argumentEnd: 20,
    });
  });

  it("highlights each concatenated quoted string independently", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "Hello " + "World!" --wait 20');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [
        { start: 6, end: 14 },
        { start: 17, end: 25 },
      ],
      actionTokenRanges: [],
      argumentStart: 26,
      argumentEnd: 35,
    });
  });

  it("still highlights --wait when action token is unquoted", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "Hello world!" + *cheers* --wait 20');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 20 }],
      actionTokenRanges: [{ start: 23, end: 31 }],
      argumentStart: 32,
      argumentEnd: 41,
    });
  });

  it("highlights *action* inside quoted strings as action token", () => {
    const out = resolveLeadingDevCommandTextRanges('/echo "Hello *cheers* world"');
    assert.deepEqual(out, {
      commandStart: 0,
      commandEnd: 5,
      quotedStringRanges: [{ start: 6, end: 28 }],
      actionTokenRanges: [{ start: 13, end: 21 }],
    });
  });
});
