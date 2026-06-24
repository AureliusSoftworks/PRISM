import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS,
  ZEN_CANVAS_SPEED_NUDGE_CLICK_WINDOW_MS,
  ZEN_CANVAS_SPEED_NUDGE_HOLD_STACKS,
  ZEN_CANVAS_SPEED_NUDGE_MAX_STACKS,
  beginZenCanvasSpeedNudgeHold,
  createZenCanvasSpeedNudgeState,
  endZenCanvasSpeedNudgeHold,
  registerZenCanvasSpeedNudgeClick,
  resolveZenCanvasSpeedNudgeDelayMultiplier,
} from "./zenCanvasSpeedNudge.ts";

describe("Zen canvas speed nudge", () => {
  it("arms on the first click without changing reveal speed", () => {
    const result = registerZenCanvasSpeedNudgeClick(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:message",
      nowMs: 1000,
    });

    assert.equal(result.activated, false);
    assert.equal(result.state.lastClickAtMs, 1000);
    assert.equal(
      resolveZenCanvasSpeedNudgeDelayMultiplier(result.state, {
        revealKey: "conversation:message",
        nowMs: 1000,
      }),
      1
    );
  });

  it("activates on a second rapid click", () => {
    const first = registerZenCanvasSpeedNudgeClick(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:message",
      nowMs: 1000,
    }).state;
    const second = registerZenCanvasSpeedNudgeClick(first, {
      revealKey: "conversation:message",
      nowMs: 1000 + ZEN_CANVAS_SPEED_NUDGE_CLICK_WINDOW_MS,
    });

    assert.equal(second.activated, true);
    assert.equal(second.state.stackCount, 1);
    assert.ok(
      resolveZenCanvasSpeedNudgeDelayMultiplier(second.state, {
        revealKey: "conversation:message",
        nowMs: 1200,
      }) < 1
    );
  });

  it("does not activate when clicks are too far apart", () => {
    const first = registerZenCanvasSpeedNudgeClick(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:message",
      nowMs: 1000,
    }).state;
    const second = registerZenCanvasSpeedNudgeClick(first, {
      revealKey: "conversation:message",
      nowMs: 1000 + ZEN_CANVAS_SPEED_NUDGE_CLICK_WINDOW_MS + 1,
    });

    assert.equal(second.activated, false);
    assert.equal(second.state.stackCount, 0);
  });

  it("caps stacked rapid clicks", () => {
    let state = registerZenCanvasSpeedNudgeClick(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:message",
      nowMs: 1000,
    }).state;

    for (let i = 1; i <= ZEN_CANVAS_SPEED_NUDGE_MAX_STACKS + 3; i += 1) {
      state = registerZenCanvasSpeedNudgeClick(state, {
        revealKey: "conversation:message",
        nowMs: 1000 + i * 100,
      }).state;
    }

    assert.equal(state.stackCount, ZEN_CANVAS_SPEED_NUDGE_MAX_STACKS);
    assert.equal(
      resolveZenCanvasSpeedNudgeDelayMultiplier(state, {
        revealKey: "conversation:message",
        nowMs: 1400,
      }),
      1 / 2
    );
  });

  it("expires the boost", () => {
    const armed = registerZenCanvasSpeedNudgeClick(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:message",
      nowMs: 1000,
    }).state;
    const boosted = registerZenCanvasSpeedNudgeClick(armed, {
      revealKey: "conversation:message",
      nowMs: 1200,
    }).state;

    assert.equal(
      resolveZenCanvasSpeedNudgeDelayMultiplier(boosted, {
        revealKey: "conversation:message",
        nowMs: 1200 + ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS,
      }),
      1
    );
  });

  it("resets when the reveal key changes", () => {
    const armed = registerZenCanvasSpeedNudgeClick(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:first",
      nowMs: 1000,
    }).state;
    const boosted = registerZenCanvasSpeedNudgeClick(armed, {
      revealKey: "conversation:first",
      nowMs: 1200,
    }).state;
    const next = registerZenCanvasSpeedNudgeClick(boosted, {
      revealKey: "conversation:second",
      nowMs: 1300,
    });

    assert.equal(next.activated, false);
    assert.equal(next.state.revealKey, "conversation:second");
    assert.equal(next.state.stackCount, 0);
    assert.equal(
      resolveZenCanvasSpeedNudgeDelayMultiplier(boosted, {
        revealKey: "conversation:second",
        nowMs: 1300,
      }),
      1
    );
  });

  it("speeds immediately while the canvas press is held", () => {
    const held = beginZenCanvasSpeedNudgeHold(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:message",
      nowMs: 1000,
    });

    assert.equal(held.activated, true);
    assert.equal(held.state.holdActive, true);
    assert.equal(held.state.stackCount, ZEN_CANVAS_SPEED_NUDGE_HOLD_STACKS);
    assert.equal(
      resolveZenCanvasSpeedNudgeDelayMultiplier(held.state, {
        revealKey: "conversation:message",
        nowMs: 1000 + ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS + 1,
      }),
      1 / 2
    );
  });

  it("keeps a short boost after the canvas press ends", () => {
    const held = beginZenCanvasSpeedNudgeHold(createZenCanvasSpeedNudgeState(), {
      revealKey: "conversation:message",
      nowMs: 1000,
    }).state;
    const released = endZenCanvasSpeedNudgeHold(held, {
      revealKey: "conversation:message",
      nowMs: 1800,
    });

    assert.equal(released.holdActive, false);
    assert.equal(
      resolveZenCanvasSpeedNudgeDelayMultiplier(released, {
        revealKey: "conversation:message",
        nowMs: 1800 + ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS - 1,
      }),
      1 / 2
    );
    assert.equal(
      resolveZenCanvasSpeedNudgeDelayMultiplier(released, {
        revealKey: "conversation:message",
        nowMs: 1800 + ZEN_CANVAS_SPEED_NUDGE_BOOST_DURATION_MS,
      }),
      1
    );
  });
});
