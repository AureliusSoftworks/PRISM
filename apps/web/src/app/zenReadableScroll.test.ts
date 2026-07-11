import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  zenReadableAnchorMessageIds,
  zenReadableMaxScrollTop,
} from "./zenReadableScroll.ts";

describe("zenReadableAnchorMessageIds", () => {
  it("anchors to a newer user prompt before the previous assistant reply", () => {
    assert.deepEqual(
      zenReadableAnchorMessageIds({
        lastMessageId: "user-new",
        latestAssistantMessageId: "assistant-previous",
        latestUserMessageId: "user-new",
      }),
      ["user-new", "assistant-previous"]
    );
  });

  it("falls back to the latest rendered role IDs without duplicates", () => {
    assert.deepEqual(
      zenReadableAnchorMessageIds({
        lastMessageId: null,
        latestAssistantMessageId: "assistant-live",
        latestUserMessageId: "user-previous",
      }),
      ["assistant-live", "user-previous"]
    );
    assert.deepEqual(
      zenReadableAnchorMessageIds({
        lastMessageId: "assistant-live",
        latestAssistantMessageId: "assistant-live",
        latestUserMessageId: "user-previous",
      }),
      ["assistant-live", "user-previous"]
    );
  });
});

describe("zenReadableMaxScrollTop", () => {
  it("keeps the browser's full native range during opening-session layout", () => {
    assert.equal(zenReadableMaxScrollTop(1_240, 900), 340);
    assert.equal(zenReadableMaxScrollTop(760, 900), 0);
  });
});
