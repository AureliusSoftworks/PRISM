import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceZenLiveBotLaneDrift,
  createZenLiveBotLaneDriftState,
  planZenLiveBotLaneDriftHop,
  ZEN_LIVE_BOT_LANE_DRIFT_BOB_AMPLITUDE_PX,
  ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX,
  zenLiveBotLaneDriftSeedUnit,
  zenLiveBotLaneDriftShouldRun,
} from "./zenLiveBotLaneDrift.ts";

describe("zenLiveBotLaneDrift", () => {
  it("seeds stable variety from bot id strings", () => {
    assert.equal(
      zenLiveBotLaneDriftSeedUnit("rick"),
      zenLiveBotLaneDriftSeedUnit("rick"),
    );
    assert.notEqual(
      zenLiveBotLaneDriftSeedUnit("rick"),
      zenLiveBotLaneDriftSeedUnit("morty"),
    );
  });

  it("starts stationary and bobs only on Y around the anchor", () => {
    const state = createZenLiveBotLaneDriftState("prism-bot", 0);
    assert.equal(state.phase, "stationary");
    assert.equal(state.direction, null);

    const { sample } = advanceZenLiveBotLaneDrift(state, {
      nowMs: 1_000,
      canvasSide: "left",
      active: true,
    });
    assert.equal(sample.phase, "stationary");
    assert.equal(sample.offsetXPx, 0);
    assert.ok(
      Math.abs(sample.offsetYPx) <=
        ZEN_LIVE_BOT_LANE_DRIFT_BOB_AMPLITUDE_PX + 0.01,
    );

    const anchored = {
      ...state,
      anchorYPx: 24,
    };
    const anchoredSample = advanceZenLiveBotLaneDrift(anchored, {
      nowMs: 1_000,
      canvasSide: "left",
      active: true,
    }).sample;
    assert.ok(
      Math.abs(anchoredSample.offsetYPx - 24) <=
        ZEN_LIVE_BOT_LANE_DRIFT_BOB_AMPLITUDE_PX + 0.01,
    );
  });

  it("plans hops that only move up or down", () => {
    const state = createZenLiveBotLaneDriftState("lane-a", 0);
    const hop = planZenLiveBotLaneDriftHop(state, {
      canvasSide: "right",
      random: () => 0.1,
    });
    assert.ok(hop.direction === "up" || hop.direction === "down");
    assert.equal(hop.toYPx === state.anchorYPx, false);
    if (hop.direction === "up") {
      assert.ok(hop.toYPx < state.anchorYPx);
    } else {
      assert.ok(hop.toYPx > state.anchorYPx);
    }
    assert.ok(
      Math.abs(hop.toYPx - state.anchorYPx) >=
        Math.min(ZEN_LIVE_BOT_LANE_DRIFT_TRAVEL_MIN_PX, Math.abs(hop.toYPx)),
    );
  });

  it("forces down when there is no room to travel up", () => {
    const state = {
      ...createZenLiveBotLaneDriftState("top-edge", 0),
      anchorYPx: -120,
    };
    const hop = planZenLiveBotLaneDriftHop(state, {
      canvasSide: "left",
      minAnchorYPx: -120,
      maxAnchorYPx: 120,
      random: () => 0,
    });
    assert.equal(hop.direction, "down");
    assert.ok(hop.toYPx > state.anchorYPx);
  });

  it("transitions from stationary bob into a vertical move", () => {
    let state = createZenLiveBotLaneDriftState("traveler", 0);
    state = {
      ...state,
      phaseDurationMs: 100,
      phaseStartedAtMs: 0,
    };
    const moved = advanceZenLiveBotLaneDrift(state, {
      nowMs: 150,
      canvasSide: "left",
      active: true,
      random: () => 0.9,
    });
    assert.equal(moved.state.phase, "moving");
    assert.ok(
      moved.state.direction === "up" || moved.state.direction === "down",
    );
    assert.equal(moved.sample.offsetXPx, 0);
    assert.equal(moved.sample.phase, "moving");
  });

  it("settles back to stationary after a completed hop", () => {
    let state = createZenLiveBotLaneDriftState("settle", 0);
    state = {
      ...state,
      phase: "moving",
      direction: "down",
      moveFromYPx: 0,
      moveToYPx: 50,
      phaseStartedAtMs: 0,
      phaseDurationMs: 100,
      hopIndex: 1,
    };
    const settled = advanceZenLiveBotLaneDrift(state, {
      nowMs: 120,
      canvasSide: "right",
      active: true,
    });
    assert.equal(settled.state.phase, "stationary");
    assert.equal(settled.state.anchorYPx, 50);
    assert.equal(settled.state.direction, null);
  });

  it("pauses motion when inactive without clearing the anchor", () => {
    const state = {
      ...createZenLiveBotLaneDriftState("paused", 0),
      anchorYPx: 40,
    };
    const paused = advanceZenLiveBotLaneDrift(state, {
      nowMs: 5_000,
      canvasSide: "left",
      active: false,
    });
    assert.equal(paused.sample.offsetYPx, 40);
    assert.equal(paused.sample.offsetXPx, 0);
    assert.equal(paused.state.anchorYPx, 40);
  });

  it("keeps bobbing without starting hops when travel is disallowed", () => {
    let state = createZenLiveBotLaneDriftState("talking-hold", 0);
    state = {
      ...state,
      phaseDurationMs: 50,
      phaseStartedAtMs: 0,
    };
    const held = advanceZenLiveBotLaneDrift(state, {
      nowMs: 80,
      canvasSide: "left",
      active: true,
      allowTravel: false,
    });
    assert.equal(held.state.phase, "stationary");
    assert.equal(held.sample.phase, "stationary");
    assert.equal(held.sample.offsetXPx, 0);
  });

  it("never applies horizontal roam while moving", () => {
    let state = createZenLiveBotLaneDriftState("vertical-only", 0);
    state = {
      ...state,
      phase: "moving",
      direction: "up",
      moveFromYPx: 20,
      moveToYPx: -40,
      phaseStartedAtMs: 0,
      phaseDurationMs: 1_000,
      hopIndex: 1,
    };
    const mid = advanceZenLiveBotLaneDrift(state, {
      nowMs: 500,
      canvasSide: "right",
      active: true,
    });
    assert.equal(mid.sample.offsetXPx, 0);
    assert.equal(mid.sample.phase, "moving");
    assert.equal(mid.sample.direction, "up");
    assert.ok(mid.sample.offsetYPx < 20 && mid.sample.offsetYPx > -40);
  });

  it("gates the loop for reduced motion, drag, and transitions", () => {
    assert.equal(
      zenLiveBotLaneDriftShouldRun({
        reducedMotion: false,
        dragging: false,
        transitioning: false,
      }),
      true,
    );
    assert.equal(
      zenLiveBotLaneDriftShouldRun({
        reducedMotion: true,
        dragging: false,
        transitioning: false,
      }),
      false,
    );
    assert.equal(
      zenLiveBotLaneDriftShouldRun({
        reducedMotion: false,
        dragging: true,
        transitioning: false,
      }),
      false,
    );
    assert.equal(
      zenLiveBotLaneDriftShouldRun({
        reducedMotion: false,
        dragging: false,
        transitioning: true,
      }),
      false,
    );
  });
});
