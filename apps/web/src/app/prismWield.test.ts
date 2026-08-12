import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrismWieldState,
  prismWieldCanArm,
  transitionPrismWield,
} from "./prismWield.ts";

test("keeps Prism wieldable from Home while assistant menus stay protected", () => {
  assert.equal(
    prismWieldCanArm({
      companionMenuOpen: false,
      softSynthesisMenuOpen: false,
      homeDocked: false,
    }),
    true,
  );
  assert.equal(
    prismWieldCanArm({
      companionMenuOpen: true,
      softSynthesisMenuOpen: false,
      homeDocked: false,
    }),
    false,
  );
  assert.equal(
    prismWieldCanArm({
      companionMenuOpen: false,
      softSynthesisMenuOpen: true,
      homeDocked: false,
    }),
    false,
  );
  assert.equal(
    prismWieldCanArm({
      companionMenuOpen: false,
      softSynthesisMenuOpen: false,
      homeDocked: true,
    }),
    true,
  );
});

test("arms from a modifier-only timeout without changing state on stale timers", () => {
  const pending = transitionPrismWield(createPrismWieldState(), {
    type: "modifier-down",
    pointer: { x: 10, y: 20 },
  });
  assert.equal(pending.phase, "pending");
  assert.equal(
    transitionPrismWield(pending, {
      type: "arm",
      epoch: pending.epoch - 1,
    }),
    pending,
  );
  assert.equal(
    transitionPrismWield(pending, { type: "arm", epoch: pending.epoch }).phase,
    "following",
  );
});

test("arms after four pixels of pointer travel and follows without React state", () => {
  const pending = transitionPrismWield(createPrismWieldState(), {
    type: "modifier-down",
    pointer: { x: 10, y: 20 },
  });
  const shortMove = transitionPrismWield(pending, {
    type: "pointer-move",
    epoch: pending.epoch,
    pointer: { x: 12, y: 21 },
  });
  assert.equal(shortMove.phase, "pending");
  const armed = transitionPrismWield(shortMove, {
    type: "pointer-move",
    epoch: shortMove.epoch,
    pointer: { x: 14, y: 20 },
  });
  assert.equal(armed.phase, "following");
  assert.deepEqual(armed.pointer, { x: 14, y: 20 });
});

test("captures, returns, and finishes through explicit phases", () => {
  const pending = transitionPrismWield(createPrismWieldState(), {
    type: "modifier-down",
    pointer: { x: 10, y: 20 },
  });
  const following = transitionPrismWield(pending, {
    type: "arm",
    epoch: pending.epoch,
  });
  const captured = transitionPrismWield(following, {
    type: "capture",
    epoch: following.epoch,
    pointer: { x: 40, y: 50 },
  });
  assert.equal(captured.phase, "captured");
  const returning = transitionPrismWield(captured, {
    type: "return",
    epoch: captured.epoch,
  });
  assert.equal(returning.phase, "returning");
  assert.equal(
    transitionPrismWield(returning, {
      type: "finish",
      epoch: returning.epoch,
    }).phase,
    "idle",
  );
});

test("ignores capture and finish events from stale gestures", () => {
  const pending = transitionPrismWield(createPrismWieldState(), {
    type: "modifier-down",
    pointer: { x: 0, y: 0 },
  });
  const following = transitionPrismWield(pending, {
    type: "arm",
    epoch: pending.epoch,
  });
  assert.equal(
    transitionPrismWield(following, {
      type: "capture",
      epoch: following.epoch + 1,
      pointer: { x: 4, y: 4 },
    }),
    following,
  );
});
