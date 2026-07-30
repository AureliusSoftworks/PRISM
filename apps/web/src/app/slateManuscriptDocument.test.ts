import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  slateInferredDirectorScope,
  slatePlainTextToTiptapDocument,
  slateTiptapDocumentToPlainText,
  slateTiptapJsonToSectionDocument,
  slateWordCount,
} from "./slateManuscriptDocument.ts";

describe("Slate manuscript document projection", () => {
  it("round-trips legacy prose byte-for-byte through semantic blocks", () => {
    const examples = [
      "",
      "One line.",
      "One line.\nA hard break.",
      "First.\n\nSecond.",
      "First.\n\n\nSecond.",
      "\n\nLeading and trailing.\n\n",
      "Before.\n\n***\n\nAfter.",
    ];
    for (const prose of examples) {
      assert.equal(
        slateTiptapDocumentToPlainText(
          slatePlainTextToTiptapDocument(prose, "section-1"),
        ),
        prose,
      );
    }
  });

  it("preserves stable block IDs while formatting changes only the document", () => {
    const original = slatePlainTextToTiptapDocument(
      "The light changed.",
      "section-1",
    );
    const formatted = slateTiptapJsonToSectionDocument(
      {
        type: "doc",
        content: [
          {
            ...original.content[0],
            content: [
              {
                type: "text",
                text: "The light changed.",
                marks: [{ type: "italic" }],
              },
            ],
          },
        ],
      },
      "section-1",
      original,
    );
    assert.equal(
      formatted.content[0]?.attrs.blockId,
      original.content[0]?.attrs.blockId,
    );
    assert.equal(
      slateTiptapDocumentToPlainText(formatted),
      "The light changed.",
    );
    assert.notDeepEqual(formatted, original);
  });

  it("keeps Director scope editable while making useful inferences", () => {
    assert.equal(slateInferredDirectorScope("One small reaction beat", "scene"), "beat");
    assert.equal(
      slateInferredDirectorScope("Tighten this selected paragraph", "scene"),
      "passage",
    );
    assert.equal(
      slateInferredDirectorScope("Draft the whole confrontation scene", "beat"),
      "scene",
    );
    assert.equal(slateInferredDirectorScope("Make it stranger", "passage"), "passage");
    assert.equal(slateWordCount("  Three small words. "), 3);
  });
});
