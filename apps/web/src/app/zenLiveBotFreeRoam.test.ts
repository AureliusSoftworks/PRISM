import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  boundedPrismCompanionReleaseVelocity,
  createPrismCompanionDragVelocitySample,
  samplePrismCompanionDragVelocity,
  stepPrismCompanionInertia,
} from "./prismCompanionPhysics.ts";
import {
  advanceZenLiveBotPhysics,
  createZenLiveBotDragVelocitySample,
  planZenLiveBotFreeRoamDestination,
  prismCompanionPositionToZenLiveBotPoint,
  resolveZenLiveBotReleaseVelocity,
  sampleZenLiveBotDragVelocity,
  sampleZenLiveBotIdleBob,
  sampleZenLiveBotMotionPresentation,
  settleZenLiveBotPhysicsForReducedMotion,
  stepZenLiveBotAutonomousTravel,
  zenLiveBotBoundsToPrismCompanionLiveBounds,
  zenLiveBotFreeRoamShouldRun,
  zenLiveBotPointToPrismCompanionPosition,
} from "./zenLiveBotFreeRoam.ts";

const bounds = { left: 0, top: 0, right: 900, bottom: 600 };
const viewportWidth = 1_000;
const viewportHeight = 800;
const helperSource = readFileSync(
  new URL("./zenLiveBotFreeRoam.ts", import.meta.url),
  "utf8",
);

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
}

