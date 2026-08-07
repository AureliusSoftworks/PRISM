import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedPrismCompanionReleaseVelocity,
  clampPrismCompanionPosition,
  createPrismCompanionDragVelocitySample,
  measurePrismCompanionRightPanelInsetPx,
  resolvePrismCompanionLiveBounds,
  resolvePrismCompanionRightPanelPush,
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

test("samples wield-style pointer motion into bounded release velocity", () => {
  const sample = createPrismCompanionDragVelocitySample(200, 300, 1_000);
  assert.equal(sample.velocityX, 0);
  assert.equal(sample.velocityY, 0);
  samplePrismCompanionDragVelocity(sample, 240, 330, 1_020);
  assert.ok(sample.velocityX > 0);
  assert.ok(sample.velocityY > 0);
  const bounded = boundedPrismCompanionReleaseVelocity({
    x: sample.velocityX,
    y: sample.velocityY,
  });
  assert.ok(Math.hypot(bounded.x, bounded.y) > 0);
  assert.ok(Math.hypot(bounded.x, bounded.y) <= 1_650);

  const parked = createPrismCompanionDragVelocitySample(100, 100, 2_000);
  samplePrismCompanionDragVelocity(parked, 100, 100, 2_016);
  assert.equal(
    Math.hypot(
      boundedPrismCompanionReleaseVelocity({
        x: parked.velocityX,
        y: parked.velocityY,
      }).x,
      boundedPrismCompanionReleaseVelocity({
        x: parked.velocityX,
        y: parked.velocityY,
      }).y,
    ),
    0,
  );
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

test("shrinks the right playable edge when a drawer covers the side", () => {
  const open = resolvePrismCompanionLiveBounds({
    viewportWidth: 1_000,
    rightInsetPx: 400,
  });
  assert.ok(open.maxX < 0.95);
  assert.equal(open.maxX, 1 - (400 + 34 + 14) / 1_000);

  const closed = resolvePrismCompanionLiveBounds({
    viewportWidth: 1_000,
    rightInsetPx: 0,
  });
  assert.equal(closed.maxX, 0.95);
});

test("pushes the orb left with inertia when the right wall advances over it", () => {
  const push = resolvePrismCompanionRightPanelPush({
    position: { x: 0.92, y: 0.5 },
    velocity: { x: 120, y: 40 },
    previousMaxX: 0.95,
    nextMaxX: 0.55,
    viewportWidth: 1_000,
  });
  assert.equal(push.pushed, true);
  assert.equal(push.position.x, 0.55);
  assert.ok(push.velocity.x < -400);
  assert.ok(push.velocity.y < 40);

  const clear = resolvePrismCompanionRightPanelPush({
    position: { x: 0.4, y: 0.5 },
    velocity: { x: 0, y: 0 },
    previousMaxX: 0.95,
    nextMaxX: 0.55,
    viewportWidth: 1_000,
  });
  assert.equal(clear.pushed, false);
});

test("rebounds against a live right-panel bound during inertia", () => {
  const bounds = resolvePrismCompanionLiveBounds({
    viewportWidth: 1_000,
    rightInsetPx: 400,
  });
  const rebounded = stepPrismCompanionInertia({
    position: { x: bounds.maxX - 0.001, y: 0.5 },
    velocity: { x: 1_000, y: 0 },
    elapsedSeconds: 1 / 60,
    viewportWidth: 1_000,
    viewportHeight: 800,
    bounds,
  });
  assert.equal(rebounded.position.x, bounds.maxX);
  assert.ok(rebounded.velocity.x < 0);
  assert.equal(rebounded.bounced, true);
});

test("measures right-drawer coverage from data-prism-panel nodes", () => {
  const root = {
    querySelectorAll(selector: string) {
      assert.equal(selector, "[data-prism-panel]");
      return [
        {
          dataset: {},
          getBoundingClientRect: () => ({
            left: 600,
            right: 1_000,
            width: 400,
            height: 800,
            top: 0,
            bottom: 800,
          }),
        },
        {
          dataset: { closing: "true" },
          getBoundingClientRect: () => ({
            left: 100,
            right: 1_000,
            width: 900,
            height: 800,
            top: 0,
            bottom: 800,
          }),
        },
      ];
    },
  } as unknown as ParentNode;

  assert.equal(measurePrismCompanionRightPanelInsetPx(root, 1_000), 400);
  assert.equal(clampPrismCompanionPosition({ x: 0.9, y: 0.5 }, {
    minX: 0.05,
    maxX: 0.55,
    minY: 0.12,
    maxY: 0.92,
  }).x, 0.55);
});
