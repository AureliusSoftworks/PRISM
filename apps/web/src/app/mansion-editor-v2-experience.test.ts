import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const editorSource = readFileSync(new URL("./MansionEditorDialog.tsx", import.meta.url), "utf8");
const mysteryCss = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
const debateSource = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");

describe("Mansion Editor V2 experience", () => {
  it("presents a connected fixed-footprint planner with real doors and non-room blocks", () => {
    assert.match(editorSource, /data-layout-version="2"/u);
    assert.match(editorSource, /backgroundImage: `linear-gradient/u);
    assert.match(editorSource, /Open Room Editor/u);
    assert.match(editorSource, /disabled=\{!selectedRoom \|\| !roomRefinementReady\}/u);
    assert.match(editorSource, /entity\.kind === "room" && roomRefinementReady/u);
    assert.match(editorSource, /\+ Corridor/u);
    assert.doesNotMatch(editorSource, /\+ Infill/u);
    assert.match(editorSource, /Add centered door to/u);
    assert.match(editorSource, /That move would create an island/u);
    assert.match(editorSource, /onDoubleClick=\{\(\) => entity\.kind === "room" && openRoomEditor\(entity\.id\)\}/u);
    assert.match(editorSource, /Rotate .* counterclockwise/u);
    assert.match(editorSource, /Rotate .* clockwise/u);
    assert.match(editorSource, /layoutHistory\.length === 0/u);
    assert.match(editorSource, /onClick=\{undoLayout\}>Undo/u);
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
    assert.match(editorSource, /data-placement-active=\{roomTool \?\? undefined\}/u);
    assert.match(editorSource, /onPointerDown=\{beginRoomOverlay\}/u);
    assert.match(editorSource, /event\.clientX < bounds\.left \|\| event\.clientX > bounds\.right/u);
    assert.match(editorSource, /!event\.isPrimary \|\| event\.button !== 0 \|\| overlayGesture/u);
    assert.match(
      mysteryCss,
      /\.mansionRoomArtViewport > img,[\s\S]{0,360}aspect-ratio: 16 \/ 9; object-fit: cover; object-position: center;/u,
    );
    assert.match(mysteryCss, /\.mansionRoomOverlay \{[^}]*inset: 0;/u);
    assert.match(editorSource, /beginLightGesture\(event, selectedLight, "resize"\)/u);
    assert.match(editorSource, /Random flicker/u);
    assert.match(editorSource, /data-directional-dust/u);
    assert.match(editorSource, /roomEditorLights\.length.*MANSION_LAYOUT_V2_MAX_LIGHTS/u);
  });

  it("keeps generated art explicit, tenant-owned, and visibly unavailable in LOCAL", () => {
    assert.match(editorSource, /Accept candidate/u);
    assert.match(editorSource, /Retry Illustrated candidate/u);
    assert.match(editorSource, /Discard candidate/u);
    assert.match(editorSource, /Upgrade this room to Illustrated · ONLINE/u);
    assert.match(editorSource, /Only this open room is upgraded/u);
    assert.match(editorSource, /Regenerate room asset/u);
    assert.match(editorSource, /clears only this room.*anchors, lights, and staged art/u);
    assert.match(editorSource, /persistedLayoutMatchesDraft/u);
    assert.match(editorSource, /LOCAL is server-rejected and uses bundled or accepted art/u);
  });

  it("opens the existing editor from new mansion creation and prepares Mosaic under a blocker", () => {
    assert.match(debateSource, /data-tutorial-target="whodunnit-create-mansion-editor"/u);
    assert.match(debateSource, /Open Mansion Editor/u);
    assert.match(debateSource, /\/api\/debates\/mystery-mansions/u);
    assert.match(debateSource, /<MansionEditorDialog[\s\S]{0,260}creationFlow/u);
    assert.match(editorSource, /Semantic room palette/u);
    assert.match(editorSource, /DEBATE_MYSTERY_ROOM_TEMPLATES\.map/u);
    assert.match(editorSource, /Rooftop only/u);
    assert.match(editorSource, /mansionLayoutV2TemplateIsRooftopOnly/u);
    assert.match(editorSource, /mansionEditorInspector[\s\S]{0,420}mansionEditorRoomPalette/u);
    assert.match(editorSource, /Remove \{selectedRoom \? "room" : "block"\}/u);
    assert.match(editorSource, /disabled=\{!selectedEntityCanBeRemoved\}/u);
    assert.match(editorSource, /Continue to generate the Mosaic before entering individual rooms/u);
    assert.match(editorSource, /title="Building Mosaic room plates"/u);
    assert.match(editorSource, /stepLabel="Preparing the mansion map"/u);
    assert.match(editorSource, /CREATION_MOSAIC_MINIMUM_LOADER_MS = 900/u);
    assert.match(editorSource, /window\.setTimeout\(resolve, remainingLoaderTime\)/u);
    assert.match(editorSource, /Mosaic silhouettes are ready.*mansion map/u);
    assert.match(editorSource, /mansionRoomEditorNotice.*role="status"/u);
  });

  it("renders deterministic overlays and freezes them for Reduced Motion", () => {
    assert.match(mysteryCss, /mansionRoomEditorStage\[data-placement-active\] \{ cursor: crosshair;/u);
    assert.match(mysteryCss, /mansionRoomOverlay \{[^}]*pointer-events: none;/u);
    assert.match(mysteryCss, /mansionRoomAnchorMarker \{[^}]*pointer-events: auto;/u);
    assert.match(mysteryCss, /mansionLightResizeHandle \{[^}]*pointer-events: auto;/u);
    assert.match(mysteryCss, /mix-blend-mode: overlay/u);
    assert.match(mysteryCss, /mansionDynamicLightNeon/u);
    assert.match(mysteryCss, /mansionDirectionalDust/u);
    assert.match(mysteryCss, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/u);
  });
});
