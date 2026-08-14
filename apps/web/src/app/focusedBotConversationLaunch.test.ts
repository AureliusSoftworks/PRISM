import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createFocusedBotConversationLaunch,
  resolveFocusedBotRoomReturn,
  type FocusedBotRoomReturnCheckpoint,
} from "./focusedBotConversationLaunch.ts";

const groupBotIds = ["bot-a", "bot-b", "bot-c"];

describe("focused bot conversation launch", () => {
  it("keeps exact bot targeting and captures a compact club-room checkpoint", () => {
    assert.deepEqual(
      createFocusedBotConversationLaunch({
        botId: " bot-b ",
        mode: "user-first",
        message: "  Hello there  ",
        context: {
          origin: "group-room",
          groupId: " club-friends ",
          promotedBotId: "bot-b",
          returnFocusBotId: "bot-b",
        },
        validGroupBotIds: groupBotIds,
      }),
      {
        botId: "bot-b",
        mode: "user-first",
        message: "Hello there",
        roomReturnCheckpoint: {
          groupId: "club-friends",
          promotedBotId: "bot-b",
          returnFocusBotId: "bot-b",
        },
      },
    );
  });

  it("never lets stale room context redirect the launch or restored focus", () => {
    const launch = createFocusedBotConversationLaunch({
      botId: "bot-b",
      mode: "bot-first",
      context: {
        origin: "group-room",
        groupId: "club-friends",
        promotedBotId: "bot-a",
        returnFocusBotId: "bot-a",
      },
      validGroupBotIds: groupBotIds,
    });
    assert.deepEqual(launch, {
      botId: "bot-b",
      mode: "bot-first",
      message: "",
      roomReturnCheckpoint: null,
    });
  });

  it("rejects empty user-first sends and keeps non-room surface launches roomless", () => {
    assert.equal(
      createFocusedBotConversationLaunch({
        botId: "bot-a",
        mode: "user-first",
        message: "  ",
        context: { origin: "default" },
        validGroupBotIds: groupBotIds,
      }),
      null,
    );
    assert.deepEqual(
      createFocusedBotConversationLaunch({
        botId: "bot-a",
        mode: "bot-first",
        context: { origin: "library" },
        validGroupBotIds: groupBotIds,
      }),
      {
        botId: "bot-a",
        mode: "bot-first",
        message: "",
        roomReturnCheckpoint: null,
      },
    );
  });
});

describe("focused bot club-room return", () => {
  const checkpoint: FocusedBotRoomReturnCheckpoint = {
    groupId: "club-friends",
    promotedBotId: "bot-b",
    returnFocusBotId: "bot-b",
  };

  it("waits for the exact visible saved club", () => {
    assert.deepEqual(
      resolveFocusedBotRoomReturn({
        checkpoint,
        visibleGroupId: "club-friends",
        validGroupBotIds: groupBotIds,
        roomVisible: false,
        roomLod: "micro",
      }),
      { kind: "wait" },
    );
    assert.deepEqual(
      resolveFocusedBotRoomReturn({
        checkpoint,
        visibleGroupId: "another-club",
        validGroupBotIds: groupBotIds,
        roomVisible: true,
        roomLod: "micro",
      }),
      { kind: "wait" },
    );
  });

  it("restores a promoted mini only in a micro room and always returns focus", () => {
    assert.deepEqual(
      resolveFocusedBotRoomReturn({
        checkpoint,
        visibleGroupId: "club-friends",
        validGroupBotIds: groupBotIds,
        roomVisible: true,
        roomLod: "micro",
      }),
      {
        kind: "restore",
        promotedBotId: "bot-b",
        returnFocusBotId: "bot-b",
      },
    );
    assert.deepEqual(
      resolveFocusedBotRoomReturn({
        checkpoint,
        visibleGroupId: "club-friends",
        validGroupBotIds: groupBotIds,
        roomVisible: true,
        roomLod: "mini",
      }),
      {
        kind: "restore",
        promotedBotId: null,
        returnFocusBotId: "bot-b",
      },
    );
  });

  it("consumes safely when the focused bot no longer belongs to the club", () => {
    assert.deepEqual(
      resolveFocusedBotRoomReturn({
        checkpoint,
        visibleGroupId: "club-friends",
        validGroupBotIds: ["bot-a", "bot-c"],
        roomVisible: true,
        roomLod: "micro",
      }),
      { kind: "discard", reason: "missing-focus-bot" },
    );
  });
});