describe("zenLiveBotFreeRoam", () => {
  it("keeps the Zen throw path delegated to canonical Prism orb helpers", () => {
    assert.match(
      helperSource,
      /return createPrismCompanionDragVelocitySample\(clientX, clientY, timeMs\)/,
    );
    assert.match(
      helperSource,
      /samplePrismCompanionDragVelocity\(sample, clientX, clientY, timeMs\)/,
    );
    assert.match(helperSource, /boundedPrismCompanionReleaseVelocity\(/);
    assert.match(helperSource, /const next = stepPrismCompanionInertia\(/);
  });

  it("treats planner bounds as inclusive top-left limits", () => {
    const values = [0.1, 0.8, 1, 1];
    let index = 0;
    const destination = planZenLiveBotFreeRoamDestination({
      current: { x: 400, y: 240 },
      bounds,
      random: () => values[index++ % values.length]!,
    });

    // The planner returns a legal top-left coordinate without collision offsets.
    assertClose(destination.x, 648);
    assertClose(destination.y, 552);
  });

  it("does not model prose or chrome collision geometry", () => {
    const destination = planZenLiveBotFreeRoamDestination({
      current: { x: 390, y: 200 },
      bounds,
      random: () => 0.15,
    });
    assert.ok(destination.x >= bounds.left && destination.x <= bounds.right);
    assert.ok(destination.y >= bounds.top && destination.y <= bounds.bottom);
    assert.doesNotMatch(helperSource, /avoidRects|overlaps\(|rectAt\(/);
  });

  it("converts Zen top-left pixels to normalized Prism companion coordinates", () => {
    assert.deepEqual(
      zenLiveBotPointToPrismCompanionPosition(
        { x: 200, y: 160 },
        viewportWidth,
        viewportHeight,
      ),
      { x: 0.2, y: 0.2 },
    );
    assert.deepEqual(
      prismCompanionPositionToZenLiveBotPoint(
        { x: 0.2, y: 0.2 },
        viewportWidth,
        viewportHeight,
      ),
      { x: 200, y: 160 },
    );
    assert.deepEqual(
      zenLiveBotBoundsToPrismCompanionLiveBounds(
        { left: 50, top: 80, right: 900, bottom: 720 },
        viewportWidth,
        viewportHeight,
      ),
      { minX: 0.05, minY: 0.1, maxX: 0.9, maxY: 0.9 },
    );
  });

  it("delegates drag sampling and release bounding to the Prism orb contract", () => {
    const zenSample = createZenLiveBotDragVelocitySample(100, 200, 1_000);
    const orbSample = createPrismCompanionDragVelocitySample(100, 200, 1_000);
    assert.deepEqual(zenSample, orbSample);

    sampleZenLiveBotDragVelocity(zenSample, 140, 230, 1_016);
    samplePrismCompanionDragVelocity(orbSample, 140, 230, 1_016);
    sampleZenLiveBotDragVelocity(zenSample, 190, 260, 1_032);
    samplePrismCompanionDragVelocity(orbSample, 190, 260, 1_032);
    assert.deepEqual(zenSample, orbSample);

    assert.deepEqual(
      resolveZenLiveBotReleaseVelocity({
        sample: zenSample,
        moved: true,
        reducedMotion: false,
      }),
      boundedPrismCompanionReleaseVelocity({
        x: orbSample.velocityX,
        y: orbSample.velocityY,
      }),
    );
  });

  it("does not impart inertia for a click, cancellation, or reduced-motion release", () => {
    const sample = createZenLiveBotDragVelocitySample(0, 0, 0);
    sampleZenLiveBotDragVelocity(sample, 100, 0, 16);

    assert.deepEqual(
      resolveZenLiveBotReleaseVelocity({
        sample,
        moved: false,
        reducedMotion: false,
      }),
      { x: 0, y: 0 },
    );
    assert.deepEqual(
      resolveZenLiveBotReleaseVelocity({
        sample,
        moved: true,
        reducedMotion: true,
      }),
      { x: 0, y: 0 },
    );
  });

  it("delegates bounce and friction stepping to the Prism orb contract", () => {
    const state = {
      x: 890,
      y: 200,
      velocityX: 1_000,
      velocityY: 120,
    };
    const zen = advanceZenLiveBotPhysics(
      state,
      16,
      bounds,
      viewportWidth,
      viewportHeight,
    );
    const orb = stepPrismCompanionInertia({
      position: zenLiveBotPointToPrismCompanionPosition(
        state,
        viewportWidth,
        viewportHeight,
      ),
      velocity: { x: state.velocityX, y: state.velocityY },
      elapsedSeconds: 0.016,
      viewportWidth,
      viewportHeight,
      bounds: zenLiveBotBoundsToPrismCompanionLiveBounds(
        bounds,
        viewportWidth,
        viewportHeight,
      ),
    });
    const orbPoint = prismCompanionPositionToZenLiveBotPoint(
      orb.position,
      viewportWidth,
      viewportHeight,
    );

    assertClose(zen.x, orbPoint.x);
    assertClose(zen.y, orbPoint.y);
    assertClose(zen.velocityX, orb.velocity.x);
    assertClose(zen.velocityY, orb.velocity.y);
    assert.equal(zen.bounced, true);
    assert.ok(zen.velocityX < 0);
    assert.ok(Math.hypot(zen.velocityX, zen.velocityY) < 1_008);
  });

  it("inherits the Prism orb stop threshold", () => {
    const settled = advanceZenLiveBotPhysics(
      { x: 200, y: 200, velocityX: 10, velocityY: 10 },
      16,
      bounds,
      viewportWidth,
      viewportHeight,
    );
    assert.equal(settled.moving, false);
    assert.equal(settled.velocityX, 0);
    assert.equal(settled.velocityY, 0);
  });

  it("clears latent throw velocity when reduced motion becomes active", () => {
    assert.equal(
      zenLiveBotFreeRoamShouldRun({
        reducedMotion: true,
        dragging: false,
        transitioning: false,
      }),
      false,
    );
    assert.deepEqual(
      settleZenLiveBotPhysicsForReducedMotion({
        x: 30,
        y: 40,
        velocityX: 900,
        velocityY: -300,
      }),
      { x: 30, y: 40, velocityX: 0, velocityY: 0 },
    );
  });

  it("keeps autonomous travel separate from shared user-throw inertia", () => {
    const next = stepZenLiveBotAutonomousTravel({
      current: { x: 100, y: 100, velocityX: 0, velocityY: 0 },
      target: { x: 200, y: 100 },
      elapsedMs: 16,
    });
    assert.ok(next.x > 100);
    assert.equal(next.y, 100);
    assert.ok(next.velocityX > 0);
  });

  it("samples a bounded idle bob and tilt/glow from pixel velocity", () => {
    assert.ok(Math.abs(sampleZenLiveBotIdleBob(1_000, 0.2)) <= 1.5);
    const presentation = sampleZenLiveBotMotionPresentation(1_800, 0);
    assert.equal(presentation.tiltDeg, 10);
    assert.equal(presentation.glow, 1);
  });
});
