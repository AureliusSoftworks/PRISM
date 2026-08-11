import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const componentSource = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);
const firstRunSource = readFileSync(
  new URL("./firstRunOnboarding.ts", import.meta.url),
  "utf8",
);

describe("Home Base radial launcher integration", () => {
  it("is scoped to the docked Home orb and preserves ordinary orb behavior", () => {
    assert.match(
      componentSource,
      /chatHomeOrbDocked \? beginHomeBaseRadialPointer : beginDrag/u,
    );
    assert.match(
      componentSource,
      /chatHomeOrbDocked \? moveHomeBaseRadialPointer : moveDrag/u,
    );
    assert.match(
      componentSource,
      /released\.effect === "activate-source"[\s\S]*activateChatHomeHero\(\)/u,
    );
    assert.match(
      componentSource,
      /released\.effect === "activate-source"[\s\S]*homeBaseRadialSuppressClickRef\.current = true/u,
    );
    assert.match(
      pageSource,
      /starterPrompt: true[\s\S]*queuedConversationId: opened\.conversationId[\s\S]*conversationDetailOverride: freshConversation/u,
    );
    assert.match(
      pageSource,
      /chatHomeHeroDocked=\{[\s\S]*prismHomeEmptyHeroVisible[\s\S]*panel === null/u,
    );
  });

  it("derives targets, glyphs, and navigation from existing applet sources", () => {
    assert.match(
      pageSource,
      /homeBaseAppletTargets=\{prismTopLevelSwitcherApplets\(\)/u,
    );
    assert.match(pageSource, /function PrismAppletGlyph/u);
    assert.match(
      pageSource,
      /onHomeBaseAppletSelect=\{\(appletId\) =>[\s\S]*switchToSelectableApplet/u,
    );
    assert.match(
      pageSource,
      /onSelect: \(\) => switchToSelectableApplet\(applet\.id\)/u,
    );
  });

  it("pins safe cancellation, focus, keyboard, and dialog semantics", () => {
    assert.match(componentSource, /onPointerCancel=\{/u);
    assert.match(componentSource, /onLostPointerCapture=\{/u);
    assert.match(componentSource, /event\.key !== "Escape"/u);
    assert.match(componentSource, /role="dialog"/u);
    assert.match(componentSource, /aria-modal="true"/u);
    assert.match(componentSource, /aria-haspopup=\{chatHomeOrbDocked \? "dialog"/u);
    assert.match(componentSource, /nextHomeBaseRadialTargetIndex/u);
    assert.match(componentSource, /avatarRef\.current\?\.focus\(\)/u);
  });

  it("pins theme-aware glass, dimming, taper evidence, and reduced motion", () => {
    assert.match(pageSource, /<PrismCompanion[\s\S]*theme=\{resolvedTheme\}/u);
    assert.match(
      componentSource,
      /className=\{styles\.homeBaseRadialBackdrop\}[\s\S]*data-theme=\{theme\}/u,
    );
    assert.match(
      componentSource,
      /className=\{styles\.homeBaseRadialField\}[\s\S]*data-theme=\{theme\}/u,
    );
    assert.match(cssSource, /\.homeBaseRadialBackdrop[\s\S]*backdrop-filter: blur/u);
    assert.match(cssSource, /\.homeBaseRadialTargetGlass/u);
    assert.match(cssSource, /data-theme="light"[\s\S]*homeBaseRadialBackdrop/u);
    assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/u);
    assert.match(
      componentSource,
      /data-source-width[\s\S]*data-target-width/u,
    );
    assert.match(
      componentSource,
      /homeBaseRadialHighlightedPosition[\s\S]*HOME_BASE_RADIAL_TARGET_RADIUS_PX/u,
    );
    assert.match(
      cssSource,
      /\.homeBaseRadialRay\s*\{[\s\S]*z-index:\s*0[\s\S]*\.homeBaseRadialTarget\s*\{[\s\S]*z-index:\s*1/u,
    );
  });

  it("scales the launcher orbs, glyphs, and labels for a larger visible lower arc", () => {
    assert.match(
      cssSource,
      /\.homeBaseRadialTarget\s*\{[\s\S]*width:\s*182px[\s\S]*min-height:\s*198px/u,
    );
    assert.match(
      cssSource,
      /\.homeBaseRadialTargetGlass\s*\{[\s\S]*width:\s*152px[\s\S]*height:\s*152px/u,
    );
    assert.match(
      cssSource,
      /\.homeBaseRadialTargetGlyph\s*>\s*svg\s*\{[\s\S]*width:\s*70px[\s\S]*height:\s*70px/u,
    );
    assert.match(
      cssSource,
      /\.homeBaseRadialTargetLabel\s*\{[\s\S]*font-size:\s*15px/u,
    );
    assert.match(
      cssSource,
      /\.homeBaseRadialTargetLabel\s*\{[\s\S]*max-width:\s*182px/u,
    );
  });

  it("keeps the established tutorial hook and avoids adding a first-run gate", () => {
    assert.match(
      componentSource,
      /data-tutorial-target="prism-companion"/u,
    );
    assert.doesNotMatch(firstRunSource, /radial|hold for applets/iu);
  });
});
