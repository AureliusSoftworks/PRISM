import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const editorSource = readFileSync(new URL("./MansionEditorDialog.tsx", import.meta.url), "utf8");
const overheadEditorSource = readFileSync(new URL("./MapOverheadEditorDialog.tsx", import.meta.url), "utf8");
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
    assert.match(editorSource, /usedRoomTemplateIds/u);
    assert.match(editorSource, /No unused room type is available on this floor/u);
    assert.match(editorSource, /already placed in this legacy estate\. Each room type can only be used once/u);
    assert.match(editorSource, /<small>Placed<\/small>/u);
    assert.match(editorSource, /template\.id !== selectedRoom\.templateId/u);
    assert.match(editorSource, /debateMysteryRoomFloorRuleV1/u);
    assert.match(editorSource, /debateMysteryRoomTypeIsAllowedOnFloorV1/u);
    assert.match(editorSource, /paletteTopFloor = Math\.max\(rooftopFloor, selectedFloor\)/u);
    assert.match(editorSource, /Ground-floor only · use Floor 1/u);
    assert.match(editorSource, /Top-floor only · use Floor/u);
    assert.match(editorSource, /<small>\{floorRule\.label\}<\/small>/u);
    assert.match(editorSource, /lowerTopFloorRoom/u);
  });

  it("keeps ambient spaces as inaccessible room-like blocks instead of corridors", () => {
    // Loading must not promote decorative infill into a traversable corridor.
    assert.doesNotMatch(editorSource, /kind === "infill"\s*\?\s*\{ \.\.\.entity, kind: "corridor"/u);
    assert.match(editorSource, /\+ Ambient/u);
    assert.match(editorSource, /kind: "infill",\s*id: stableId\("ambient"\)/u);
    assert.match(editorSource, /styles\.mansionEditorAmbientBlock/u);
    assert.match(editorSource, /Ambient spaces never carry doors/u);
    assert.match(editorSource, /convertBlockKind\(selectedBlock\.id, "infill"\)/u);
    assert.match(editorSource, /mansionLayoutV2SemanticRoomsAreConnected\(next\)/u);
    assert.match(mysteryCss, /\.mansionEditorCanvas > \.mansionEditorAmbientBlock \{[^}]*border-style: solid/u);
    assert.match(mysteryCss, /\.mansionEditorBlockRole/u);
  });

  it("drills into a room for click placement, direct lighting, and source-preserving Pixel Art", () => {
    assert.match(editorSource, /data-tutorial-target="whodunnit-room-editor"/u);
    assert.match(editorSource, /Mosaic is the sole playable room-art base/u);
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
    assert.match(editorSource, /Retry Mosaic candidate/u);
    assert.match(editorSource, /Discard candidate/u);
    assert.match(editorSource, /Synthesize Mosaic · ONLINE/u);
    assert.match(editorSource, /Only this open room is synthesized/u);
    assert.match(editorSource, /Regenerate room asset/u);
    assert.match(editorSource, /clears only this room.*anchors, lights, and staged art/u);
    assert.match(editorSource, /persistedLayoutMatchesDraft/u);
    assert.match(editorSource, /LOCAL is server-rejected and uses bundled or accepted art/u);
    assert.match(
      editorSource,
      /function candidateAssetUrl[\s\S]{0,220}whodunnitMansionRoomArtUrl\(mansion\.id, assetId, "mosaic"\)/u,
    );
  });

  it("explains that an overhead redraw uses current Library identity and preserves rejected art", () => {
    assert.match(editorSource, /current Library cover, title, description, and venue style/u);
    assert.match(editorSource, /If the setting does not match, this plate stays/u);
    assert.match(editorSource, /function mansionOverheadBoardTransformV1/u);
    assert.match(editorSource, /MANSION_MAP_BOARD_V1/u);
    assert.match(editorSource, /left: overheadBoardTransform\.x\(MANSION_OVERHEAD_FRAME_V1\.left\)/u);
    assert.match(editorSource, /width: overheadBoardTransform\.width\(MANSION_OVERHEAD_FRAME_V1\.columns\)/u);
    assert.match(overheadEditorSource, /current Library identity/u);
    assert.match(overheadEditorSource, /a rejected one leaves this picture unchanged/u);
    assert.match(overheadEditorSource, /current picture stays unless the new one passes its setting check/u);
  });

  it("opens the existing editor from new venue creation and validates its map under a blocker", () => {
    assert.match(debateSource, /data-tutorial-target="whodunnit-create-mansion-editor"/u);
    assert.match(debateSource, /Start Blank/u);
    assert.match(debateSource, /\/api\/debates\/mystery-mansions/u);
    assert.match(debateSource, /<MansionEditorDialog[\s\S]{0,260}creationFlow/u);
    assert.match(editorSource, /Semantic room palette/u);
    assert.match(editorSource, /DEBATE_MYSTERY_ROOM_TEMPLATES\.map/u);
    assert.match(editorSource, /Floor 1 only/u);
    assert.match(editorSource, /Top floor only/u);
    assert.match(editorSource, /mansionEditorInspector[\s\S]{0,420}mansionEditorRoomPalette/u);
    assert.match(editorSource, /Remove \{selectedRoom \? "room" : blockLabel\(selectedEntity\)\.toLowerCase\(\)\}/u);
    assert.match(editorSource, /disabled=\{!selectedEntityCanBeRemoved\}/u);
    assert.match(editorSource, /Continue to prepare Mosaic rooms before entering them/u);
    assert.match(editorSource, /title="Validating the venue plan"/u);
    assert.match(editorSource, /stepLabel="Preparing the venue map"/u);
    assert.match(editorSource, /CREATION_VALIDATION_MINIMUM_LOADER_MS = 900/u);
    assert.match(editorSource, /window\.setTimeout\(resolve, remainingLoaderTime\)/u);
    assert.match(editorSource, /Venue plan is ready\. Review the map/u);
    assert.match(editorSource, /mansionRoomEditorNotice.*role="status"/u);
  });

  it("renders accepted venue architecture without leaking the legacy estate planner", () => {
    assert.match(editorSource, /const venueArchitectureLocked = venueProfile !== null/u);
    assert.match(editorSource, /Array\.from\(\{ length: venueProfile\.tierLabels\.length \}/u);
    assert.match(editorSource, /venueProfile\?\.kind === "vessel" \? "decks"/u);
    assert.match(editorSource, /venueProfile\?\.physicalScaleClass \?\?/u);
    assert.match(editorSource, /data-map-style=\{venueMapStyle\}/u);
    assert.match(editorSource, /venueMapStyle === "hull-deck-v1"/u);
    assert.match(editorSource, /mansionEditorHullOutline/u);
    assert.match(editorSource, /Venue room program/u);
    assert.match(editorSource, /Validated architecture · names and presentation remain editable/u);
    assert.match(editorSource, /disabled=\{venueArchitectureLocked\}/u);
    assert.match(editorSource, /Its accepted architecture remains fixed/u);
    assert.match(mysteryCss, /mansionEditorCanvas\[data-map-style="hull-deck-v1"\]/u);
    assert.match(mysteryCss, /mansionEditorHullOutline \{[^}]*pointer-events: none;/u);
  });

  it("renders deterministic overlays and freezes them for Reduced Motion", () => {
    assert.match(mysteryCss, /mansionRoomEditorStage\[data-placement-active\] \{ cursor: crosshair;/u);
    assert.match(mysteryCss, /mansionRoomOverlay \{[^}]*pointer-events: none;/u);
    assert.match(mysteryCss, /mansionRoomAnchorMarker \{[^}]*pointer-events: auto;/u);
    assert.match(mysteryCss, /mansionLightResizeHandle \{[^}]*pointer-events: auto;/u);
    assert.match(mysteryCss, /mix-blend-mode: overlay/u);
    assert.match(mysteryCss, /mansionDynamicLightFireSteady/u);
    assert.match(mysteryCss, /mansionDynamicLightOmni/u);
    assert.match(mysteryCss, /mansionDynamicLightDirectional/u);
    assert.match(mysteryCss, /mansionDynamicLightNeon/u);
    assert.match(mysteryCss, /mansionDirectionalDust/u);
    assert.doesNotMatch(mysteryCss, /mansionDynamicLightBulb/u);
    assert.match(mysteryCss, /\.mansionDynamicLight\[data-light-kind\] \{ animation-delay: var\(--mansion-light-delay\); \}/u);
    for (const name of ["Fire", "FireSteady", "Omni", "Directional", "Neon"]) {
      const keyframes = mysteryCss.split(`@keyframes mansionDynamicLight${name} {`)[1]?.split("\n")[0];
      assert.ok(keyframes, `${name} retains an intensity animation`);
      assert.doesNotMatch(keyframes, /transform:/u, `${name} must not move the source`);
    }
    assert.match(mysteryCss, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/u);
  });
});
