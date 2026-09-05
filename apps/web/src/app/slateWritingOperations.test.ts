import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  slateWritingOperationCanContinue,
  slateWritingOperationCanRedirect,
  slateWritingOperationCanStop,
  slateWritingOperationStatusLabel,
  slateWritingOperationStorageKey,
  slateWritingProposalPreview,
  type SlateWritingOperation,
} from "./slateWritingOperations.ts";

function operation(
  status: SlateWritingOperation["status"],
): SlateWritingOperation {
  return { status } as SlateWritingOperation;
}

describe("Slate writing operation UI state", () => {
  it("exposes only valid lifecycle actions", () => {
    assert.equal(slateWritingOperationCanStop(operation("generating")), true);
    assert.equal(slateWritingOperationCanStop(operation("proposed")), false);
    assert.equal(
      slateWritingOperationCanContinue(operation("interrupted")),
      true,
    );
    assert.equal(
      slateWritingOperationCanRedirect(operation("proposed")),
      true,
    );
    assert.equal(
      slateWritingOperationCanRedirect(operation("applied")),
      false,
    );
  });

  it("keeps the reload pointer scoped to one project section", () => {
    assert.equal(
      slateWritingOperationStorageKey("project-a", "section-b"),
      "prism_slate_writing_operation_v1:project-a:section-b",
    );
  });

  it("describes a paused clarification as writer-directed", () => {
    assert.equal(
      slateWritingOperationStatusLabel("awaiting_clarification"),
      "Waiting for your direction",
    );
  });

  it("bounds long proposal prose without losing its scale", () => {
    const prose = `Opening.\n\n${"middle ".repeat(1_000)}\n\nEnding.`;
    const preview = slateWritingProposalPreview(prose, 600);

    assert.equal(preview.truncated, true);
    assert.equal(preview.characterCount, prose.length);
    assert.match(preview.text, /^Opening\./u);
    assert.match(
      preview.text,
      /characters hidden from this review excerpt/u,
    );
    assert.match(preview.text, /Ending\.$/u);
    assert.ok(preview.text.length < prose.length);
  });

  it("preserves short proposal replacements exactly", () => {
    const prose = "The door opened.";
    assert.deepEqual(slateWritingProposalPreview(prose), {
      text: prose,
      wordCount: 3,
      characterCount: prose.length,
      truncated: false,
    });
  });
});
