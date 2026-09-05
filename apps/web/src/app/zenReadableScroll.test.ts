import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  zenReadableAnchorMessageIds,
  zenReadableAnchorViewportY,
  zenReadableComposerClearancePx,
  zenReadableGestureShouldDisarmFollow,
  zenReadableMaxScrollTop,
  zenRestoredViewportScrollTop,
  zenStableViewportAnchorMessageId,
  zenReadableWheelShouldApplyElasticPull,
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

describe("zenReadableComposerClearancePx", () => {
  it("matches the Zen bottom veil band so opening turns keep downward travel", () => {
    assert.equal(zenReadableComposerClearancePx(900), 216);
    assert.equal(zenReadableComposerClearancePx(1_200), 280);
    assert.equal(zenReadableComposerClearancePx(500), 168);
  });
});

describe("zenReadableAnchorViewportY", () => {
  it("leaves the composer veil clear on short opening viewports", () => {
    const height = 450;
    const anchorY = zenReadableAnchorViewportY(height);
    const clearance = zenReadableComposerClearancePx(height);
    assert.ok(height - anchorY >= clearance - 0.5);
    assert.ok(anchorY <= height - clearance + 0.5);
  });

  it("keeps mid-size Zen viewports above the restored fade", () => {
    const height = 900;
    const anchorY = zenReadableAnchorViewportY(height);
    assert.equal(anchorY, Math.min(900 - 216, Math.max(280, 900 * 0.58)));
  });
});

describe("Zen resolved-turn viewport anchoring", () => {
  it("anchors wildcard resolution to the latest persisted row shared by both turns", () => {
    assert.equal(
      zenStableViewportAnchorMessageId(
        [
          { id: "old-user" },
          { id: "old-assistant" },
          { id: "pending-wildcard" },
        ],
        [
          { id: "old-user" },
          { id: "old-assistant" },
          { id: "resolved-user" },
          { id: "new-assistant" },
        ]
      ),
      "old-assistant"
    );
  });

  it("preserves the anchored row's viewport position across transcript reflow", () => {
    assert.equal(zenRestoredViewportScrollTop(920, 180, -240, 1_600), 500);
    assert.equal(zenRestoredViewportScrollTop(920, 180, 180, 1_600), 920);
    assert.equal(zenRestoredViewportScrollTop(920, 180, 900, 1_100), 1_100);
  });
});

describe("zenReadableGestureShouldDisarmFollow", () => {
  it("hands a downward opening-session gesture to the native scrollport", () => {
    assert.equal(zenReadableGestureShouldDisarmFollow(0, 340, 42), true);
  });

  it("keeps edge-only gestures available for Zen's elastic treatment", () => {
    assert.equal(zenReadableGestureShouldDisarmFollow(0, 340, -42), false);
    assert.equal(zenReadableGestureShouldDisarmFollow(340, 340, 42), false);
  });

  it("hands either movable direction to the user from the middle", () => {
    assert.equal(zenReadableGestureShouldDisarmFollow(170, 340, -42), true);
    assert.equal(zenReadableGestureShouldDisarmFollow(170, 340, 42), true);
  });

  it("does not disarm for a nonexistent range or sub-threshold touch jitter", () => {
    assert.equal(zenReadableGestureShouldDisarmFollow(0, 0, 42), false);
    assert.equal(zenReadableGestureShouldDisarmFollow(170, 340, -4, 4), false);
    assert.equal(zenReadableGestureShouldDisarmFollow(170, 340, -5, 4), true);
  });
});

describe("zenReadableWheelShouldApplyElasticPull", () => {
  it("leaves downward native scrolling alone, including at either edge", () => {
    assert.equal(zenReadableWheelShouldApplyElasticPull(0, 42), false);
    assert.equal(zenReadableWheelShouldApplyElasticPull(170, 42), false);
    assert.equal(zenReadableWheelShouldApplyElasticPull(340, 42), false);
  });

  it("applies only the visual top-edge elastic cue to upward input", () => {
    assert.equal(zenReadableWheelShouldApplyElasticPull(170, -42), false);
    assert.equal(zenReadableWheelShouldApplyElasticPull(0, -42), true);
  });
});
