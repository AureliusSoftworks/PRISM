import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COFFEE_POT_FILL_FRAME_MS,
  COFFEE_POT_FINAL_POUR_FRAME_INDEX,
  COFFEE_POT_HOVER_HOLD_BEFORE_POUR_MS,
  coffeePotPourFrameDelayMs,
  coffeePotRefillCanComplete,
  coffeePotRefillTargetState,
} from "./coffee-pot-refill.ts";

describe("Coffee pot refill timing", () => {
  it("uses a deliberate hover hold and slower visible fill", () => {
    assert.ok(COFFEE_POT_HOVER_HOLD_BEFORE_POUR_MS >= 350);
    assert.ok(COFFEE_POT_FILL_FRAME_MS >= 200);
    assert.equal(
      coffeePotPourFrameDelayMs(COFFEE_POT_FINAL_POUR_FRAME_INDEX),
      960
    );
  });

  it("resets pouring readiness when moving to a different cup", () => {
    assert.deepEqual(
      coffeePotRefillTargetState({
        currentBotId: "bot-a",
        currentPourReady: true,
        target: { botId: "bot-a", progress: 0.62 },
      }),
      { pouringBotId: "bot-a", pourProgress: 0.62, pourReady: true }
    );

    assert.deepEqual(
      coffeePotRefillTargetState({
        currentBotId: "bot-a",
        currentPourReady: true,
        target: { botId: "bot-b", progress: 0.54 },
      }),
      { pouringBotId: "bot-b", pourProgress: 0.54, pourReady: false }
    );
  });

  it("completes only after the pour is ready and visually full", () => {
    assert.equal(
      coffeePotRefillCanComplete({
        pouringBotId: "bot-a",
        pourProgress: 0.62,
        pourReady: true,
        pourFrameIndex: COFFEE_POT_FINAL_POUR_FRAME_INDEX - 1,
      }),
      false
    );
    assert.equal(
      coffeePotRefillCanComplete({
        pouringBotId: "bot-a",
        pourProgress: 0.62,
        pourReady: true,
        pourFrameIndex: COFFEE_POT_FINAL_POUR_FRAME_INDEX,
      }),
      true
    );
    assert.equal(
      coffeePotRefillCanComplete({
        pouringBotId: "bot-a",
        pourProgress: 0.62,
        pourReady: true,
        pourFrameIndex: COFFEE_POT_FINAL_POUR_FRAME_INDEX,
        busyBotId: "bot-a",
      }),
      false
    );
  });
});
