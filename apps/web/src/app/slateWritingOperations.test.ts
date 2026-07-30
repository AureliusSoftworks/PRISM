import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  slateWritingOperationCanContinue,
  slateWritingOperationCanRedirect,
  slateWritingOperationCanStop,
  slateWritingOperationStatusLabel,
  slateWritingOperationStorageKey,
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
});
