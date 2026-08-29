import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const editorSource = readFileSync(new URL("./MansionEditorDialog.tsx", import.meta.url), "utf8");
const mysteryCss = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");

describe("Mansion Editor V2 experience", () => {
  it("presents a connected fixed-footprint planner with real doors and non-room blocks", () => {
    assert.match(editorSource, /data-layout-version="2"/u);
    assert.match(editorSource, /backgroundImage: `linear-gradient/u);
    assert.match(editorSource, /Open Room Editor/u);
    assert.match(editorSource, /\+ Corridor/u);
    assert.doesNotMatch(editorSource, /\+ Infill/u);
    assert.match(editorSource, /Add centered door to/u);
    assert.match(editorSource, /That move would create an island/u);
    assert.match(editorSource, /onDoubleClick=\{\(\) => rotateEntity\(entity\)\}/u);
    assert.match(editorSource, /mansionEditorCorridorResizeHandle/u);
  });

  it("drills into a room for click placement, direct lighting, and preview-only Mosaic", () => {
    assert.match(editorSource, /data-tutorial-target="whodunnit-room-editor"/u);
    assert.match(editorSource, /Mosaic changes this preview only/u);
    assert.match(
      editorSource,
      /const style = mosaic \? "mosaic" : "illustrated";[\s\S]{0,220}whodunnitMansionRoomArtUrl\(mansion\.id, room\.acceptedRoomAssetId, style\)/u,
    );
    assert.match(editorSource, /\+ Place anchor/u);
    assert.match(editorSource, /Draw the neon path/u);
    assert.match(editorSource, /beginLightGesture\(event, selectedLight, "resize"\)/u);
    assert.match(editorSource, /Random flicker/u);
    assert.match(editorSource, /data-directional-dust/u);
    assert.match(editorSource, /roomEditorLights\.length.*MANSION_LAYOUT_V2_MAX_LIGHTS/u);
  });

  it("keeps generated art explicit, tenant-owned, and visibly unavailable in LOCAL", () => {
    assert.match(editorSource, /Accept candidate/u);
    assert.match(editorSource, /Retry candidate/u);
    assert.match(editorSource, /Discard candidate/u);
    assert.match(editorSource, /persistedLayoutMatchesDraft/u);
    assert.match(editorSource, /LOCAL is server-rejected and uses bundled or accepted art/u);
  });

  it("renders deterministic overlays and freezes them for Reduced Motion", () => {
    assert.match(mysteryCss, /mix-blend-mode: overlay/u);
    assert.match(mysteryCss, /mansionDynamicLightNeon/u);
    assert.match(mysteryCss, /mansionDirectionalDust/u);
    assert.match(mysteryCss, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/u);
  });
});
