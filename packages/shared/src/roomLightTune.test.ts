import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MansionDynamicLightV2 } from "./mansionLayoutV2.ts";
import {
  ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1,
  ROOM_LIGHT_TUNE_BOUNDS_V1,
  applyRoomLightTuneVerdictV1,
  isRoomLightTuneBlendV1,
} from "./roomLightTune.ts";

const lamp: MansionDynamicLightV2 = {
  id: "light:lamp",
  roomId: "room-1",
  kind: "omni",
  color: "#ffb067",
  intensity: 0.5,
  animationSeed: "lamp",
  geometry: { x: 0.3, y: 0.4, radius: 0.18 },
  cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
};
const beam: MansionDynamicLightV2 = {
  id: "light:beam",
  roomId: "room-1",
  kind: "directional",
  color: "#ffe7b8",
  intensity: 0.72,
  animationSeed: "beam",
  dust: true,
  geometry: { points: [{ x: 0.6, y: 0.1 }, { x: 0.7, y: 0.1 }, { x: 0.8, y: 0.8 }, { x: 0.5, y: 0.8 }] },
  cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
};

describe("bounded room light tuning", () => {
  it("applies in-window intensity and nearby color, never touching geometry or ids", () => {
    const before = JSON.stringify([lamp, beam]);
    const result = applyRoomLightTuneVerdictV1({
      lights: [lamp, beam],
      blendMode: "auto",
      verdict: { blend: "overlay", lights: [
        { id: "light:lamp", reading: "blown_out", intensity: 0.3, color: "#ffc080" },
        { id: "light:beam", reading: "ok", intensity: null, color: null },
      ] },
    });
    assert.equal(JSON.stringify([lamp, beam]), before, "inputs are not mutated");
    assert.equal(result.blendMode, "overlay");
    assert.equal(result.blendChanged, true);
    assert.deepEqual(result.refused, []);
    assert.deepEqual(result.applied, [
      { id: "light:lamp", intensity: { from: 0.5, to: 0.3 }, color: { from: "#ffb067", to: "#ffc080" } },
    ]);
    const tunedLamp = result.lights[0]!;
    assert.equal(tunedLamp.intensity, 0.3);
    assert.equal(tunedLamp.color, "#ffc080");
    assert.deepEqual(tunedLamp.geometry, lamp.geometry);
    assert.equal(tunedLamp.kind, "omni");
    assert.deepEqual(result.lights[1], beam, "an untouched light is returned as-is");
  });

  it("clamps intensity to the window and limits each pass to one step", () => {
    const result = applyRoomLightTuneVerdictV1({
      lights: [lamp, beam],
      blendMode: "hard-light",
      verdict: { lights: [
        { id: "light:lamp", intensity: 1.4 },
        { id: "light:beam", intensity: 0 },
      ] },
    });
    // 0.5 toward 0.95 is capped at one step of 0.35.
    assert.equal(result.lights[0]!.intensity, 0.85);
    // 0.72 toward the 0.15 floor is capped at one step too.
    assert.equal(result.lights[1]!.intensity, 0.37);
    assert.equal(result.blendMode, "hard-light");
    assert.equal(result.blendChanged, false);
    assert.equal(ROOM_LIGHT_TUNE_BOUNDS_V1.intensityStep, 0.35);
  });

  it("refuses far colors, bad values, unknown ids, duplicates, and off-list blends with reasons", () => {
    const result = applyRoomLightTuneVerdictV1({
      lights: [lamp],
      blendMode: "screen",
      verdict: { blend: "multiply", lights: [
        { id: "light:lamp", color: "#0044ff" },
        { id: "light:lamp", intensity: 0.4 },
        { id: "light:ghost", intensity: 0.4 },
        { id: "light:lamp", color: "orange" },
      ] },
    });
    assert.equal(result.blendMode, "screen");
    assert.equal(result.blendChanged, false);
    assert.deepEqual(result.lights, [lamp]);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.refused.map((entry) => entry.id), ["room", "light:lamp", "light:lamp", "light:ghost", "light:lamp"]);
    assert.match(result.refused[0]!.reason, /outside the shortlist/u);
    assert.match(result.refused[1]!.reason, /255 on a channel/u);
    assert.match(result.refused[2]!.reason, /judged twice/u);
    assert.match(result.refused[3]!.reason, /no light with this id/u);
    assert.match(result.refused[4]!.reason, /judged twice/u);
  });

  it("survives a null, empty, or malformed verdict without changing anything", () => {
    for (const verdict of [null, undefined, {}, { lights: null }, { lights: [null, 4, { id: 7 }] as never }]) {
      const result = applyRoomLightTuneVerdictV1({ lights: [lamp, beam], blendMode: undefined, verdict: verdict as never });
      assert.deepEqual(result.lights, [lamp, beam]);
      assert.equal(result.blendMode, "auto");
      assert.deepEqual(result.applied, []);
    }
  });

  it("keeps the shortlist to blends the room select already offers", () => {
    for (const blend of ROOM_LIGHT_TUNE_BLEND_SHORTLIST_V1) assert.equal(isRoomLightTuneBlendV1(blend), true);
    assert.equal(isRoomLightTuneBlendV1("plus-lighter"), false);
    assert.equal(isRoomLightTuneBlendV1(""), false);
  });
});
