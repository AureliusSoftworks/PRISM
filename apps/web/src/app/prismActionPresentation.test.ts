import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  prismActionLabel,
  prismActionStatusLabel,
} from "./prismActionPresentation.ts";

describe("Prism action presentation", () => {
  it("keeps internal capability identifiers out of player-facing history", () => {
    assert.equal(prismActionLabel("settings.fields.update"), "Update settings");
    assert.equal(prismActionLabel("slate.series.create"), "Create a Slate series");
    assert.equal(prismActionLabel("future.internal.capability"), "PRISM action");
  });

  it("uses player-facing action statuses", () => {
    assert.equal(prismActionStatusLabel("committed"), "Completed");
    assert.equal(prismActionStatusLabel("undone"), "Undone");
    assert.equal(prismActionStatusLabel("undo-failed"), "Undo failed");
  });
});
