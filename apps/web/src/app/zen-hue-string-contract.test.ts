import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const control = readFileSync(
  new URL("./ZenHueStringControl.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Zen hue string integration contract", () => {
  it("keeps the custom string desktop-Zen-only and preserves the shared lens fallback", () => {
    assert.match(
      page,
      /const zenHueStringEligible =\s*view === "chat"[\s\S]*?viewportWidth > PICKER_MOBILE_BREAKPOINT[\s\S]*?!coarsePointer/u,
    );
    assert.match(
      page,
      /if \(!zenHueStringVisible\) \{[\s\S]*?<HueLensControl/u,
    );
    assert.match(page, /<ZenHueCableControl/u);
  });

  it("suspends hue directories for whole-group search and restores state per group", () => {
    assert.match(
      page,
      /const zenDirectorySuspended = zenHueStringEligible && emptyStateSearchActive/u,
    );
    assert.match(page, /zenHueDirectoryByGroupRef/u);
    assert.match(
      page,
      /zenHueDirectoryByGroupRef\.current\.get\(nextFilterId\)/u,
    );
    assert.match(page, /ZEN_HUE_STRING_CUE_DISMISSED_SESSION_KEY/u);
    assert.match(
      page,
      /sessionStorage\.removeItem\([\s\S]*?ZEN_HUE_STRING_CUE_DISMISSED_SESSION_KEY/u,
    );
  });

  it("keeps physical-only cable recoil while traversal stays direct", () => {
    assert.match(control, /aria-label="Hue"/u);
    assert.match(control, /aria-label="Breadth"/u);
    assert.match(control, /event\.key === "Home"/u);
    assert.match(control, /event\.key === "End"/u);
    assert.match(control, /event\.key === "Escape"/u);
    assert.match(control, /\+ delta \+ 360\) % 360/u);
    assert.match(control, /latestNavigateRef\.current\(update\)/u);
    assert.match(control, /const setLiveCablePull/u);
    assert.match(control, /setCableCurveOffset\(0\)/u);
    assert.match(control, /startRecoil/u);
    assert.match(control, /stepZenHueCableSpring/u);
    assert.match(control, /requestAnimationFrame\(tick\)/u);
    assert.doesNotMatch(page, /useZenHuePickerMotion\(/u);
  });

  it("keeps the visible breadth readout numeric at the rainbow root", () => {
    assert.match(page, /rootRows=\{zenHueDirectoryLayoutState\.rootRows\}/u);
    assert.match(
      control,
      /const visibleRows = tier === "root" \? rootRows : tier/u,
    );
    assert.match(
      control,
      /\{visibleBotCount\}\/\{totalBotCount\} · \{breadthLabel\}/u,
    );
    assert.doesNotMatch(
      control,
      /hueSliderValue === null \? "Full rainbow" : `\$\{visibleBotCount\}/u,
    );
    assert.match(control, /`Full rainbow, \$\{totalBotCount\} bots`/u);
  });

  it("requires a deliberate horizontal pull to enter hue and resists breadth traversal", () => {
    const downBody = control.slice(
      control.indexOf("const handlePointerDown"),
      control.indexOf("const handlePointerMove"),
    );
    assert.doesNotMatch(
      downBody.slice(0, downBody.indexOf("const traverse")),
      /scheduleNavigation\(/u,
    );
    assert.match(control, /HUE_CYCLE_PULL_THRESHOLD_PX = 16/u);
    assert.match(control, /BREADTH_TRAVERSAL_DEAD_ZONE_PX = 34/u);
    assert.match(control, /const traverse = \(now: number\)/u);
    assert.match(control, /zenHueCableTraversalFrame/u);
    assert.match(control, /heldDrag\.normalizedPosition/u);
    assert.match(control, /one discrete transition\s*\/\/ per animation frame/u);
    assert.match(control, /data-tutorial-target="zen-hue-cable"/u);
  });

  it("keeps pointer-down and horizontal hue travel at the current breadth", () => {
    const downBody = control.slice(
      control.indexOf("const handlePointerDown"),
      control.indexOf("const handlePointerMove"),
    );
    assert.match(downBody, /const untouchedRoot = hueSliderValue === null;/u);
    assert.match(downBody, /const startTier = tier;/u);
    assert.doesNotMatch(downBody, /tier: tiers\[0\]/u);
    const moveBody = control.slice(
      control.indexOf("const handlePointerMove"),
      control.indexOf("const handlePointerUp"),
    );
    assert.match(moveBody, /zenHueCableAcceleratedSliderStep/u);
    assert.match(moveBody, /update\.sliderValue = nextSliderValue/u);
    assert.match(
      moveBody,
      /!allBotsDownwardPull && \(!drag\.untouchedRoot \|\| horizontalIntent\)/u,
    );
    assert.doesNotMatch(
      moveBody,
      /update\.tier\s*=\s*tiers|drag\.startTier\s*=\s*tiers/u,
    );
  });

  it("adds modest horizontal gain and dissipating release inertia", () => {
    assert.match(control, /zenHueCableAcceleratedSliderStep/u);
    assert.match(control, /stepZenHueCableHorizontalInertia/u);
    assert.match(control, /zenHueCableHorizontalInertiaHasSettled/u);
    assert.match(control, /startHorizontalInertia/u);
    assert.match(control, /prefers-reduced-motion: reduce/u);
    assert.match(control, /cancelHorizontalInertia/u);
  });

  it("enters a non-root tier from All Bots with a seeded hue", () => {
    assert.match(page, /const shouldSeedHueAnchor =/u);
    assert.match(
      page,
      /current\.hueAnchor === null &&[\s\S]*?update\.tier !== current\.tier[\s\S]*?update\.tier !== "root"/u,
    );
    assert.match(page, /const seedSliderValue = shouldSeedHueAnchor/u);
    assert.match(page, /HUE_LENS_SLIDER_RANGE \/ 2/u);
  });

  it("uses one animation clock for held breadth traversal", () => {
    const downBody = control.slice(
      control.indexOf("const handlePointerDown"),
      control.indexOf("const handlePointerMove"),
    );
    assert.match(downBody, /let previousFrameTime = performance\.now\(\)/u);
    assert.match(
      downBody,
      /zenHueCableFrameElapsedSeconds\([\s\S]*?now,[\s\S]*?previousFrameTime/u,
    );
    assert.doesNotMatch(downBody, /let previousFrameTime = event\.timeStamp/u);
    assert.doesNotMatch(
      downBody,
      /Math\.min\(0\.05, now - previousFrameTime\)/u,
    );
  });

  it("whitens blocked overpull at both cable boundaries", () => {
    assert.match(control, /const allBotsDownwardPull =\s*drag\.untouchedRoot && drag\.startTier === "root"/u);
    assert.match(control, /!allBotsDownwardPull/u);
    assert.match(control, /zenHueCableBoundaryWhiteoutProgress\(\{/u);
    assert.match(control, /tier,[\s\S]*tiers,[\s\S]*deltaY: pullDeltaY/u);
    assert.match(control, /whiteCablePullProgress/u);
    assert.match(control, /className=\{styles\.whiteout\}/u);
    const cableStyles = readFileSync(
      new URL("./ZenHueStringControl.module.css", import.meta.url),
      "utf8",
    );
    assert.match(cableStyles, /\.whiteout\s*\{[\s\S]*?stroke: #ffffff/u);
    assert.match(
      cableStyles,
      /:global\(\.themeLight\) \.whiteout\s*\{[\s\S]*?stroke: #000000/u,
    );
  });

  it("uses pure traversal math for direction latch and pull-speed scaling", () => {
    assert.match(control, /zenHueCableTraversalFrame/u);
    assert.match(control, /currentDirection: heldDrag\.direction/u);
    assert.match(control, /frame\.direction/u);
    assert.match(control, /BREADTH_TRAVERSAL_DIRECTION_LATCH_PX/u);
    assert.match(control, /ZenHueCableDragDirection/u);
    assert.match(control, /directionLatchPx: BREADTH_TRAVERSAL_DIRECTION_LATCH_PX/u);
    const navigation = readFileSync(
      new URL("./zenHueStringNavigation.ts", import.meta.url),
      "utf8",
    );
    assert.match(navigation, /zenHueCableTraversalStep/u);
    assert.match(navigation, /type ZenHueCableDragDirection/u);
    assert.match(navigation, /pullScalePx/u);
    assert.match(navigation, /normalizedPull/u);
    assert.match(navigation, /pullBoost/u);
  });

  it("makes the held Hue Cable handle larger and hides the system cursor", () => {
    const cableStyles = readFileSync(
      new URL("./ZenHueStringControl.module.css", import.meta.url),
      "utf8",
    );
    assert.match(cableStyles, /\.root\[data-dragging="true"\] \.surface\s*\{[\s\S]*?cursor: none/u);
    assert.match(cableStyles, /\.root\[data-dragging="true"\] \.bead\s*\{[\s\S]*?scale\(1\.6\)/u);
    assert.match(control, /const showHandle = hueSliderValue !== null \|\| dragging/u);
  });

  it("places the dismissible instruction badge below the Hue Cable", () => {
    const cableStyles = readFileSync(
      new URL("./ZenHueStringControl.module.css", import.meta.url),
      "utf8",
    );
    assert.match(
      cableStyles,
      /\.cue\s*\{[\s\S]*?top:\s*calc\(50% \+ 10px\);[\s\S]*?bottom:\s*auto;/u,
    );
    assert.doesNotMatch(cableStyles, /\.cue\s*\{[\s\S]*?bottom:\s*72px;/u);
  });

  it("captures the viewport so underlying mouse targets stay inert during drag", () => {
    const cableStyles = readFileSync(
      new URL("./ZenHueStringControl.module.css", import.meta.url),
      "utf8",
    );
    assert.match(control, /import \{ createPortal \} from "react-dom"/u);
    assert.match(control, /document\.documentElement\.dataset\.zenHueCableDragging = "true"/u);
    assert.match(control, /data-zen-hue-cable-drag-shield="true"/u);
    assert.match(control, /createPortal\([\s\S]*?document\.body/u);
    assert.match(control, /ZEN_HUE_CABLE_CURSOR_LOCK_STYLE_RULE =\s*'html\[data-zen-hue-cable-dragging="true"\], html\[data-zen-hue-cable-dragging="true"\] \* \{ cursor: none !important; \}'/u);
    assert.match(
      control,
      /createPortal\([\s\S]*?<style>\{ZEN_HUE_CABLE_CURSOR_LOCK_STYLE_RULE\}<\/style>[\s\S]*?document\.body/u,
    );
    assert.doesNotMatch(control, /document\.createElement\("style"\)|document\.head\.appendChild/u);
    assert.doesNotMatch(cableStyles, /html\s*\[data-zen-hue-cable-dragging="true"\]\s*,\s*html\s*\[data-zen-hue-cable-dragging="true"\]\s*\*\s*\{/u);
    assert.doesNotMatch(cableStyles, /^html\s*\{/mu);
    assert.match(cableStyles, /\.dragShield\s*\{[\s\S]*?position: fixed[\s\S]*?pointer-events: auto/u);
    assert.doesNotMatch(control, /requestPointerLock|exitPointerLock|movementX|movementY/u);
  });

  it("restores the desktop cursor at the rendered handle before ending the drag", () => {
    const upBody = control.slice(
      control.indexOf("const handlePointerUp"),
      control.indexOf("const activeHueValue"),
    );
    assert.match(control, /import \{ setDesktopCursorPosition \} from "\.\/desktopShell"/u);
    assert.match(upBody, /drag\.releasing = true/u);
    assert.match(upBody, /zenHueCableHandleClientPoint\(\{/u);
    assert.match(
      upBody,
      /setDesktopCursorPosition\(handlePoint\.x, handlePoint\.y\)\.finally/u,
    );
    assert.match(
      upBody,
      /if \(dragRef\.current\?\.pointerId === pointerId\)[\s\S]*settleGesture\(true\)/u,
    );
  });

  it("continues a held breadth pull when the viewport shield receives events after a rerender", () => {
    const upBody = control.slice(
      control.indexOf("const handlePointerUp"),
      control.indexOf("const activeHueValue"),
    );
    assert.match(upBody, /const surface = surfaceRef\.current/u);
    assert.match(upBody, /surface\?\.hasPointerCapture\(event\.pointerId\)/u);
    const shieldBody = control.slice(
      control.indexOf('data-zen-hue-cable-drag-shield="true"'),
      control.indexOf("</>", control.indexOf('data-zen-hue-cable-drag-shield="true"')),
    );
    assert.match(shieldBody, /onPointerMove=\{handlePointerMove\}/u);
    assert.match(shieldBody, /onPointerUp=\{handlePointerUp\}/u);
    assert.match(shieldBody, /onPointerCancel=\{\(\) => settleGesture\(false\)\}/u);
  });

  it("does not animate grid traversal", () => {
    assert.doesNotMatch(page, /function useZenHuePickerMotion/u);
    assert.doesNotMatch(page, /useZenHuePickerMotion\(/u);
  });

  it("allows the intimate one-row traversal tier", () => {
    const navigation = readFileSync(
      new URL("./zenHueStringNavigation.ts", import.meta.url),
      "utf8",
    );
    assert.match(navigation, /ZEN_HUE_DIRECTORY_MIN_ROWS = 1/u);
    assert.match(navigation, /ZEN_HUE_DIRECTORY_ONE_ROW_COLUMNS = 10/u);
    assert.match(
      navigation,
      /safeRows === ZEN_HUE_DIRECTORY_MIN_ROWS[\s\S]*?ZEN_HUE_DIRECTORY_ONE_ROW_COLUMNS/u,
    );
  });

  it("forces the one-row Zen directory to remain large named cards", () => {
    assert.match(page, /forceNamedCards: zenHueDirectoryTier === ZEN_HUE_DIRECTORY_MIN_ROWS/u);
    assert.match(page, /const \{ width: pickerWidth, height: basePickerHeight \} = forceNamedCards\s*\? baseFrame/u);
    assert.match(page, /const baseMaxTileSize = forceNamedCards\s*\? PICKER_MAX_TILE_SIZE/u);
    assert.match(page, /const contentAlignedPickerHeight = forceNamedCards\s*\? pickerHeight/u);
    assert.match(page, /forceNamedCards \|\|[\s\S]*?PICKER_TILE_NAME_MIN_SIZE/u);
    assert.match(page, /flattenTile: !forceNamedCards/u);
    assert.match(page, /crosshairCursor: !forceNamedCards/u);
    assert.match(page, /dotCursor: !forceNamedCards/u);
  });

  it("blends the stable group gradient over the active hue atmosphere by semantic depth", () => {
    assert.match(
      page,
      /zenHueDirectoryState\.tier === "root" \? "home" : "directory"/u,
    );
    assert.match(
      page,
      /homeDirectoryGradientSourceColors[\s\S]*pickerSourceBots\.flatMap/u,
    );
    assert.match(
      page,
      /homeDirectoryHueSourceColors[\s\S]*?zenHueDirectoryTier !== null[\s\S]*?\? filteredBots[\s\S]*?: pickerSourceBots/u,
    );
    assert.match(
      page,
      /gradient: buildVars\(homeDirectoryGradientSourceColors\)[\s\S]*?hue: buildVars\(homeDirectoryHueSourceColors\)/u,
    );
    assert.match(
      page,
      /!emptyStateSearchActive[\s\S]*?zenHueGradientOverlayOpacity\([\s\S]*?zenHueDirectoryState\.tier[\s\S]*?zenHueDirectoryLayoutState\.tiers[\s\S]*?: 1/u,
    );
    assert.match(page, /--home-gradient-overlay-opacity/u);
    assert.match(page, /data-home-directory-atmosphere-layer="hue"/u);
    assert.match(page, /data-home-directory-atmosphere-layer="gradient"/u);
    assert.doesNotMatch(page, /rootColors: PRISM_WORDMARK_PALETTE/u);
    assert.match(page, /--home-palette-coherence/u);
    assert.match(page, /--home-palette-saturation/u);
    assert.match(page, /rootNodePositions = \[10, 34, 52, 72, 92\]/u);
    assert.match(
      styles,
      /\.homeDirectoryAtmospherePainter\s*\{/u,
    );
    assert.match(styles, /var\(--home-halo-1-color, #ff4d6d\)/u);
    assert.match(styles, /var\(--home-halo-5-color, #7b5cff\)/u);
    assert.match(styles, /--home-room-base: #050608/u);
    assert.match(styles, /@property --home-palette-coherence/u);
    assert.match(styles, /@property --home-palette-saturation/u);
    assert.match(
      styles,
      /filter: saturate\(var\(--home-palette-saturation, 1\)\)/u,
    );
    assert.match(
      styles,
      /\.homeDirectoryAtmospherePainter\[data-home-directory-atmosphere-layer="gradient"\][\s\S]*?opacity: var\(--home-gradient-overlay-opacity, 1\)/u,
    );
  });

  it("isolates the Home and directory paint from the shell accent cascade", () => {
    assert.match(
      page,
      /function renderHomeDirectoryAtmospherePainter\(\): React\.JSX\.Element \| null \{[\s\S]*?data-home-directory-atmosphere-layer="hue"[\s\S]*?style=\{homeDirectoryAtmosphereStyles\.hue\}[\s\S]*?data-home-directory-atmosphere-layer="gradient"[\s\S]*?style=\{homeDirectoryAtmosphereStyles\.gradient\}/u,
    );
    const framePainterMounts = page.match(
      /className=\{styles\.messagesFrame\}[\s\S]{0,650}?onContextMenu=\{handleMessagesFrameContextMenu\}\s*>\s*\{renderHomeDirectoryAtmospherePainter\(\)\}/gu,
    );
    assert.equal(framePainterMounts?.length, 2);
    assert.match(
      page,
      /\{renderHomeDirectoryAtmospherePainter\(\)\}[\s\S]{0,180}?\{hubAtmosphereMounted/u,
    );
    assert.match(
      styles,
      /\.homeDirectoryAtmospherePainter\s*\{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?z-index: 0;[\s\S]*?background:/u,
    );
    assert.match(
      styles,
      /\.homeDirectoryAtmospherePainter\[data-home-directory-atmosphere-layer="hue"\]::after\s*\{[\s\S]*?content: "";[\s\S]*?position: absolute;[\s\S]*?inset: 0;/u,
    );
    assert.doesNotMatch(
      styles,
      /\.homeDirectoryAtmospherePainter\[data-home-directory-atmosphere-layer="gradient"\]::after/u,
      "the stable gradient pane must not duplicate the moving Hue Cable bloom",
    );
    assert.match(
      styles,
      /\.appLayout\[data-chat-sidebar-hidden="true"\]\[data-accent-active="true"\]:not\([\s\S]*?\)\s*\.messagesFrame\s*\{[\s\S]*?background:/u,
    );
    assert.doesNotMatch(
      styles,
      /\.messagesFrame\[data-mode="(?:home|directory)"\]/u,
    );
    assert.doesNotMatch(
      styles,
      /data-accent-active[^\{]*\.homeDirectoryAtmospherePainter/u,
    );
    assert.match(
      styles,
      /\.themeLight \.homeDirectoryAtmospherePainter\s*\{[\s\S]*?background:/u,
    );
  });

  it("keeps dormant atmosphere layers typed so they can respawn", () => {
    assert.match(page, /--home-halo-\$\{i \+ 1\}-presence/u);
    assert.match(page, /dormantNodeColor/u);
    assert.doesNotMatch(
      page,
      /vars\[`--home-halo-\$\{i \+ 1\}-color`\] = "transparent"/u,
    );
    assert.match(styles, /@property --home-halo-5-presence/u);
    assert.match(styles, /@property --home-halo-5-color/u);
    assert.match(
      styles,
      /--home-halo-5-visible-color:[\s\S]*?var\(--home-halo-5-presence, 100%\)/u,
    );
    assert.match(page, /--home-halo-\$\{i \+ 1\}-presence`\] = "100%"/u);
    assert.match(page, /--home-halo-\$\{i \+ 1\}-presence`\] = "0%"/u);
    assert.doesNotMatch(
      styles,
      /var\(--home-halo-[1-5]-presence[^\)]*\)\s*\*/u,
    );
    assert.match(
      styles,
      /--home-halo-5-presence 220ms ease-out/u,
    );
    assert.match(styles, /--home-halo-5-color 320ms ease-out/u);
  });

  it("keeps the Hue lens's discrete PRISM bars on the pulling string", () => {
    assert.match(control, /discrete PRISM bars, never a blended/u);
    assert.match(control, /colors\.flatMap\(/u);
    assert.match(control, /const start = \(index \/ colors\.length\) \* 100/u);
    assert.match(control, /const end = \(\(index \+ 1\) \/ colors\.length\) \* 100/u);
    assert.match(control, /gradientUnits="userSpaceOnUse"/u);
    assert.match(control, /style=\{\{ stroke: `url\(#\$\{gradientId\}\)` \}\}/u);
  });
});
