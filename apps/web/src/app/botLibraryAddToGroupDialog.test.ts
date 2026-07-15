import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectBotLibraryAddToGroupDialogBot,
  selectBotLibraryAddToGroupDialogGroup,
} from "./botLibraryAddToGroupDialog.ts";

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

  it("copies a captured bot id into a group-first dialog", () => {
    assert.deepEqual(
      selectBotLibraryAddToGroupDialogBot(
        { mode: "pick-bot", botId: "bot-1", groupId: "group-1" },
        "bot-2",
      ),
      { mode: "pick-bot", botId: "bot-2", groupId: "group-1" },
    );
  });
});
