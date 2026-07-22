import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  SIGNAL_CUP_SIP_FACE_ACTIVE_PROGRESS,
  signalCupShadowProfileForTravel,
  signalCupSipFaceReleaseMs,
  signalCupSipTargetFromMouth,
} from "./signalCupSipGeometry.ts";

const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Signal cup sip geometry", () => {
  const sceneBounds = { left: 100, top: 50, width: 1_340, height: 737 };
  const mouthBounds = { left: 756, top: 304.6, width: 28, height: 26.8 };

  it("maps the rendered mouth through a transformed camera scene", () => {
    const target = signalCupSipTargetFromMouth({
      sceneBounds,
      sceneLocalWidth: 1_000,
      sceneLocalHeight: 550,
      mouthBounds,
      mugLocalHeight: 72,
    });

    assert.ok(target);
    assert.ok(Math.abs(target.x - 500) < 0.000_001);
    assert.equal(target.y, 217.28);
  });

  it("follows authored mouth offsets instead of a saved bot-center proxy", () => {
    const base = signalCupSipTargetFromMouth({
      sceneBounds,
      sceneLocalWidth: 1_000,
      sceneLocalHeight: 550,
      mouthBounds,
      mugLocalHeight: 72,
    });
    const shifted = signalCupSipTargetFromMouth({
      sceneBounds,
      sceneLocalWidth: 1_000,
      sceneLocalHeight: 550,
      mouthBounds: {
        ...mouthBounds,
        left: mouthBounds.left + 13.4,
        top: mouthBounds.top + 26.8,
      },
      mugLocalHeight: 72,
    });

    assert.ok(base);
    assert.ok(shifted);
    assert.equal(shifted.x - base.x, 10);
    assert.equal(shifted.y - base.y, 20);
  });

  it("keeps Coffee's seat-relative sip travel out of Signal", () => {
    assert.match(
      pageCss,
      /\.coffeeCup\.signalCoffeeCup[\s\S]*?--coffee-cup-sip-x:\s*0px;[\s\S]*?--coffee-cup-sip-y:\s*0px;/u,
    );
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
