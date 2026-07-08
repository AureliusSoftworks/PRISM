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
      '[data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="⁎"]'
    );
    assert.notEqual(formalFaceFontRuleIndex, -1);
    assert.ok(sipMouthRuleIndex > formalFaceFontRuleIndex);

    const rule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji",
      'data-coffee-plate-emoji-part="mouth"',
      'data-coffee-plate-emoji-glyph="⁎"'
    );
    assert.match(rule, /font-family:\s*var\(--font-ui-sans\),\s*system-ui,\s*sans-serif\s*;/);
    assert.match(rule, /font-weight:\s*760\s*;/);
    assert.match(rule, /letter-spacing:\s*0\s*;/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /COFFEE_SEAT_SIP_MOUTH_GLYPHS = new Set\(\["\*", "⁎"\]\)/
    );
  });

  it("keeps the Coffee cup visible while reversing the sip animation", () => {
    assert.match(
      css,
      /@keyframes coffeeCupRestDuringSip \{[\s\S]*22%,\s*94% \{[\s\S]*opacity:\s*var\(--coffee-cup-rest-sip-opacity\);[\s\S]*100% \{[\s\S]*opacity:\s*1;/
    );
    assert.match(
      css,
      /@keyframes coffeeCupSip \{[\s\S]*18%,\s*82% \{[\s\S]*opacity:\s*1;[\s\S]*translate\(var\(--coffee-cup-sip-x\), var\(--coffee-cup-sip-y\)\)[\s\S]*94% \{[\s\S]*opacity:\s*1;[\s\S]*translate\(0, 3px\)[\s\S]*100% \{[\s\S]*opacity:\s*0;[\s\S]*translate\(0, 3px\)/
    );
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

  it("maps bot face inflation to weight and stroke while talking glow follows light flicker", () => {
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
    assert.match(css, /@keyframes zenLiveBotTalkingFaceGlowFlicker/);

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

    const idleFacePartRule = ruleForSelectorNeedles(
      '.zenLiveBotPresencePlate:not([data-talking="true"]):not([data-transitioning="true"])',
      ".zenLiveBotPresenceFaceGlyph",
      "[data-coffee-plate-emoji-part]"
    );
    assert.match(idleFacePartRule, /--zen-live-bot-idle-face-glow-filter:/);
    assert.match(idleFacePartRule, /drop-shadow\(0 0 0\.07em/);
    assert.match(idleFacePartRule, /drop-shadow\(0 0 0\.22em/);
    assert.match(idleFacePartRule, /drop-shadow\(0 0 0\.42em/);
    assert.match(idleFacePartRule, /filter:\s*var\(--zen-live-bot-idle-face-glow-filter\)\s*;/);
    assert.doesNotMatch(idleFacePartRule, /zenLiveBotTalkingFaceGlowFlicker/);

    const liveIdleFacePartRule = ruleForSelectorNeedles(
      '.coffeeSeat:not([data-table-speaking="true"])',
      '.coffeeSeatPlate[data-live-body-style="zen"]',
      ".coffeeSeatPlateEmoji",
      "[data-coffee-plate-emoji-part]"
    );
    assert.match(liveIdleFacePartRule, /--zen-live-bot-idle-face-glow-filter:/);
    assert.match(liveIdleFacePartRule, /drop-shadow\(0 0 0\.07em/);
    assert.match(liveIdleFacePartRule, /drop-shadow\(0 0 0\.22em/);
    assert.match(liveIdleFacePartRule, /drop-shadow\(0 0 0\.42em/);
    assert.match(
      liveIdleFacePartRule,
      /filter:\s*var\(--zen-live-bot-idle-face-glow-filter\)\s*;/
    );
    assert.doesNotMatch(liveIdleFacePartRule, /zenLiveBotTalkingFaceGlowFlicker/);

    const talkingLiveFaceRule = ruleForSelectorNeedles(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"]):not([data-prism-persona="true"])',
      ".zenLiveBotPresenceFaceGlyph"
    );
    assert.match(talkingLiveFaceRule, /text-shadow:\s*none\s*;/);
    assert.match(talkingLiveFaceRule, /filter:\s*none\s*;/);

    const talkingFacePartRule = ruleForSelectorNeedles(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"])',
      ".zenLiveBotPresenceFaceGlyph",
      "[data-coffee-plate-emoji-part]"
    );
    assert.match(talkingFacePartRule, /--zen-live-bot-talking-face-glow-filter-high:/);
    assert.match(talkingFacePartRule, /--zen-live-bot-talking-face-glow-filter-mid:/);
    assert.match(talkingFacePartRule, /--zen-live-bot-talking-face-glow-filter-low:/);
    assert.match(talkingFacePartRule, /drop-shadow\(0 0 0\.95em/);
    assert.match(talkingFacePartRule, /drop-shadow\(0 0 0\.72em/);
    assert.match(talkingFacePartRule, /drop-shadow\(0 0 0\.52em/);
    assert.match(talkingFacePartRule, /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\)\s*;/);
    assert.match(
      talkingFacePartRule,
      /animation:\s*zenLiveBotTalkingFaceGlowFlicker 760ms ease-in-out infinite,\s*zenLiveBotTalkingLightFlicker 760ms ease-in-out infinite\s*;/
    );

    const faceGlowKeyframesStart = css.indexOf("@keyframes zenLiveBotTalkingFaceGlowFlicker");
    assert.notEqual(faceGlowKeyframesStart, -1);
    const faceGlowKeyframesEnd = css.indexOf(
      "@keyframes zenLiveBotPresenceSaturateIn",
      faceGlowKeyframesStart
    );
    assert.notEqual(faceGlowKeyframesEnd, -1);
    const faceGlowKeyframes = css.slice(faceGlowKeyframesStart, faceGlowKeyframesEnd);
    assert.match(faceGlowKeyframes, /8%,[\s\S]*24%,[\s\S]*47%,[\s\S]*71%/);
    assert.match(faceGlowKeyframes, /12%,[\s\S]*37%,[\s\S]*60%,[\s\S]*82%/);
    assert.match(faceGlowKeyframes, /15%,[\s\S]*55%,[\s\S]*87%/);
    assert.match(faceGlowKeyframes, /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\)/);
    assert.match(faceGlowKeyframes, /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-mid\)/);
    assert.match(faceGlowKeyframes, /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-low\)/);

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

  it("renders live Coffee avatars at Zen scale without overlay layers", () => {
    const coffeeSeatRule = ruleForExactSelector(".coffeeSeat");
    assert.match(coffeeSeatRule, /--coffee-seat-mood-frame-raster-opacity:\s*1\s*;/);

    const clusterRule = ruleForExactSelector(".coffeeSeatCluster");
    assert.match(clusterRule, /--zen-live-bot-avatar-size,\s*clamp\(156px,\s*14\.8vw,\s*196px\)/);

    assert.doesNotMatch(pageSource, /coffeeSeatBodyRaster/);

    const livePlateRule = ruleForExactSelector('.coffeeSeatPlate[data-live-body-style="zen"]');
    assert.match(livePlateRule, /--bot-face-frame-glow-filter:\s*[\s\S]*drop-shadow/);
    assert.match(livePlateRule, /--coffee-live-bot-face-scale:\s*1\.68\s*;/);
    assert.doesNotMatch(livePlateRule, /inset:\s*var\(--coffee-live-bot-body-inset\)/);
    assert.match(livePlateRule, /--bot-face-frame-inset:\s*0\s*;/);
    assert.match(livePlateRule, /--bot-face-metal-light-inset:\s*0\s*;/);
    assert.match(
      livePlateRule,
      /--bot-face-metal-light-opacity:\s*0\.58\s*;/
    );
    assert.match(livePlateRule, /--bot-face-metal-light-z:\s*5\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-left:\s*16\.6%\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-top:\s*11\.5%\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-right:\s*15\.2%\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-bottom:\s*20\.3%\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-glass-opacity:\s*0\.46\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-glare-opacity:\s*0\.18\s*;/);
    assert.match(livePlateRule, /--bot-face-screen-specular-opacity:\s*0\.54\s*;/);
    assert.match(
      pageSource,
      /className=\{styles\.coffeeSeatFaceEmissionMask\}[\s\S]*<CoffeeSeatPlateEmoji[\s\S]*<BotFaceFrame \/>/
    );

    const liveFaceEmissionRule = ruleForExactSelector(".coffeeSeatFaceEmissionMask");
    assert.match(liveFaceEmissionRule, /inset:\s*0\s*;/);
    assert.match(liveFaceEmissionRule, /z-index:\s*var\(--bot-face-glyph-z,\s*6\)\s*;/);
    assert.match(liveFaceEmissionRule, /mix-blend-mode:\s*plus-lighter\s*;/);
    assert.match(
      liveFaceEmissionRule,
      /--bot-face-crt-texture-image:\s*url\("\/bot-frame\/bot-frame-screen-mask\.png\?v=1000"\)\s*;/
    );
    assert.match(liveFaceEmissionRule, /--bot-face-crt-texture-size:\s*100%\s*100%\s*;/);
    assert.match(liveFaceEmissionRule, /--bot-face-crt-texture-repeat:\s*repeat\s*;/);
    assert.match(liveFaceEmissionRule, /--bot-face-crt-phosphor-opacity:\s*0\.18\s*;/);
    assert.match(liveFaceEmissionRule, /--bot-face-crt-gap-opacity:\s*0\.42\s*;/);
    assert.match(
      liveFaceEmissionRule,
      /-webkit-mask-image:\s*var\(--bot-face-crt-texture-image\)\s*;/
    );
    assert.match(
      liveFaceEmissionRule,
      /-webkit-mask-repeat:\s*var\(--bot-face-crt-texture-repeat\)\s*;/
    );
    assert.match(
      liveFaceEmissionRule,
      /mask-image:\s*var\(--bot-face-crt-texture-image\)\s*;/
    );
    assert.match(
      liveFaceEmissionRule,
      /mask-repeat:\s*var\(--bot-face-crt-texture-repeat\)\s*;/
    );

    const phosphorRule = rulesForExactSelector(".coffeeSeatFaceEmissionMask::before").find((rule) =>
      /background-blend-mode:\s*multiply\s*;[\s\S]*mix-blend-mode:\s*color-dodge\s*;/.test(rule)
    );
    assert.ok(phosphorRule, "Missing Coffee CRT phosphor color-dodge layer");
    assert.match(phosphorRule, /background-blend-mode:\s*multiply\s*;/);
    assert.match(phosphorRule, /mix-blend-mode:\s*color-dodge\s*;/);
    assert.match(phosphorRule, /filter:\s*brightness\(1\.18\)\s*contrast\(1\.08\)\s*saturate\(1\.35\)\s*;/);

    const gapRule = rulesForExactSelector(".coffeeSeatFaceEmissionMask::after").find((rule) =>
      /background-blend-mode:\s*multiply\s*;[\s\S]*opacity:\s*var\(--bot-face-crt-gap-opacity\)\s*;[\s\S]*mix-blend-mode:\s*multiply\s*;/.test(rule)
    );
    assert.ok(gapRule, "Missing Coffee CRT gap multiply layer");
    assert.match(gapRule, /background-blend-mode:\s*multiply\s*;/);
    assert.match(gapRule, /opacity:\s*var\(--bot-face-crt-gap-opacity\)\s*;/);
    assert.match(gapRule, /mix-blend-mode:\s*multiply\s*;/);

    const liveFaceRule = ruleForExactSelector(
      '.coffeeSeatPlate[data-live-body-style="zen"] .coffeeSeatPlateEmoji'
    );
    assert.match(liveFaceRule, /font-size:\s*calc\(/);
    assert.match(liveFaceRule, /--zen-live-bot-avatar-face-glyph-size,\s*clamp\(1\.74rem,\s*5\.15vw,\s*2\.58rem\)/);
    assert.match(liveFaceRule, /var\(--coffee-live-bot-face-scale,\s*1\)/);

    const frameRule = ruleForExactSelector(".botFaceFrame");
    assert.match(frameRule, /var\(--bot-face-frame-glow-filter,\s*drop-shadow\(0 0 0 transparent\)\)/);
    assert.match(frameRule, /opacity:\s*var\(--bot-face-frame-opacity,\s*1\)\s*;/);
    assert.match(frameRule, /overflow:\s*hidden\s*;/);
    assert.match(frameRule, /border-radius:\s*50%\s*;/);
    assert.match(frameRule, /clip-path:\s*circle\(50% at 50% 50%\)\s*;/);
    assert.doesNotMatch(frameRule, /coffee-plate-emoji-face-scale-y/);

    const screenFillRule = ruleForExactSelector(".botFaceScreenFill");
    assert.match(screenFillRule, /inset:\s*auto\s*;/);
    assert.match(
      screenFillRule,
      /left:\s*var\(--bot-face-screen-left,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(
      screenFillRule,
      /top:\s*var\(--bot-face-screen-top,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(
      screenFillRule,
      /right:\s*var\(--bot-face-screen-right,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(
      screenFillRule,
      /bottom:\s*var\(--bot-face-screen-bottom,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(screenFillRule, /border-radius:\s*var\(--bot-face-screen-radius,\s*50%\)\s*;/);
    assert.match(screenFillRule, /background:\s*var\(\s*--bot-face-screen-background/);
    assert.match(screenFillRule, /var\(--zen-presence-face-bg,\s*var\(--bot-face-screen-default-bg\)\)/);
    assert.match(screenFillRule, /box-shadow:\s*var\(\s*--bot-face-screen-shadow,\s*var\(--bot-face-screen-default-shadow\)\s*\)/);
    assert.doesNotMatch(screenFillRule, /--zen-presence-face-shadow/);
    assert.match(screenFillRule, /opacity:\s*1\s*;/);
    assert.match(screenFillRule, /transform:\s*scaleX\(var\(--coffee-plate-emoji-face-scale-y,\s*1\)\)\s*;/);
    assert.match(screenFillRule, /transform-origin:\s*center center\s*;/);

    const screenGlassRule = ruleForExactSelector(".botFaceScreenGlass");
    assert.match(screenGlassRule, /inset:\s*auto\s*;/);
    assert.match(
      screenGlassRule,
      /left:\s*var\(--bot-face-screen-left,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(
      screenGlassRule,
      /top:\s*var\(--bot-face-screen-top,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(
      screenGlassRule,
      /right:\s*var\(--bot-face-screen-right,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(
      screenGlassRule,
      /bottom:\s*var\(--bot-face-screen-bottom,\s*var\(--bot-face-screen-inset,\s*17%\)\)\s*;/
    );
    assert.match(screenGlassRule, /border-radius:\s*var\(--bot-face-screen-radius,\s*50%\)\s*;/);
    assert.match(screenGlassRule, /opacity:\s*var\(--bot-face-screen-glass-opacity,\s*0\.42\)/);
    assert.match(css, /\.botFaceScreenGlass::before\s*\{[\s\S]*background:\s*none\s*;/);
    assert.match(css, /\.botFaceScreenGlass::before\s*\{[\s\S]*opacity:\s*0\s*;/);
    assert.match(css, /\.botFaceScreenGlass::before\s*\{[\s\S]*filter:\s*none\s*;/);
    assert.match(
      css,
      /\.botFaceScreenGlass::after\s*\{[\s\S]*var\(--bot-face-screen-glare-x,\s*34%\)[\s\S]*transparent 11\.5%[\s\S]*transparent 15%[\s\S]*opacity:\s*var\(--bot-face-screen-specular-opacity,\s*0\.66\)/
    );
    assert.doesNotMatch(css, /\.botFaceScreenGlass::after\s*\{[\s\S]*linear-gradient\(\s*138deg/);

    const rosterGlassRule = ruleForExactSelector(
      '.coffeeSeat[data-roster-preview="true"] .botFaceScreenGlass'
    );
    assert.match(rosterGlassRule, /--bot-face-screen-inset:\s*0\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-left:\s*0\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-top:\s*0\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-right:\s*0\s*;/);
    assert.match(rosterGlassRule, /--bot-face-screen-bottom:\s*0\s*;/);
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
    assert.match(metalLightRule, /border-radius:\s*50%\s*;/);
    assert.match(
      metalLightRule,
      /clip-path:\s*var\(--bot-face-metal-light-clip-path,\s*circle\(50% at 50% 50%\)\)/
    );
    assert.match(metalLightRule, /mask-image:\s*var\(/);
    assert.match(metalLightRule, /-webkit-mask-mode:\s*luminance\s*;/);
    assert.match(metalLightRule, /mask-mode:\s*luminance\s*;/);

    const metalLightRasterRule = ruleForExactSelector(".botFaceFrameMetalLightRaster");
    assert.match(metalLightRasterRule, /overflow:\s*hidden\s*;/);
    assert.match(metalLightRasterRule, /border-radius:\s*50%\s*;/);
    assert.match(
      metalLightRasterRule,
      /clip-path:\s*var\(--bot-face-metal-light-clip-path,\s*circle\(50% at 50% 50%\)\)/
    );
    assert.match(metalLightRasterRule, /-webkit-mask-image:\s*var\(/);
    assert.match(metalLightRasterRule, /-webkit-mask-mode:\s*luminance\s*;/);
    assert.match(metalLightRasterRule, /mask-image:\s*var\(/);
    assert.match(metalLightRasterRule, /mask-mode:\s*luminance\s*;/);
    assert.doesNotMatch(metalLightRasterRule, /rotate\(var\(--bot-face-metal-light-rotation/);

    const metalLightTextureRule = ruleForExactSelector(".botFaceFrameMetalLightRaster::before");
    assert.match(metalLightTextureRule, /background:\s*url\("\/bot-frame\/bot-frame-metal\.png\?v=1000"\)\s*center\s*\/\s*contain\s*no-repeat/);
    assert.match(metalLightTextureRule, /rotate\(var\(--bot-face-metal-light-rotation,\s*0deg\)\)/);
    assert.doesNotMatch(metalLightTextureRule, /mask-image/);

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

  it("keeps Table Talk permanent for joined Coffee sessions", () => {
    assert.match(pageSource, /const coffeeTranscriptPermanent = coffeeSessionJoined;/);
    assert.match(
      pageSource,
      /data-transcript-open=\{coffeeTranscriptPermanent \? "true" : undefined\}/
    );
    assert.match(
      pageSource,
      /\{coffeeTranscriptPermanent \? renderCoffeeTranscriptPanel\(\) : null\}/
    );
    assert.doesNotMatch(pageSource, /coffeeTranscriptOpen/);
    assert.doesNotMatch(pageSource, /openCoffeeTranscript/);
    assert.doesNotMatch(pageSource, /coffeeTranscriptToggleEnabled/);
    assert.doesNotMatch(pageSource, /Close Coffee transcript/);
    assert.doesNotMatch(pageSource, /Open Coffee transcript/);
    assert.doesNotMatch(pageSource, /className=\{.*coffeeTranscriptOverlay/);
    assert.doesNotMatch(css, /coffeeTranscriptOverlay/);

    assert.match(
      css,
      /@media\s*\(min-width:\s*1160px\)\s*\{[\s\S]*\.coffeeShell\[data-session-active="true"\]\[data-transcript-open="true"\]\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(300px,\s*340px\)\s*;/
    );

    const panelRule = ruleForExactSelector(".coffeeTranscriptPanel");
    assert.match(
      panelRule,
      /--coffee-transcript-width:\s*min\(340px,\s*calc\(100vw - 32px\)\)\s*;/
    );
  });

  it("keeps provider and model controls out of Coffee Group dashboards", () => {
    assert.doesNotMatch(pageSource, /renderCoffeeSessionModelSetup/);
    assert.doesNotMatch(pageSource, /coffeeSessionModelSetup/);
    assert.doesNotMatch(pageSource, /coffeeModelQualityHint/);

    const overviewStart = pageSource.indexOf("const renderCoffeeGroupOverview");
    const shellStart = pageSource.indexOf("const renderCoffeeShell", overviewStart);
    assert.notEqual(overviewStart, -1);
    assert.ok(shellStart > overviewStart);

    const overviewSource = pageSource.slice(overviewStart, shellStart);
    assert.doesNotMatch(overviewSource, /renderCoffeeProviderModeToggle/);
    assert.doesNotMatch(overviewSource, /renderCoffeeHeaderModelPicker/);
    assert.doesNotMatch(overviewSource, /renderCoffeeHeaderModelChrome/);
    assert.match(pageSource, /const renderCoffeeHeaderModelChrome = \(\): React\.ReactNode => \(/);
    assert.match(pageSource, /\{renderCoffeeHeaderModelChrome\(\)\}/);

    const startPanelRule = ruleForExactSelector(".coffeeGroupStartPanel");
    assert.match(
      startPanelRule,
      /grid-template-columns:\s*minmax\(166px,\s*0\.72fr\) minmax\(160px,\s*0\.72fr\) minmax\(220px,\s*1fr\)\s*;/
    );
  });

  it("uses a larger live table with closer seats, overlapping nameplates, and bigger mugs", () => {
    const liveStageRule = ruleForExactSelector('.coffeeStage[data-phase="arriving"]');
    assert.match(liveStageRule, /--coffee-canvas-y:\s*clamp\(40px,\s*5vh,\s*56px\)\s*;/);

    const tableGlowRule = ruleForExactSelector(".coffeeTableGlow");
    assert.match(tableGlowRule, /width:\s*min\(84%,\s*760px\)\s*;/);

    const tableDiskRule = ruleForExactSelector(".coffeeTableDisk");
    assert.match(tableDiskRule, /width:\s*min\(58vw,\s*560px\)\s*;/);
    assert.match(tableDiskRule, /max-width:\s*calc\(100% - 56px\)\s*;/);

    const liveTableOffsetRule = ruleForExactSelector(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]'
    );
    assert.match(liveTableOffsetRule, /--coffee-live-table-y:\s*clamp\(18px,\s*3vh,\s*32px\)\s*;/);

    const liveTopSeatRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeat[data-seat-count="5"][data-seat="0"][data-layout-seat="0"]'
    );
    assert.match(liveTopSeatRule, /top:\s*11%\s*;/);

    const liveTopActionAnchorRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeatActionAnchor[data-seat-count="5"][data-seat="0"][data-layout-seat="0"]'
    );
    assert.match(liveTopActionAnchorRule, /top:\s*11%\s*;/);

    const liveLeftSeatRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeat[data-seat-count="5"][data-seat="1"][data-layout-seat="1"]'
    );
    assert.match(liveLeftSeatRule, /left:\s*25%\s*;/);
    assert.match(liveLeftSeatRule, /top:\s*45%\s*;/);

    const liveRightSeatRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeat[data-seat-count="5"][data-seat="2"][data-layout-seat="2"]'
    );
    assert.match(liveRightSeatRule, /left:\s*75%\s*;/);
    assert.match(liveRightSeatRule, /top:\s*45%\s*;/);

    const liveLowerSeatRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeat[data-seat-count="5"][data-seat="3"][data-layout-seat="3"]'
    );
    assert.match(liveLowerSeatRule, /left:\s*29%\s*;/);
    assert.match(liveLowerSeatRule, /top:\s*77%\s*;/);

    const nameplateRules = rulesForExactSelector(".coffeeSeatGlowPill");
    assert.ok(
      nameplateRules.some((rule) =>
        /--coffee-seat-name-plate-y:\s*clamp\(-58px,\s*-5\.2vw,\s*-38px\)\s*;/.test(rule)
      ),
      "expected nameplates to tuck into the bottom of the bot body"
    );
    assert.ok(
      nameplateRules.some((rule) =>
        /--coffee-seat-name-glyph-gap:\s*4px\s*;/.test(rule) &&
        /column-gap:\s*var\(--coffee-seat-name-glyph-gap\)\s*;/.test(rule)
      ),
      "expected nameplates to tighten the gap between glyph and name"
    );

    const nameTextRule = ruleForExactSelector(".coffeeSeatGlowText");
    assert.match(nameTextRule, /justify-items:\s*start\s*;/);
    assert.match(nameTextRule, /text-align:\s*left\s*;/);

    const flippedNameTextRule = ruleForExactSelector(
      '.coffeeSeat[data-cup-side="left"] .coffeeSeatGlowText'
    );
    assert.match(flippedNameTextRule, /justify-items:\s*end\s*;/);
    assert.match(flippedNameTextRule, /text-align:\s*right\s*;/);

    const mugRule = ruleForExactSelector(".coffeeCup");
    assert.match(mugRule, /--coffee-cup-side-offset:\s*clamp\(-16px,\s*-1\.35vw,\s*-8px\)\s*;/);
    assert.match(mugRule, /--coffee-cup-sip-x:\s*clamp\(-64px,\s*-4\.8vw,\s*-44px\)\s*;/);
    assert.match(mugRule, /--coffee-cup-sip-y:\s*clamp\(-30px,\s*-2\.6vw,\s*-20px\)\s*;/);
    assert.match(mugRule, /width:\s*clamp\(52px,\s*6vw,\s*70px\)\s*;/);
    assert.match(mugRule, /height:\s*clamp\(60px,\s*6\.9vw,\s*82px\)\s*;/);

    const leftMugRule = ruleForExactSelector('.coffeeCup[data-cup-side="left"]');
    assert.match(leftMugRule, /--coffee-cup-sip-x:\s*clamp\(44px,\s*4\.8vw,\s*64px\)\s*;/);
  });

  it("keeps the Coffee pot in the table canvas at its original resting size", () => {
    assert.match(
      pageSource,
      /const coffeePotVisible =[\s\S]*conversationActive[\s\S]*coffeeSessionPhase === "live"[\s\S]*!previewingSession[\s\S]*!coffeeReplayActive;/
    );
    assert.ok(
      pageSource.indexOf("className={styles.coffeePotLayer}") <
        pageSource.indexOf('data-coffee-table-scene="true"'),
      "expected the Coffee pot layer to render inside the table canvas before the table scene"
    );
    assert.match(pageSource, /const coffeePotAssetTheme: CoffeePotAssetTheme = resolvedTheme;/);
    assert.match(pageSource, /data-coffee-pot-theme=\{coffeePotAssetTheme\}/);
    assert.match(pageSource, /coffeePotRestImageUrl\(coffeePotAssetTheme\)/);
    assert.match(pageSource, /coffeePotPourImageUrl\(coffeePotAssetTheme\)/);
    assert.match(pageSource, /coffeePotPourFrameImageUrl\(coffeePotAssetTheme, frameIndex\)/);
    assert.doesNotMatch(
      pageSource,
      /coffeePot(?:Rest|Pour|PourFrame)ImageUrl\(resolvedTheme/
    );

    const potLayerRule = ruleForExactSelector(".coffeePotLayer");
    assert.match(potLayerRule, /--coffee-pot-pour-stream-blend-mode:\s*normal\s*;/);
    assert.match(potLayerRule, /brightness\(0\.92\)/);

    const lightPotLayerRule = ruleForExactSelector(
      '.coffeePotLayer[data-coffee-pot-theme="light"]'
    );
    assert.match(lightPotLayerRule, /--coffee-pot-pour-stream-blend-mode:\s*screen\s*;/);
    assert.match(lightPotLayerRule, /saturate\(1\.18\)/);

    const potTrayRule = ruleForExactSelector(".coffeePotTray");
    assert.match(potTrayRule, /left:\s*clamp\(18px,\s*2\.2vw,\s*30px\)\s*;/);
    assert.match(potTrayRule, /bottom:\s*clamp\(18px,\s*2\.4vw,\s*34px\)\s*;/);
    assert.match(potTrayRule, /width:\s*clamp\(54px,\s*6\.6vw,\s*84px\)\s*;/);
    assert.match(potTrayRule, /height:\s*clamp\(46px,\s*5\.4vw,\s*70px\)\s*;/);

    const potImageRule = ruleForExactSelector(".coffeePotTray img");
    assert.match(potImageRule, /width:\s*116%\s*;/);
    assert.match(potImageRule, /height:\s*116%\s*;/);

    const potDragRule = ruleForExactSelector(".coffeePotDrag");
    assert.match(potDragRule, /--coffee-pot-drag-size:\s*clamp\(63px,\s*7\.65vw,\s*97px\)\s*;/);
    assert.doesNotMatch(css, /coffee-pot-composer-reserve/);

    const potPourFrameRule = ruleForExactSelector(".coffeePotPourStreamFrame");
    assert.match(
      potPourFrameRule,
      /mix-blend-mode:\s*var\(--coffee-pot-pour-stream-blend-mode,\s*normal\)\s*;/
    );
    assert.match(
      potPourFrameRule,
      /filter:\s*var\(--coffee-pot-pour-stream-filter\)\s*;/
    );

    assert.match(pageSource, /COFFEE_POT_RETURN_MS/);
    assert.match(pageSource, /returning\?: boolean;/);
    assert.match(pageSource, /returnX\?: number;/);
    assert.match(pageSource, /returnY\?: number;/);
    assert.match(pageSource, /setCoffeePotDrag\(returningDrag\)/);
    assert.match(pageSource, /data-returning=\{coffeePotDrag\.returning \? "true" : undefined\}/);
    assert.match(pageSource, /"--coffee-pot-return-x"/);
    assert.match(pageSource, /"--coffee-pot-return-y"/);

    const returningRule = ruleForExactSelector('.coffeePotDrag[data-returning="true"]');
    assert.match(
      returningRule,
      /animation:\s*coffeePotReturnToTray 280ms cubic-bezier\(0\.22,\s*0\.78,\s*0\.24,\s*1\) both\s*;/
    );
    assert.match(
      css,
      /@keyframes coffeePotReturnToTray \{[\s\S]*left:\s*var\(--coffee-pot-return-x,\s*var\(--coffee-pot-drag-x\)\);[\s\S]*top:\s*var\(--coffee-pot-return-y,\s*var\(--coffee-pot-drag-y\)\);/
    );
  });

  it("blocks sip visuals while the Coffee pot is filling a bot", () => {
    assert.match(pageSource, /const COFFEE_CUP_REFILL_SIP_LOCK_MS = 3_200;/);
    assert.match(pageSource, /const refillSipLocked = refillSipLockUntilMs > coffeeSessionClockMs;/);
    assert.match(pageSource, /const visualSeatSipInProgress = refillSipLocked \? false : seatSipInProgress;/);
    assert.match(pageSource, /sipLockedUntilMs: refillSipLockUntilMs \|\| null,/);
    assert.match(pageSource, /refillSipLocked \|\| !seatIsFirmlySeated/);
    assert.match(pageSource, /cupSipping: refillSipLocked \? false : coffeeCupVisual\.sipping,/);
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
