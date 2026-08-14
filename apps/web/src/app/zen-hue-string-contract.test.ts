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
    assert.match(downBody, /scheduleNavigation\(update\)/u);
    assert.match(control, /HUE_CYCLE_PULL_THRESHOLD_PX = 16/u);
    assert.match(control, /BREADTH_TRAVERSAL_DEAD_ZONE_PX = 34/u);
    assert.match(control, /const traverse = \(now: number\)/u);
    assert.match(control, /zenHueCableTraversalFrame/u);
    assert.match(control, /heldDrag\.normalizedPosition/u);
    assert.match(control, /one discrete transition\s*\/\/ per animation frame/u);
    assert.match(control, /data-tutorial-target="zen-hue-cable"/u);
  });

  it("preloads untouched-root pull with seeded hue and first tier so immediate drag can move", () => {
    const downBody = control.slice(
      control.indexOf("const handlePointerDown"),
      control.indexOf("const handlePointerMove"),
    );
    assert.match(downBody, /const untouchedRoot = hueSliderValue === null;/u);
    assert.match(
      downBody,
      /const startTier = untouchedRoot && tiers\.length > 0 \? tiers\[0\] : tier;/u,
    );
    assert.match(
      downBody,
      /if \(untouchedRoot && tiers\.length > 0\) \{[\s\S]*?sliderValue: sliderForClientX\(event\.clientX\)[\s\S]*?tier: tiers\[0\][\s\S]*?\}/u,
    );
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

  it("enters the deepest hue directory from All Bots on a deliberate lateral pull", () => {
    const moveBody = control.slice(
      control.indexOf("const handlePointerMove"),
      control.indexOf("const handlePointerUp"),
    );
    assert.match(moveBody, /A deliberate sideways pull from All Bots/u);
    assert.match(
      moveBody,
      /if \(!allBotsDownwardPull && tier === "root" && horizontalIntent && tiers\.length > 0\)/u,
    );
    assert.match(moveBody, /update\.tier = tiers\[0\]/u);
    assert.match(
      moveBody,
      /if \(update\.sliderValue !== undefined \|\| update\.tier !== undefined\)/u,
    );
  });

  it("uses one animation clock for held breadth traversal", () => {
    const downBody = control.slice(
      control.indexOf("const handlePointerDown"),
      control.indexOf("const handlePointerMove"),
    );
    assert.match(downBody, /let previousFrameTime = performance\.now\(\)/u);
    assert.match(downBody, /now - previousFrameTime/u);
    assert.doesNotMatch(downBody, /let previousFrameTime = event\.timeStamp/u);
  });

  it("whitens and locks the cable's hue rail during an all-bots downward pull", () => {
    assert.match(control, /const allBotsDownwardPull =\s*drag\.untouchedRoot && drag\.startTier === "root"/u);
    assert.match(control, /!allBotsDownwardPull/u);
    assert.match(control, /whiteCablePullProgress/u);
    assert.match(control, /className=\{styles\.whiteout\}/u);
    const cableStyles = readFileSync(
      new URL("./ZenHueStringControl.module.css", import.meta.url),
      "utf8",
    );
    assert.match(cableStyles, /\.whiteout\s*\{[\s\S]*?stroke: #ffffff/u);
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
  });

  it("forces the one-row Zen directory to remain large named cards", () => {
    assert.match(page, /forceNamedCards: zenHueDirectoryTier === ZEN_HUE_DIRECTORY_MIN_ROWS/u);
    assert.match(page, /forceNamedCards \|\|[\s\S]*?PICKER_TILE_NAME_MIN_SIZE/u);
    assert.match(page, /flattenTile: !forceNamedCards/u);
    assert.match(page, /crosshairCursor: !forceNamedCards/u);
    assert.match(page, /dotCursor: !forceNamedCards/u);
  });

  it("uses the committed directory for a contextual atmosphere and restores root", () => {
    assert.match(page, /const zenHueAtmosphereBots = useMemo/u);
    assert.match(
      page,
      /Search suspends the string, then restores this[\s\S]*?exact palette/u,
    );
    assert.match(
      page,
      /zenHueDirectoryState\.tier === "root" \? "home" : "directory"/u,
    );
    assert.match(page, /rootNodePositions = \[10, 34, 52, 72, 92\]/u);
    assert.match(
      styles,
      /\.messagesFrame\[data-mode="home"\],[\s\S]*?\.messagesFrame\[data-mode="directory"\]/u,
    );
    assert.match(styles, /var\(--home-halo-1-color, #ff4d6d\)/u);
    assert.match(styles, /var\(--home-halo-5-color, #7b5cff\)/u);
  });

  it("keeps dormant atmosphere layers typed so they can respawn", () => {
    assert.match(page, /--home-halo-\$\{i \+ 1\}-presence/u);
    assert.match(page, /dormantNodeColor/u);
    assert.doesNotMatch(
      page,
      /vars\[`--home-halo-\$\{i \+ 1\}-color`\] = "transparent"/u,
    );
    assert.match(styles, /@property --home-halo-5-presence/u);
    assert.match(
      styles,
      /--home-halo-5-visible-color:[\s\S]*?var\(--home-halo-5-presence, 1\)/u,
    );
    assert.match(
      styles,
      /--home-halo-5-presence 220ms ease-out/u,
    );
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
