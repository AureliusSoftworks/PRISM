import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedPrismCompanionReleaseVelocity,
  clampPrismCompanionPosition,
  resolvePrismCompanionSurfaceGlare,
  samplePrismCompanionDragVelocity,
  stepPrismCompanionInertia,
} from "./prismCompanionPhysics.ts";

test("clamps the orb to its visible viewport envelope", () => {
  assert.deepEqual(clampPrismCompanionPosition({ x: -2, y: 4 }), {
    x: 0.05,
    y: 0.92,
  });
});

test("moves the orb glare across its surface against the bot-screen light", () => {
  const lowerRight = resolvePrismCompanionSurfaceGlare({ x: 0.92, y: 0.84 });
  const upperLeft = resolvePrismCompanionSurfaceGlare({ x: 0.05, y: 0.12 });
  const underLight = resolvePrismCompanionSurfaceGlare({ x: 0.22, y: 0.16 });

  assert.deepEqual(lowerRight, { xPct: 28, yPct: 30 });
  assert.deepEqual(underLight, { xPct: 50, yPct: 42 });
  assert.ok(upperLeft.xPct > lowerRight.xPct);
  assert.ok(upperLeft.yPct > lowerRight.yPct);
});

test("gives the orb a weighted sampled release velocity", () => {
  const sample = {
    lastX: 100,
    lastY: 100,
    lastTimeMs: 1_000,
    velocityX: 0,
    velocityY: 0,
  };
  samplePrismCompanionDragVelocity(sample, 124, 112, 1_016);
  assert.ok(sample.velocityX > 600);
  assert.ok(sample.velocityY > 300);
  const bounded = boundedPrismCompanionReleaseVelocity({
    x: 4_000,
    y: 0,
  });
  assert.equal(Math.round(Math.hypot(bounded.x, bounded.y)), 1_650);
});

test("carries momentum, loses energy, and rebounds inside bounds", () => {
  const carried = stepPrismCompanionInertia({
    position: { x: 0.5, y: 0.5 },
    velocity: { x: 900, y: 240 },
    elapsedSeconds: 1 / 60,
    viewportWidth: 1_000,
    viewportHeight: 800,
  });
  assert.ok(carried.position.x > 0.5);
  assert.ok(carried.position.y > 0.5);
  assert.ok(Math.hypot(carried.velocity.x, carried.velocity.y) < 932);
  assert.equal(carried.moving, true);
  assert.equal(carried.bounced, false);

  const rebounded = stepPrismCompanionInertia({
    position: { x: 0.949, y: 0.5 },
    velocity: { x: 1_000, y: 0 },
    elapsedSeconds: 1 / 60,
    viewportWidth: 1_000,
    viewportHeight: 800,
  });
  assert.equal(rebounded.position.x, 0.95);
  assert.ok(rebounded.velocity.x < 0);
  assert.equal(rebounded.bounced, true);
});

test("reports rebounds from every viewport side", () => {
  const cases = [
    {
      position: { x: 0.051, y: 0.5 },
      velocity: { x: -1_000, y: 0 },
      expectedPosition: { axis: "x", value: 0.05 },
      expectedVelocity: { axis: "x", sign: 1 },
    },
    {
      position: { x: 0.949, y: 0.5 },
      velocity: { x: 1_000, y: 0 },
      expectedPosition: { axis: "x", value: 0.95 },
      expectedVelocity: { axis: "x", sign: -1 },
    },
    {
      position: { x: 0.5, y: 0.121 },
      velocity: { x: 0, y: -1_000 },
      expectedPosition: { axis: "y", value: 0.12 },
      expectedVelocity: { axis: "y", sign: 1 },
    },
    {
      position: { x: 0.5, y: 0.919 },
      velocity: { x: 0, y: 1_000 },
      expectedPosition: { axis: "y", value: 0.92 },
      expectedVelocity: { axis: "y", sign: -1 },
    },
  ] as const;

  for (const testCase of cases) {
    const result = stepPrismCompanionInertia({
      position: testCase.position,
      velocity: testCase.velocity,
      elapsedSeconds: 1 / 60,
      viewportWidth: 1_000,
      viewportHeight: 800,
    });
    assert.equal(result.bounced, true);
    assert.equal(
      result.position[testCase.expectedPosition.axis],
      testCase.expectedPosition.value,
    );
    assert.equal(
      Math.sign(result.velocity[testCase.expectedVelocity.axis]),
      testCase.expectedVelocity.sign,
    );
  }
});

test("settles low-speed movement instead of drifting forever", () => {
  const settled = stepPrismCompanionInertia({
    position: { x: 0.5, y: 0.5 },
    velocity: { x: 10, y: 10 },
    elapsedSeconds: 1 / 60,
    viewportWidth: 1_000,
    viewportHeight: 800,
  });
  assert.equal(settled.moving, false);
  assert.deepEqual(settled.velocity, { x: 0, y: 0 });
  assert.equal(settled.bounced, false);
});
