import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signalCupSipTargetFromMouth } from "./signalCupSipGeometry.ts";

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
    assert.ok(Math.abs(host.x - 527) < 0.000_001);
    assert.ok(Math.abs(guest.x - 473) < 0.000_001);
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
});
