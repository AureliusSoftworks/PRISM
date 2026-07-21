import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNAL_CUP_SIP_FACE_ACTIVE_PROGRESS,
  signalCupShadowProfileForTravel,
  signalCupSipFaceReleaseMs,
  signalCupSipTargetFromMouth,
} from "./signalCupSipGeometry.ts";

describe("Signal cup sip geometry", () => {
  const sceneBounds = { left: 100, top: 50, width: 1_340, height: 737 };
  const mouthBounds = { left: 756, top: 304.6, width: 28, height: 26.8 };

  it("maps the rendered mouth through a transformed camera scene", () => {
    const host = signalCupSipTargetFromMouth({
      role: "host",
      sceneBounds,
      sceneLocalWidth: 1_000,
      sceneLocalHeight: 550,
      mouthBounds,
      mugLocalHeight: 72,
      viewportWidth: 1_000,
    });
    const guest = signalCupSipTargetFromMouth({
      role: "guest",
      sceneBounds,
      sceneLocalWidth: 1_000,
      sceneLocalHeight: 550,
      mouthBounds,
      mugLocalHeight: 72,
      viewportWidth: 1_000,
    });

    assert.ok(host);
    assert.ok(guest);
    assert.ok(Math.abs(host.x - 531) < 0.000_001);
    assert.ok(Math.abs(guest.x - 469) < 0.000_001);
    assert.equal(host.y, 224.78);
    assert.equal(guest.y, 224.78);
  });

  it("follows authored mouth offsets instead of a saved bot-center proxy", () => {
    const base = signalCupSipTargetFromMouth({
      role: "host",
      sceneBounds,
      sceneLocalWidth: 1_000,
      sceneLocalHeight: 550,
      mouthBounds,
      mugLocalHeight: 72,
      viewportWidth: 1_000,
    });
    const shifted = signalCupSipTargetFromMouth({
      role: "host",
      sceneBounds,
      sceneLocalWidth: 1_000,
      sceneLocalHeight: 550,
      mouthBounds: {
        ...mouthBounds,
        left: mouthBounds.left + 13.4,
        top: mouthBounds.top + 26.8,
      },
      mugLocalHeight: 72,
      viewportWidth: 1_000,
    });

    assert.ok(base);
    assert.ok(shifted);
    assert.equal(shifted.x - base.x, 10);
    assert.equal(shifted.y - base.y, 20);
  });

  it("relaxes the Signal sip face before the cup starts returning", () => {
    assert.equal(SIGNAL_CUP_SIP_FACE_ACTIVE_PROGRESS, 0.6);
    assert.equal(signalCupSipFaceReleaseMs(2_000), 1_200);
    assert.equal(signalCupSipFaceReleaseMs(Number.NaN), 0);
  });

  it("grows, softens, and fades the table shadow with cup travel", () => {
    const resting = signalCupShadowProfileForTravel({
      spawnX: 220,
      spawnY: 420,
      cupX: 220,
      cupY: 420,
      sceneWidth: 1_000,
      sceneHeight: 550,
    });
    const lifted = signalCupShadowProfileForTravel({
      spawnX: 220,
      spawnY: 420,
      cupX: 420,
      cupY: 230,
      sceneWidth: 1_000,
      sceneHeight: 550,
    });

    assert.deepEqual(resting, {
      scaleX: 0.76,
      scaleY: 0.38,
      blurPx: 2,
      opacity: 0.7,
    });
    assert.ok(lifted.scaleX > resting.scaleX);
    assert.ok(lifted.scaleY > resting.scaleY);
    assert.ok(lifted.blurPx > resting.blurPx);
    assert.ok(lifted.opacity < resting.opacity);
  });
});
