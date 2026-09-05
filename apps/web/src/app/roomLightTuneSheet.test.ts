import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  roomLightTuneCandidateTitleV1,
  roomLightTuneCanvasBlendOpV1,
  roomLightTuneSheetLayoutV1,
} from "./roomLightTuneSheet.ts";

describe("room light tune sheet", () => {
  it("lays candidates out two across at the plate's aspect", () => {
    const four = roomLightTuneSheetLayoutV1({ count: 4, aspect: 16 / 9, tileWidth: 800 });
    assert.equal(four.columns, 2);
    assert.equal(four.rows, 2);
    assert.deepEqual(four.tile, { width: 800, height: 450 });
    assert.deepEqual([four.width, four.height], [1600, 900]);
    assert.deepEqual(four.tiles, [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 450 }, { x: 800, y: 450 }]);
    const one = roomLightTuneSheetLayoutV1({ count: 1, aspect: 3 / 2 });
    assert.equal(one.columns, 1);
    assert.deepEqual([one.width, one.height], [800, 533]);
    const odd = roomLightTuneSheetLayoutV1({ count: 3, aspect: Number.NaN });
    assert.equal(odd.rows, 2);
    assert.equal(odd.tile.height, 450, "a bad aspect falls back to 16:9");
  });

  it("maps every room blend to the matching canvas operation", () => {
    assert.equal(roomLightTuneCanvasBlendOpV1("auto"), "hard-light");
    assert.equal(roomLightTuneCanvasBlendOpV1(undefined), "hard-light");
    assert.equal(roomLightTuneCanvasBlendOpV1("overlay"), "overlay");
    assert.equal(roomLightTuneCanvasBlendOpV1("plus-lighter"), "lighter");
    assert.equal(roomLightTuneCanvasBlendOpV1("normal"), "source-over");
    assert.equal(roomLightTuneCandidateTitleV1({ label: "B", blend: "soft-light" }), "B · Soft Light");
  });

  it("draws the plate first, then each fixed layer under its own blend, occluders normal", () => {
    const source = readFileSync(new URL("./roomLightTuneSheet.ts", import.meta.url), "utf8");
    assert.match(source, /MANSION_ROOM_LIGHT_LAYERS_V1\.map\(\(layer\) => \(\{/u);
    assert.match(source, /canvas\[data-room-light-canvas="\$\{layer\.key\}"\]/u);
    assert.match(source, /drawImage\(args\.plate, origin\.x, origin\.y, width, height\);[\s\S]*?roomLightTuneCanvasBlendOpV1\(layer\.blend\)/u);
    assert.match(source, /atmosphere[\s\S]*?"source-over"/u);
    assert.match(source, /mansionDynamicLightCenterV2\(light\)/u);
  });
});
