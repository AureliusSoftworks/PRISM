import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectBotLibraryAddToGroupDialogGroup } from "./botLibraryAddToGroupDialog.ts";

describe("add-to-group dialog selection", () => {
  it("copies a captured group id into the current dialog", () => {
    assert.deepEqual(
      selectBotLibraryAddToGroupDialogGroup(
        { botId: "bot-1", groupId: "group-1" },
        "group-2",
      ),
      { botId: "bot-1", groupId: "group-2" },
    );
  });

  it("stays closed when a deferred update runs after dismissal", () => {
    assert.equal(
      selectBotLibraryAddToGroupDialogGroup(null, "group-2"),
      null,
    );
  });
});
