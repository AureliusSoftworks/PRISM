import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  hashSlateSectionDocumentV1,
  slateSectionDocumentToPlainText,
  slateSha256,
  validateSlateSectionDocumentV1,
  type SlateSectionDocumentV1,
} from "./slateDocument.ts";

function documentWithEmphasis(markType = "italic"): SlateSectionDocumentV1 {
  return {
    schema: "prism-slate-section-document-v1",
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "block-1", textAlign: "left" },
        content: [
          { type: "text", text: "The bell", marks: [{ type: markType }] },
          { type: "hardBreak" },
          { type: "text", text: "rang twice." },
        ],
      },
      {
        type: "sceneBreak",
        attrs: { blockId: "block-2" },
      },
      {
        type: "paragraph",
        attrs: { blockId: "block-3" },
        content: [{ type: "text", text: "Mara did not answer." }],
      },
    ],
  };
}

test("Slate document projection is deterministic and formatting-free", () => {
  const italic = documentWithEmphasis("italic");
  const bold = documentWithEmphasis("bold");

  assert.equal(
    slateSectionDocumentToPlainText(italic),
    "The bell\nrang twice.\n\n***\n\nMara did not answer.",
  );

  const italicHashes = hashSlateSectionDocumentV1(italic);
  const boldHashes = hashSlateSectionDocumentV1(bold);
  assert.notEqual(italicHashes.documentHash, boldHashes.documentHash);
  assert.equal(italicHashes.proseHash, boldHashes.proseHash);
  assert.equal(italicHashes.prose, boldHashes.prose);
});

test("Slate document hash canonicalizes object key order", () => {
  const left = documentWithEmphasis();
  const right = documentWithEmphasis();
  right.content[0]!.attrs = {
    textAlign: "left",
    blockId: "block-1",
  };

  assert.equal(
    hashSlateSectionDocumentV1(left).documentHash,
    hashSlateSectionDocumentV1(right).documentHash,
  );
});

test("Slate projection preserves exact stored legacy separators", () => {
  const document = documentWithEmphasis();
  document.content[0]!.attrs.trailingSeparator = "\r\n\r\n\r\n";
  document.content[1]!.attrs.trailingSeparator = "\n";

  assert.equal(
    slateSectionDocumentToPlainText(document),
    "The bell\nrang twice.\r\n\r\n\r\n***\nMara did not answer.",
  );
});

test("portable Slate SHA-256 matches Node crypto", () => {
  const value = "Slate keeps every signal. 🌈";
  const expected = createHash("sha256").update(value).digest("hex");
  assert.equal(slateSha256(value), expected);
  assert.equal(
    slateSha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("Slate document validation rejects missing and duplicate stable block ids", () => {
  const document = documentWithEmphasis();
  document.content[1]!.attrs.blockId = "block-1";
  document.content[2]!.attrs.blockId = "";

  const result = validateSlateSectionDocumentV1(document);
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("duplicate block id: block-1"));
  assert.ok(result.issues.includes("block 2 is missing attrs.blockId"));
});
