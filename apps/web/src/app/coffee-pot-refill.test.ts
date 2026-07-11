import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COFFEE_POT_ASSET_VERSION,
  COFFEE_POT_FILL_FRAME_MS,
  COFFEE_POT_FINAL_POUR_FRAME_INDEX,
  COFFEE_POT_HOVER_HOLD_BEFORE_POUR_MS,
  COFFEE_POT_POUR_FRAME_MS,
  COFFEE_POT_RETURN_MS,
  COFFEE_POT_TARGET_HIT_SLOP_PX,
  COFFEE_POT_TEXT_FORCEFIELD_PADDING_PX,
  coffeeCupTopOffFillFrameIndices,
  coffeeCupTopOffFrameIndexForPour,
  coffeeCupTopOffProgressAfterForPour,
  coffeePotFillFrameDelayMs,
  coffeePotPointerDistanceFromTarget,
  coffeePotPointerIsInsideTarget,
  coffeePotPointOutsideExclusion,
  coffeePotPourFrameImageUrl,
  coffeePotPourFrameDelayMs,
  coffeePotPourImageUrl,
  coffeePotRefillCanComplete,
  coffeePotRestImageUrl,
  coffeePotRefillTargetState,
} from "./coffee-pot-refill.ts";

describe("Coffee pot refill timing", () => {
  it("starts pouring quickly and keeps a visible fill cadence", () => {
    assert.ok(COFFEE_POT_HOVER_HOLD_BEFORE_POUR_MS <= 220);
    assert.ok(COFFEE_POT_POUR_FRAME_MS <= 50);
    assert.ok(COFFEE_POT_FILL_FRAME_MS >= 160);
    assert.equal(COFFEE_POT_RETURN_MS, 280);
    assert.equal(
      coffeePotFillFrameDelayMs(COFFEE_POT_FINAL_POUR_FRAME_INDEX),
      720
    );
    assert.equal(
      coffeePotPourFrameDelayMs(COFFEE_POT_FINAL_POUR_FRAME_INDEX),
      160
    );
    assert.ok(
      coffeePotPourFrameDelayMs(COFFEE_POT_FINAL_POUR_FRAME_INDEX) <
        coffeePotFillFrameDelayMs(2)
    );
  });

  it("resolves theme-specific Coffee pot sprite paths", () => {
    const version = `?v=${COFFEE_POT_ASSET_VERSION}`;
    assert.equal(coffeePotRestImageUrl("dark"), `/coffee-pot/coffee_pot.png${version}`);
    assert.equal(coffeePotRestImageUrl("light"), `/coffee-pot/coffee_light_pot.png${version}`);
    assert.equal(coffeePotPourImageUrl("dark"), `/coffee-pot/coffee_pot_pour.png${version}`);
    assert.equal(
      coffeePotPourImageUrl("light"),
      `/coffee-pot/coffee_light_pot_light_pour.png${version}`
    );
    assert.equal(coffeePotPourFrameImageUrl("dark", 3), `/coffee-pot/coffee_3.png${version}`);
    assert.equal(
      coffeePotPourFrameImageUrl("light", 3),
      `/coffee-pot/coffee_light_3.png${version}`
    );
    assert.equal(
      coffeePotPourFrameImageUrl("light", 99),
      `/coffee-pot/coffee_light_4.png${version}`
    );
  });

  it("gives the pot a generous reach around mug targets", () => {
    const rect = { left: 100, right: 150, top: 200, bottom: 250 };
    assert.ok(COFFEE_POT_TARGET_HIT_SLOP_PX >= 96);
    assert.equal(coffeePotPointerIsInsideTarget(125, 225, rect), true);
    assert.equal(
      coffeePotPointerIsInsideTarget(100 - COFFEE_POT_TARGET_HIT_SLOP_PX, 225, rect),
      true
    );
    assert.equal(
      coffeePotPointerIsInsideTarget(151 + COFFEE_POT_TARGET_HIT_SLOP_PX, 225, rect),
      false
    );
    assert.equal(coffeePotPointerIsInsideTarget(99, 225, rect, 0), false);
    assert.equal(coffeePotPointerDistanceFromTarget(125, 225, rect), 0);
    assert.equal(coffeePotPointerDistanceFromTarget(80, 190, rect), Math.hypot(20, 10));
  });

  it("keeps the dragged pot outside the padded center-text forcefield", () => {
    const rect = { left: 200, right: 400, top: 160, bottom: 340 };
    assert.deepEqual(
      coffeePotPointOutsideExclusion({ x: 120, y: 240, rect }),
      { x: 120, y: 240, blocked: false }
    );
    assert.deepEqual(
      coffeePotPointOutsideExclusion({ x: 190, y: 240, rect }),
      { x: 136, y: 240, blocked: true }
    );
    assert.equal(COFFEE_POT_TEXT_FORCEFIELD_PADDING_PX, 64);
  });

  it("slides along the forcefield edge instead of jumping across the table text", () => {
    const rect = { left: 200, right: 400, top: 160, bottom: 340 };
    assert.deepEqual(
      coffeePotPointOutsideExclusion({
        x: 280,
        y: 220,
        previousX: 120,
        previousY: 220,
        rect,
      }),
      { x: 136, y: 220, blocked: true }
    );
    assert.deepEqual(
      coffeePotPointOutsideExclusion({
        x: 320,
        y: 260,
        previousX: 320,
        previousY: 90,
        rect,
      }),
      { x: 320, y: 96, blocked: true }
    );
    assert.deepEqual(
      coffeePotPointOutsideExclusion({
        x: 480,
        y: 240,
        previousX: 136,
        previousY: 240,
        rect,
      }),
      { x: 136, y: 240, blocked: true }
    );
    assert.deepEqual(
      coffeePotPointOutsideExclusion({
        x: 480,
        y: 70,
        previousX: 136,
        previousY: 240,
        rect,
      }),
      { x: 480, y: 70, blocked: false }
    );
  });

  it("maps pour frames from the current cup state back to full", () => {
    assert.equal(coffeeCupTopOffFrameIndexForPour(4, 0), 4);
    assert.equal(coffeeCupTopOffFrameIndexForPour(4, 1), 3);
    assert.equal(coffeeCupTopOffFrameIndexForPour(4, 2), 2);
    assert.equal(coffeeCupTopOffFrameIndexForPour(4, 3), 1);
    assert.equal(coffeeCupTopOffFrameIndexForPour(4, 4), 0);
    assert.equal(coffeeCupTopOffFrameIndexForPour(0, 4), null);
  });

  it("maps interrupted pour frames to the last visible filled cup level", () => {
    assert.equal(coffeeCupTopOffProgressAfterForPour(4, 1), 0.38);
    assert.equal(coffeeCupTopOffProgressAfterForPour(4, 2), 0.18);
    assert.equal(coffeeCupTopOffProgressAfterForPour(4, 4), 0.04);
    assert.equal(coffeeCupTopOffProgressAfterForPour(0, 2), null);
  });

  it("keeps all refill frames mounted for crossfades", () => {
    assert.deepEqual(coffeeCupTopOffFillFrameIndices(3), [3, 2, 1, 0]);
    assert.deepEqual(coffeeCupTopOffFillFrameIndices(0), []);
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
