import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "page.module.css");
const coffeeSeatPlateEmojiPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "CoffeeSeatPlateEmoji.tsx"
);
const pagePath = join(dirname(fileURLToPath(import.meta.url)), "page.tsx");
const css = readFileSync(cssPath, "utf8");
const coffeeSeatPlateEmojiSource = readFileSync(coffeeSeatPlateEmojiPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8");

function ruleForSeatVector(
  kind: "arrival" | "finished",
  seatCount: number,
  layoutSeat: number
): string {
  const phaseNeedle = kind === "arrival" ? 'data-phase="arriving"' : 'data-phase="finished"';
  const stateNeedle = 'data-arrival-state="walking-in"';
  const countNeedle = `data-seat-count="${seatCount}"`;
  const layoutNeedle = `data-layout-seat="${layoutSeat}"`;
  const variableNeedle = kind === "arrival" ? "--coffee-walk-in-x" : "--coffee-walk-away-x";
  const matches = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const match = matches
    .filter((entry) => {
      if (!(entry[2] ?? "").includes(variableNeedle)) return false;
      const selectors = (entry[1] ?? "").split(",").map((selector) => selector.trim());
      return selectors.some((selector) => {
        if (!selector.includes(".coffeeSeat")) return false;
        if (!selector.includes(phaseNeedle)) return false;
        if (kind === "arrival" && !selector.includes(stateNeedle)) return false;
        return selector.includes(countNeedle) && selector.includes(layoutNeedle);
      });
    })
    .at(-1);
  assert.ok(match, `Missing ${kind} vector for ${seatCount}:${layoutSeat}`);
  return match[2]!;
}

function assertWalkVector(
  seatCount: number,
  layoutSeat: number,
  expectedX: string,
  expectedY: string
): void {
  const rule = ruleForSeatVector("arrival", seatCount, layoutSeat);
  assert.match(rule, new RegExp(`--coffee-walk-in-x:\\s*${expectedX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
  assert.match(rule, new RegExp(`--coffee-walk-in-y:\\s*${expectedY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
}

function assertLeaveVector(
  seatCount: number,
  layoutSeat: number,
  expectedX: string,
  expectedY: string
): void {
  const rule = ruleForSeatVector("finished", seatCount, layoutSeat);
  assert.match(rule, new RegExp(`--coffee-walk-away-x:\\s*${expectedX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
  assert.match(rule, new RegExp(`--coffee-walk-away-y:\\s*${expectedY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*;`));
}

function ruleForSelectorNeedles(...needles: string[]): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .find((entry) => needles.every((needle) => (entry[1] ?? "").includes(needle)));
  assert.ok(match, `Missing CSS rule containing ${needles.join(", ")}`);
  return match[2]!;
}

function ruleForExactSelector(selector: string): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((entry) =>
    (entry[1] ?? "")
      .split(",")
      .map((candidate) => candidate.trim())
      .includes(selector)
  );
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[2]!;
}

function rulesForExactSelector(selector: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((entry) =>
      (entry[1] ?? "")
        .split(",")
        .map((candidate) => candidate.trim())
        .includes(selector)
    )
    .map((entry) => entry[2] ?? "");
}

function assertNoAnimatedTransition(selector: string): void {
  const rules = rulesForExactSelector(selector);
  assert.ok(rules.length > 0, `Missing CSS rule for ${selector}`);
  for (const rule of rules) {
    for (const match of rule.matchAll(/transition:\s*([^;]+);/g)) {
      assert.equal(match[1]?.trim(), "none");
    }
  }
}

describe("Coffee seat arrival CSS", () => {
  it("uses visual layout slots for walk-in vectors so bots enter from their side", () => {
    const genericSeatRuleIndex = css.indexOf(
      '.coffeeStage[data-phase="arriving"] .coffeeSeat[data-arrival-state="walking-in"][data-seat="4"]'
    );
    const layoutSeatRuleIndex = css.indexOf(
      '.coffeeStage[data-phase="arriving"] .coffeeSeat[data-arrival-state="walking-in"][data-seat-count="4"][data-layout-seat="0"]'
    );

    assert.notEqual(genericSeatRuleIndex, -1);
    assert.ok(layoutSeatRuleIndex > genericSeatRuleIndex);

    assertWalkVector(2, 0, "-72vw", "0px");
    assertWalkVector(2, 1, "72vw", "0px");
    assertWalkVector(3, 0, "0px", "-72vh");
    assertWalkVector(3, 1, "-72vw", "0px");
    assertWalkVector(3, 2, "72vw", "0px");
    assertWalkVector(4, 0, "-72vw", "0px");
    assertWalkVector(4, 1, "72vw", "0px");
    assertWalkVector(4, 2, "72vw", "0px");
    assertWalkVector(4, 3, "-72vw", "0px");
    assertWalkVector(5, 0, "0px", "-72vh");
    assertWalkVector(5, 1, "-72vw", "0px");
    assertWalkVector(5, 2, "72vw", "0px");
    assertWalkVector(5, 3, "-72vw", "0px");
    assertWalkVector(5, 4, "72vw", "0px");
  });

  it("uses per-bot motion variables for walk speed and settled offsets", () => {
    const seatRule = ruleForExactSelector(".coffeeSeat");
    assert.match(seatRule, /--coffee-arrival-walk-duration:\s*3200ms\s*;/);
    assert.match(seatRule, /--coffee-seat-offset-x:\s*0px\s*;/);
    assert.match(seatRule, /--coffee-seat-offset-y:\s*0px\s*;/);
    assert.match(
      seatRule,
      /transform:\s*translate\([\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-x\)\),[\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-y\)\)[\s\S]*\)/
    );

    const actionAnchorRule = ruleForExactSelector(".coffeeSeatActionAnchor");
    assert.match(actionAnchorRule, /--coffee-seat-offset-x:\s*0px\s*;/);
    assert.match(actionAnchorRule, /--coffee-seat-offset-y:\s*0px\s*;/);
    assert.match(
      actionAnchorRule,
      /transform:\s*translate\([\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-x\)\),[\s\S]*calc\(-50%\s*\+\s*var\(--coffee-seat-offset-y\)\)[\s\S]*\)/
    );

    const walkingRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"] .coffeeSeat[data-arrival-state="walking-in"]'
    );
    assert.match(walkingRule, /var\(--coffee-arrival-walk-duration,\s*3200ms\)/);
    assert.match(
      walkingRule,
      /var\(--coffee-arrival-walk-easing,\s*cubic-bezier\(0\.16,\s*0\.84,\s*0\.26,\s*1\)\)/
    );
  });

  it("uses the same visual side mapping for finished-session departures", () => {
    assertLeaveVector(2, 0, "-72vw", "0px");
    assertLeaveVector(2, 1, "72vw", "0px");
    assertLeaveVector(3, 0, "0px", "-72vh");
    assertLeaveVector(3, 1, "-72vw", "0px");
    assertLeaveVector(3, 2, "72vw", "0px");
    assertLeaveVector(4, 0, "-72vw", "0px");
    assertLeaveVector(4, 1, "72vw", "0px");
    assertLeaveVector(4, 2, "72vw", "0px");
    assertLeaveVector(4, 3, "-72vw", "0px");
    assertLeaveVector(5, 0, "0px", "-72vh");
    assertLeaveVector(5, 1, "-72vw", "0px");
    assertLeaveVector(5, 2, "72vw", "0px");
    assertLeaveVector(5, 3, "-72vw", "0px");
    assertLeaveVector(5, 4, "72vw", "0px");
  });

  it("pins sip pucker glyphs to a stable font instead of bot mouth fonts", () => {
    const formalFaceFontRuleIndex = css.indexOf(
      '.coffeeSeatPlateEmoji [data-coffee-plate-emoji-part][data-face-font="formal"]'
    );
    const sipMouthRuleIndex = css.indexOf(
      '[data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="*"]'
    );
    assert.notEqual(formalFaceFontRuleIndex, -1);
    assert.ok(sipMouthRuleIndex > formalFaceFontRuleIndex);

    const rule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji",
      'data-coffee-plate-emoji-part="mouth"',
      'data-coffee-plate-emoji-glyph="*"'
    );
    assert.match(rule, /font-family:\s*var\(--font-ui-sans\),\s*system-ui,\s*sans-serif\s*;/);
    assert.match(rule, /font-weight:\s*760\s*;/);
    assert.match(rule, /letter-spacing:\s*0\s*;/);
  });

  it("keeps shared bot face glyph changes abrupt", () => {
    assertNoAnimatedTransition(".coffeeSeatPlateEmoji");
    assertNoAnimatedTransition('.coffeeSeat[data-top-head-seat="true"] .coffeeSeatPlateEmoji');
    assertNoAnimatedTransition(".coffeeSeatPlateEmoji [data-coffee-plate-emoji-part]");
    assertNoAnimatedTransition(".messageMoodCoffeeFace [data-coffee-plate-emoji-part]");
    assertNoAnimatedTransition(".zenLiveBotPresenceFaceGlyph");
    assertNoAnimatedTransition(".zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part]");
  });

  it("resets stored blink state when speech, thinking, or question glyphs interrupt a blink", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /useEffect\(\(\) => \{\s+setBlinkState\(\{ phase: "open", key: blinkKey \}\);\s+if \(!enabled \|\| talkingPausesBlink \|\| thinkingSpinnerActive \|\| questionGlyphActive\) \{/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const displayBlinkPhase: CoffeeSeatBlinkPhase =\s+!enabled \|\| talkingPausesBlink \|\| thinkingSpinnerActive \|\| questionGlyphActive\s+\? "open"\s+: blinkPhase;/
    );
  });

  it("keeps shared bot face flips centered on the glyph grid", () => {
    const faceRule = ruleForExactSelector(".coffeeSeatPlateEmoji");
    assert.match(faceRule, /--coffee-plate-emoji-flip-anchor-x:\s*0px\s*;/);
    assert.match(faceRule, /transform-origin:\s*center center\s*;/);
    assert.doesNotMatch(faceRule, /--coffee-plate-emoji-flip-anchor-x:\s*calc/);
    assert.ok(
      coffeeSeatPlateEmojiSource.includes(
        'translateX(${thinkingSpinnerActive || questionGlyphActive ? "0px" : "var(--coffee-plate-emoji-flip-anchor-x, 0px)"})'
      )
    );
  });

  it("maps bot face inflation to weight and stroke while keeping glow constant", () => {
    assert.match(coffeeSeatPlateEmojiSource, /function normalizeFaceFontWeight/);
    assert.match(coffeeSeatPlateEmojiSource, /function faceWeightStrokeForWeight/);
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-font-weight"/);
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-weight-stroke"/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /function faceGlowRadiiForWeight/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /function faceGlowAlphaForWeight/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /--bot-face-glow-tight-radius/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /--bot-face-glow-soft-radius/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /--bot-face-glow-wide-radius/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /--bot-face-glow-tight-alpha/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /--bot-face-glow-soft-alpha/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /--bot-face-glow-wide-alpha/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /faceInflateScaleForWeight/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /--bot-face-inflate-scale/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /scale\(var\(--bot-face-inflate-scale/);

    const sharedFaceRule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji",
      ".messageMoodCoffeeFace",
      ".zenLiveBotPresenceFaceGlyph"
    );
    assert.match(
      sharedFaceRule,
      /drop-shadow\(0 0 0\.08em color-mix\(in srgb,\s*currentColor 74%,\s*transparent\)/
    );
    assert.match(
      sharedFaceRule,
      /drop-shadow\(0 0 0\.24em color-mix\(in srgb,\s*currentColor 48%,\s*transparent\)/
    );
    assert.match(
      sharedFaceRule,
      /drop-shadow\(0 0 0\.48em color-mix\(in srgb,\s*currentColor 24%,\s*transparent\)/
    );

    const liveFaceGlyphRule = ruleForExactSelector(".zenLiveBotPresenceFaceGlyph");
    assert.match(
      liveFaceGlyphRule,
      /0 0 0\.18em color-mix\(in srgb,\s*currentColor 78%,\s*transparent\)/
    );
    assert.match(
      liveFaceGlyphRule,
      /0 0 0\.42em color-mix\(in srgb,\s*currentColor 52%,\s*transparent\)/
    );
    assert.match(
      liveFaceGlyphRule,
      /0 0 0\.76em color-mix\(in srgb,\s*var\(--coffee-bot-color\) 34%,\s*transparent\)/
    );

    const customizerFaceGlyphRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-avatar-customizer-preview="true"] .zenLiveBotPresenceFaceGlyph'
    );
    assert.match(
      customizerFaceGlyphRule,
      /0 0 0\.12em color-mix\(in srgb,\s*currentColor 74%,\s*transparent\)/
    );
    assert.match(
      customizerFaceGlyphRule,
      /0 0 0\.36em color-mix\(in srgb,\s*currentColor 38%,\s*transparent\)/
    );

    const partRule = ruleForExactSelector(
      ".coffeeSeatPlateEmoji [data-coffee-plate-emoji-part]"
    );
    assert.match(
      partRule,
      /-webkit-text-stroke:\s*var\(--bot-face-weight-stroke,\s*0\) currentColor\s*;/
    );
    assert.match(partRule, /paint-order:\s*stroke fill\s*;/);

    const customFaceRule = ruleForExactSelector('.coffeeSeatPlateEmoji[data-face-custom="true"]');
    assert.match(customFaceRule, /font-weight:\s*var\(--bot-face-font-weight,\s*var\(--prism-face-weight\)\)\s*;/);
    assert.match(customFaceRule, /font-variation-settings:\s*"wght"\s*var\(--bot-face-font-weight,\s*var\(--prism-face-weight\)\)\s*;/);
  });

  it("renders live Coffee avatars at Zen scale with inward-facing layered accessories", () => {
    const coffeeSeatRule = ruleForExactSelector(".coffeeSeat");
    assert.match(coffeeSeatRule, /--coffee-seat-mood-frame-raster-opacity:\s*1\s*;/);

    const clusterRule = ruleForExactSelector(".coffeeSeatCluster");
    assert.match(clusterRule, /--zen-live-bot-avatar-size,\s*clamp\(156px,\s*14\.8vw,\s*196px\)/);

    assert.match(pageSource, /const coffeeSeatAccessoryUrl = rosterPreviewSeat/);
    assert.match(pageSource, /const coffeeSeatAccessoryPlacement = botAccessoryPlacementFromBot\(bot\);/);
    assert.match(pageSource, /data-accessory-layer=\{[\s\S]*coffeeSeatAccessoryUrl[\s\S]*\?[\s\S]*coffeeSeatAccessoryPlacement\.layer/);
    assert.match(pageSource, /className=\{styles\.coffeeSeatAccessoryLayer\}/);
    assert.match(pageSource, /data-accessory-layer=\{coffeeSeatAccessoryPlacement\.layer\}/);
    assert.match(pageSource, /className=\{styles\.coffeeSeatAccessoryRaster\}/);
    assert.doesNotMatch(pageSource, /coffeeSeatBodyRaster/);

    const accessoryLayerRule = ruleForExactSelector(".coffeeSeatAccessoryLayer");
    assert.match(accessoryLayerRule, /width:\s*100%;/);
    assert.match(accessoryLayerRule, /height:\s*100%;/);
    assert.match(accessoryLayerRule, /scaleX\(var\(--coffee-plate-emoji-face-scale-y,\s*1\)\)/);
    assert.match(accessoryLayerRule, /z-index:\s*7\s*;/);
    assert.match(accessoryLayerRule, /overflow:\s*visible\s*;/);
    assert.match(
      ruleForExactSelector('.coffeeSeatAccessoryLayer[data-accessory-layer="back"]'),
      /z-index:\s*-1\s*;/
    );

    const rasterRule = ruleForExactSelector(".coffeeSeatAccessoryRaster");
    assert.match(rasterRule, /inset:\s*var\(--bot-accessory-field-inset-pct,\s*-170%\);/);
    assert.match(rasterRule, /overflow:\s*visible\s*;/);
    assert.match(rasterRule, /background-position:\s*[\s\S]*calc\(50% \+ var\(--bot-accessory-field-x-pct,\s*0%\)\)[\s\S]*calc\(50% \+ var\(--bot-accessory-field-y-pct,\s*0%\)\)/);
    assert.match(rasterRule, /background-size:\s*var\(--bot-accessory-field-size-pct,\s*22\.727%\) auto;/);
    assert.doesNotMatch(rasterRule, /mask-image:/);
    assert.doesNotMatch(rasterRule, /clip-path:/);

    const livePlateRule = ruleForExactSelector('.coffeeSeatPlate[data-live-body-style="zen"]');
    assert.match(livePlateRule, /--bot-face-frame-glow-filter:\s*[\s\S]*drop-shadow/);
    assert.match(livePlateRule, /--bot-face-frame-inset:\s*0\s*;/);
    assert.match(livePlateRule, /--bot-face-metal-light-inset:\s*0\s*;/);
    assert.match(
      livePlateRule,
      /--bot-face-metal-light-opacity:\s*0\.58\s*;/
    );
    assert.match(livePlateRule, /--bot-face-metal-light-z:\s*5\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-glass-opacity:\s*0\.46\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-glare-opacity:\s*0\.18\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-specular-opacity:\s*0\.54\s*;/);
    assert.match(
      ruleForExactSelector(
        '.coffeeSeatPlate[data-live-body-style="zen"][data-accessory-equipped="true"][data-accessory-layer="back"]'
      ),
      /--bot-face-frame-z:\s*2\s*;/
    );

    const liveFaceRule = ruleForExactSelector(
      '.coffeeSeatPlate[data-live-body-style="zen"] .coffeeSeatPlateEmoji'
    );
    assert.match(liveFaceRule, /--zen-live-bot-avatar-face-glyph-size,\s*clamp\(1\.74rem,\s*5\.15vw,\s*2\.58rem\)/);

    const frameRule = ruleForExactSelector(".botFaceFrame");
    assert.match(frameRule, /var\(--bot-face-frame-glow-filter,\s*drop-shadow\(0 0 0 transparent\)\)/);
    assert.match(frameRule, /opacity:\s*var\(--bot-face-frame-opacity,\s*1\)\s*;/);
    assert.doesNotMatch(frameRule, /coffee-plate-emoji-face-scale-y/);

    const screenFillRule = ruleForExactSelector(".botFaceScreenFill");
    assert.match(screenFillRule, /inset:\s*var\(--bot-face-screen-inset,\s*17%\)\s*;/);
    assert.match(screenFillRule, /border-radius:\s*var\(--bot-face-screen-radius,\s*50%\)\s*;/);
    assert.match(screenFillRule, /background:\s*var\(\s*--bot-face-screen-background/);
    assert.match(screenFillRule, /var\(--zen-presence-face-bg,\s*var\(--bot-face-screen-default-bg\)\)/);
    assert.match(screenFillRule, /box-shadow:\s*var\(\s*--bot-face-screen-shadow,\s*var\(--bot-face-screen-default-shadow\)\s*\)/);
    assert.doesNotMatch(screenFillRule, /--zen-presence-face-shadow/);
    assert.match(screenFillRule, /opacity:\s*1\s*;/);
    assert.match(screenFillRule, /transform:\s*scaleX\(var\(--coffee-plate-emoji-face-scale-y,\s*1\)\)\s*;/);
    assert.match(screenFillRule, /transform-origin:\s*center center\s*;/);

    const screenGlassRule = ruleForExactSelector(".botFaceScreenGlass");
    assert.match(screenGlassRule, /inset:\s*var\(--bot-face-screen-inset,\s*17%\)\s*;/);
    assert.match(screenGlassRule, /border-radius:\s*var\(--bot-face-screen-radius,\s*50%\)\s*;/);
    assert.match(screenGlassRule, /opacity:\s*var\(--bot-face-screen-glass-opacity,\s*0\.42\)/);
    assert.match(css, /--bot-face-screen-glare-angle/);
    assert.match(css, /--bot-face-screen-glare-x/);
    assert.match(css, /--bot-face-screen-glare-y/);

    const rosterGlassRule = ruleForExactSelector(
      '.coffeeSeat[data-roster-preview="true"] .botFaceScreenGlass'
    );
    assert.match(rosterGlassRule, /--bot-face-screen-inset:\s*0\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-radius:\s*inherit\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-glass-opacity:\s*0\.18\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-glare-opacity:\s*0\.08\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-specular-opacity:\s*0\.32\s*;/);

    const moodBadgeGlassRule = ruleForExactSelector(".messageMoodBadge .botFaceScreenGlass");
    assert.match(moodBadgeGlassRule, /--bot-face-screen-glass-opacity:\s*0\.2\s*;/);
    assert.match(moodBadgeGlassRule, /--bot-face-screen-glare-opacity:\s*0\.08\s*;/);

    const lightLivePlateRule = ruleForExactSelector(
      '.themeLight.coffeeShell .coffeeSeatPlate[data-live-body-style="zen"]'
    );
    assert.match(lightLivePlateRule, /--bot-face-screen-glass-opacity:\s*0\.34\s*;/);
    assert.match(lightLivePlateRule, /--bot-face-screen-glare-opacity:\s*0\.12\s*;/);
    assert.match(lightLivePlateRule, /--bot-face-screen-specular-opacity:\s*0\.44\s*;/);

    const frameTintRule = ruleForExactSelector(".botFaceFrameTint");
    assert.match(
      frameTintRule,
      /opacity:\s*var\(--bot-face-frame-tint-opacity,\s*var\(--coffee-seat-mood-frame-raster-opacity,\s*1\)\)\s*;/
    );

    const frameLedRule = ruleForExactSelector(".botFaceFrameLed");
    assert.match(
      frameLedRule,
      /opacity:\s*var\(--bot-face-frame-led-opacity,\s*var\(--coffee-seat-mood-frame-raster-opacity,\s*1\)\)\s*;/
    );

    const metalLightRule = ruleForExactSelector(".botFaceFrameMetalLight");
    assert.match(metalLightRule, /opacity:\s*var\(--bot-face-metal-light-opacity,\s*0\)\s*;/);
    assert.match(metalLightRule, /mask-image:\s*var\(/);

    const metalLightRasterRule = ruleForExactSelector(".botFaceFrameMetalLightRaster");
    assert.match(metalLightRasterRule, /background:\s*url\("\/bot-frame\/bot-frame-metal\.png"\)\s*center\s*\/\s*contain\s*no-repeat/);

    const joyfulRule = ruleForExactSelector('.coffeeSeat[data-prism-mood="joyful"]');
    assert.match(joyfulRule, /--coffee-seat-mood-frame-raster-opacity:\s*1\s*;/);

    const guardedRule = ruleForExactSelector('.coffeeSeat[data-prism-mood="guarded"]');
    assert.match(guardedRule, /--coffee-seat-mood-frame-raster-opacity:\s*0\.72\s*;/);

    const strainedRule = ruleForExactSelector('.coffeeSeat[data-prism-mood="strained"]');
    assert.match(strainedRule, /--coffee-seat-mood-frame-raster-opacity:\s*0\.56\s*;/);

    const nearDesaturatedRule = ruleForExactSelector(
      '.coffeeSeat[data-mood-near-desaturated="true"]'
    );
    assert.match(nearDesaturatedRule, /--coffee-seat-mood-frame-raster-opacity:\s*0\.1\s*;/);
  });

  it("centers the thinking slash spinner within the bot face screen", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-thinking-frame-index=\{thinkingSpinnerFrameIndex\}/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-thinking-glyph=\{thinkingSpinnerGlyph\}/
    );

    const spinnerRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji[data-coffee-plate-thinking-spinner="true"]'
    );
    assert.match(spinnerRule, /--coffee-plate-emoji-nudge-y:\s*0px\s*;/);
    assert.match(spinnerRule, /--coffee-seat-emotion-face-scale:\s*1\s*;/);
    assert.match(spinnerRule, /grid-template-columns:\s*1em\s*;/);
    assert.match(spinnerRule, /grid-template-rows:\s*1em\s*;/);
    assert.match(spinnerRule, /place-self:\s*center\s*;/);

    const frameRule = ruleForExactSelector(
      ".coffeeSeatPlateEmoji [data-coffee-plate-thinking-frame]"
    );
    assert.match(frameRule, /position:\s*relative\s*;/);
    assert.match(frameRule, /display:\s*grid\s*;/);
    assert.match(frameRule, /place-items:\s*center\s*;/);
    assert.match(frameRule, /font-size:\s*1em\s*;/);
    assert.match(frameRule, /inline-size:\s*1em\s*;/);
    assert.match(frameRule, /block-size:\s*1em\s*;/);
    assert.match(frameRule, /line-height:\s*1\s*;/);
    assert.match(frameRule, /text-align:\s*center\s*;/);
    assert.match(frameRule, /transform:\s*none\s*;/);
  });

  it("renders question marks as a single centered face glyph", () => {
    assert.match(coffeeSeatPlateEmojiSource, /showQuestionMark\?: boolean/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const questionGlyphActive = !thinkingSpinnerActive && showQuestionMark;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-question-glyph=\{questionGlyphActive \? "true" : undefined\}/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-question-frame="true"/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-font=\{faceMouthFont \?\? faceEyesFont \?\? undefined\}/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /thinkingSpinnerActive \|\| questionGlyphActive \? 1 : glyphParts\.length/
    );

    const questionRootRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji[data-coffee-plate-question-glyph="true"]'
    );
    assert.match(questionRootRule, /grid-template-columns:\s*1em\s*;/);
    assert.match(questionRootRule, /grid-template-rows:\s*1em\s*;/);
    assert.match(questionRootRule, /place-self:\s*center\s*;/);
    assert.match(questionRootRule, /letter-spacing:\s*0\s*;/);

    const questionFrameRule = ruleForExactSelector(
      ".coffeeSeatPlateEmoji [data-coffee-plate-question-frame]"
    );
    assert.match(questionFrameRule, /display:\s*grid\s*;/);
    assert.match(questionFrameRule, /place-items:\s*center\s*;/);
    assert.match(questionFrameRule, /font-weight:\s*840\s*;/);
    assert.match(questionFrameRule, /letter-spacing:\s*0\s*;/);
    assert.match(questionFrameRule, /transform:\s*translateY\(-0\.01em\)\s*;/);

    const questionMouthFontRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji [data-coffee-plate-question-frame][data-face-font="playful"]'
    );
    assert.match(questionMouthFontRule, /font-family:\s*var\(--font-playful-display\)/);

    const liveQuestionRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph[data-coffee-plate-question-glyph="true"]'
    );
    assert.match(
      liveQuestionRule,
      /font-size:\s*var\(--zen-live-bot-avatar-question-glyph-size,\s*clamp\(2rem,\s*4\.25vw,\s*2\.58rem\)\)\s*;/
    );
  });
});
