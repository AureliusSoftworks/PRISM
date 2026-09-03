import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { MansionDynamicLightV2 } from "@localai/shared";
import {
  ROOM_LIGHT_SAMPLE_RADIUS_PX,
  cloneRoomLight,
  createRoomLight,
  sampleNaturalRoomLightColor,
} from "./roomLightPlacement.ts";

function raster(width: number, height: number, color: readonly [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset);
  return data;
}

function setPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  data.set(color, (y * width + x) * 4);
}

describe("Whodunnit room light placement", () => {
  it("selects a natural bright color cluster instead of an isolated brightest pixel", () => {
    const width = 7;
    const height = 7;
    const data = raster(width, height, [12, 18, 28, 255]);
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) setPixel(data, width, x, y, [245, 170, 80, 255]);
    }
    setPixel(data, width, 3, 0, [255, 255, 255, 255]);

    assert.equal(ROOM_LIGHT_SAMPLE_RADIUS_PX, 64);
    assert.equal(sampleNaturalRoomLightColor({
      data,
      width,
      height,
      centerX: 3.5,
      centerY: 3.5,
      radiusX: 3.5,
      radiusY: 3.5,
    }), "#f5aa50");
  });

  it("keeps a compact warm fixture from being outvoted by a broad neutral surface", () => {
    const width = 33;
    const height = 33;
    const data = raster(width, height, [122, 128, 138, 255]);
    for (let y = 14; y <= 18; y += 1) {
      for (let x = 14; x <= 18; x += 1) setPixel(data, width, x, y, [238, 165, 82, 255]);
    }

    assert.equal(sampleNaturalRoomLightColor({
      data,
      width,
      height,
      centerX: 16.5,
      centerY: 16.5,
      radiusX: 16.5,
      radiusY: 16.5,
    }), "#eea552");
  });

  it("keeps sampled color independent from light type", () => {
    const color = "#c8e9ff";
    const lamp = createRoomLight("room-library", "omni", { x: 0.4, y: 0.5 }, "light:lamp", color);
    const neon = createRoomLight("room-library", "neon", { x: 0.4, y: 0.5 }, "light:neon", color);

    assert.equal(lamp.color, color);
    assert.equal(neon.color, color);
  });

  it("creates an independent, offset clone with a fresh identity", () => {
    const source: Extract<MansionDynamicLightV2, { kind: "omni" }> = {
      id: "light:source",
      roomId: "room-library",
      kind: "omni",
      color: "#ffb067",
      intensity: 0.72,
      animationSeed: "light:source",
      cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
      geometry: { x: 0.5, y: 0.4, radius: 0.18 },
    };
    const original = structuredClone(source);

    const clone = cloneRoomLight(source, "light:copy");

    assert.deepEqual(source, original);
    assert.equal(clone.id, "light:copy");
    assert.equal(clone.animationSeed, "light:copy");
    assert.equal(clone.kind, "omni");
    if (clone.kind !== "omni") throw new Error("Expected an omni light clone.");
    assert.equal(clone.geometry.radius, source.geometry.radius);
    assert.equal(clone.geometry.x, 0.54);
    assert.equal(clone.geometry.y, 0.44);
    assert.notStrictEqual(clone.cuePermission, source.cuePermission);
  });

  it("keeps edge-bound neon clones inside the room while offsetting them inward", () => {
    const source: Extract<MansionDynamicLightV2, { kind: "neon" }> = {
      id: "light:neon-source",
      roomId: "room-library",
      kind: "neon",
      color: "#66e5ea",
      intensity: 0.72,
      animationSeed: "light:neon-source",
      cuePermission: { version: 1, mode: "mansion_static", allowedCueIds: [] },
      geometry: {
        points: [{ x: 0.94, y: 0.94 }, { x: 1, y: 0.94 }],
        width: 0.012,
      },
    };

    const clone = cloneRoomLight(source, "light:neon-copy");

    assert.equal(clone.kind, "neon");
    if (clone.kind !== "neon") throw new Error("Expected a neon light clone.");
    assert.ok(Math.abs(clone.geometry.points[0]!.x - 0.9) < 1e-9);
    assert.ok(Math.abs(clone.geometry.points[1]!.x - 0.96) < 1e-9);
    assert.ok(clone.geometry.points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
  });

  it("exposes cloning from the light context menu", () => {
    const editor = readFileSync(new URL("./RoomLightEditorDialog.tsx", import.meta.url), "utf8");

    assert.match(editor, /Clone light/u);
    assert.match(editor, /cloneRoomLight\(source, `light:\$\{crypto\.randomUUID\(\)\}`\)/u);
    assert.match(editor, /lights\.length >= MANSION_LAYOUT_V2_MAX_LIGHTS/u);
    assert.match(editor, /sampleRoomLightColorFromImage\(roomImageRef\.current, picker\)/u);
    assert.match(editor, /sampledColor \?\? ROOM_LIGHT_DEFAULT_COLOR/u);
    assert.match(editor, /Resample color/u);
    assert.match(editor, /sampleRoomLightColorFromImage\(roomImageRef\.current, roomLightCenter\(source\)\)/u);
    assert.match(editor, /updateLight\(id, \(light\) => \(\{ \.\.\.light, color: sampledColor \}\)\)/u);
  });

  it("documents that placement samples color locally and independently from type", () => {
    const tutorial = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");

    assert.match(tutorial, /PRISM locally samples the brightest coherent color near that point/u);
    assert.match(tutorial, /right-click an existing light to resample from its current position/u);
    assert.match(tutorial, /Light type controls shape and motion while color remains independently editable/u);
  });
});
