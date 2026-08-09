import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companionDockRectFromNormalizedPosition,
  PRISM_CHAT_HOME_ORB_SLOT_SELECTOR,
  PRISM_ORB_HANDOFF_DURATION_MS,
} from "./prismOrbHandoff.ts";

describe("prismOrbHandoff", () => {
  it("keeps a short handoff duration for continuity without long stalls", () => {
    assert.ok(PRISM_ORB_HANDOFF_DURATION_MS >= 250);
    assert.ok(PRISM_ORB_HANDOFF_DURATION_MS <= 500);
  });

  it("maps normalized companion docks into screen rectangles", () => {
    const rect = companionDockRectFromNormalizedPosition({ x: 0.5, y: 0.5 }, 68);
    assert.equal(rect.width, 68);
    assert.equal(rect.height, 68);
    assert.ok(Number.isFinite(rect.left));
    assert.ok(Number.isFinite(rect.top));
  });

  it("targets only the live Chat Home hero slot", () => {
    assert.equal(
      PRISM_CHAT_HOME_ORB_SLOT_SELECTOR,
      '[data-prism-chat-home-orb-slot="true"]',
    );
  });
});
