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
const settingsPanelPath = join(dirname(fileURLToPath(import.meta.url)), "SettingsPanel.tsx");
const css = readFileSync(cssPath, "utf8")
  .replace(/\s+/gu, " ")
  .replace(/\(\s+/gu, "(")
  .replace(/\s+\)/gu, ")");
const coffeeSeatPlateEmojiSource = readFileSync(coffeeSeatPlateEmojiPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8").replace(/\s+/gu, " ");
const settingsPanelSource = readFileSync(settingsPanelPath, "utf8");

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

function ruleForSelectorNeedlesWithBody(selectorNeedles: string[], bodyNeedle: string): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
    (entry) =>
      selectorNeedles.every((needle) => (entry[1] ?? "").includes(needle)) &&
      (entry[2] ?? "").includes(bodyNeedle)
  );
  assert.ok(
    match,
    `Missing CSS rule containing ${selectorNeedles.join(", ")} and body ${bodyNeedle}`
  );
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
  it("defaults Coffee duration to open-ended Auto without a countdown deadline", () => {
    assert.match(
      pageSource,
      /useState<CoffeeSessionDurationMinutes \| null>\(null\)/,
    );
    assert.match(pageSource, /Open-ended · no countdown/);
    assert.match(pageSource, /durationMinutes: coffeeSelectedDurationMinutes/);
    assert.match(
      pageSource,
      /conversation\?\.coffeeSessionDurationMinutes == null \? null : startedAtMs \+ coffeeSessionDurationMs/,
    );
  });

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
      ':not([data-face-mouth-character]) [data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="⁎"]'
    );
    assert.notEqual(formalFaceFontRuleIndex, -1);
    assert.ok(sipMouthRuleIndex > formalFaceFontRuleIndex);

    const rule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji:not([data-face-mouth-character])",
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

  it("uses the Doto matrix font for the concise face slot", () => {
    assert.match(css, /--prism-doto-face-font:\s*var\(--font-doto-display\)/);

    const conciseVoiceRule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji",
      'data-voice-preset="concise"'
    );
    assert.match(conciseVoiceRule, /font-family:\s*var\(--prism-doto-face-font\)\s*;/);
    assert.match(conciseVoiceRule, /"ROND"\s*55/);

    const concisePartRule = ruleForSelectorNeedlesWithBody(
      ['data-face-font="concise"'],
      "font-family: var(--prism-doto-face-font)"
    );
    assert.match(concisePartRule, /"ROND"\s*55/);

    const customizerSampleRule = ruleForSelectorNeedles(
      ".botAvatarFontOptionSample",
      'data-face-font="concise"'
    );
    assert.match(customizerSampleRule, /font-family:\s*var\(--prism-doto-face-font\)\s*;/);
  });

  it("keeps the rest cup hidden until the sip cup returns to the table", () => {
    assert.match(
      css,
      /@keyframes coffeeCupRestDuringSip \{[\s\S]*22%,\s*99% \{[\s\S]*opacity:\s*var\(--coffee-cup-rest-sip-opacity\);[\s\S]*100% \{[\s\S]*opacity:\s*1;/
    );
    assert.match(
      css,
      /@keyframes coffeeCupSip \{[\s\S]*18%,\s*76% \{[\s\S]*opacity:\s*1;[\s\S]*translate\(var\(--coffee-cup-sip-x\), var\(--coffee-cup-sip-y\)\)[\s\S]*96%,\s*99% \{[\s\S]*opacity:\s*1;[\s\S]*translate\(0, 3px\)[\s\S]*100% \{[\s\S]*opacity:\s*0;[\s\S]*translate\(0, 3px\)/
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
      /useEffect\(\(\) => \{\s+setBlinkState\(\{ phase: "open", key: blinkKey \}\);\s+if \(\s+!enabled \|\|\s+faceBlinkDisabled \|\|\s+talkingPausesBlink \|\|\s+forcedBlinkPhase !== null \|\|\s+thinkingSpinnerActive \|\|\s+questionGlyphActive\s+\) \{/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const displayBlinkPhase: CoffeeSeatBlinkPhase =\s+!enabled \|\|\s+faceBlinkDisabled \|\|\s+talkingPausesBlink \|\|\s+thinkingSpinnerActive \|\|\s+questionGlyphActive\s+\? "open"\s+:\s+\(?forcedBlinkPhase \?\? blinkPhase\)?;/
    );
  });

  it("keeps live bot blinks running during speech with a calmer cadence", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const COFFEE_SEAT_TALKING_BLINK_GAP_MULTIPLIER = 1\.35;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /function coffeeSeatBlinkGapMs\(talking = false\): number \{\s+const gapMs = randomBetween\(1500, 4000\);\s+return talking\s+\? gapMs \* COFFEE_SEAT_TALKING_BLINK_GAP_MULTIPLIER\s+: gapMs;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /if \(talking\) \{\s+if \(roll < 0\.03\) return 2;\s+if \(roll < 0\.14\) return 1;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const isTalkingRef = useRef\(isTalking\);\s+const blinkPhase[\s\S]*?useEffect\(\(\) => \{\s+isTalkingRef\.current = isTalking;\s+\}, \[isTalking\]\);/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const talking = blinkWhileTalking && isTalkingRef\.current;\s+armBlink\(\s+coffeeSeatBlinkGapMs\(talking\),\s+coffeeSeatExtraBlinkCount\(talking\),/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const blinkKey = `\$\{enabled \? "enabled" : "disabled"\}:\$\{talkingPausesBlink \? "talking" : "idle"\}/
    );
    assert.match(
      pageSource,
      /isTalking=\{faceTalking\}[\s\S]{0,800}blinkWhileTalking[\s\S]{0,120}mouthShape=\{faceMouthShape\}/
    );
    assert.match(
      pageSource,
      /isTalking=\{seatMouthActive\}[\s\S]*?blinkWhileTalking[\s\S]*?mouthShape=\{mouthShapeWhileTyping\}/
    );
  });

  it("threads fully transformable blink bars through Coffee face rendering", () => {
    assert.match(coffeeSeatPlateEmojiSource, /faceBlinkBar\?: BotFaceBlinkBar \| null/);
    assert.match(coffeeSeatPlateEmojiSource, /forceBlinkPhase\?: CoffeeSeatBlinkPhase \| null/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /faceThinkingFrames\?: BotFaceThinkingFrames \| string\[\] \| null/
    );
    assert.match(coffeeSeatPlateEmojiSource, /faceMouthRotationDeg\?: number \| null/);
    assert.match(coffeeSeatPlateEmojiSource, /faceBlinkRotationDeg\?: number \| null/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceBlinkBar =\s+normalizeBotFaceBlinkBar\(faceBlinkBar\) \?\? DEFAULT_BOT_FACE_BLINK_BAR;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceBlinkRotationDeg =\s+thinkingSpinnerActive \|\| questionGlyphActive \|\| faceBlinkDisabled[\s\S]{0,180}normalizeBotFaceBlinkRotationDeg\(faceBlinkRotationDeg\) \?\? 0/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const faceBlinkRotationCssDeg =[\s\S]{0,220}DEFAULT_BOT_FACE_PAIRED_EYE_ROTATION_DEG/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /\["--bot-face-blink-rotation" as string\]:[\s\S]{0,140}`\$\{faceBlinkRotationCssDeg\}deg`/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedThinkingFrames =\s+normalizeBotFaceThinkingFrames\(faceThinkingFrames\) \?\?\s+DEFAULT_BOT_FACE_THINKING_FRAMES;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const thinkingSpinnerActive =\s+enabled &&\s+showThinkingSpinner &&\s+!isTalking &&\s+!botFaceThinkingSpinnerDisabled\(normalizedThinkingFrames\);/,
    );
    assert.match(coffeeSeatPlateEmojiSource, /const faceBlinkDisabled = normalizedFaceBlinkBar === "none";/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceBlinkScale =\s+thinkingSpinnerActive \|\| questionGlyphActive \|\| faceBlinkDisabled/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceBlinkOffsetX =\s+thinkingSpinnerActive \|\| questionGlyphActive \|\| faceBlinkDisabled/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /blinkBar: normalizedFaceBlinkBar,/
    );
    assert.match(coffeeSeatPlateEmojiSource, /function screenRelativeFacePartRotationDeg/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceMouthScale =\s+thinkingSpinnerActive \|\| questionGlyphActive\s+\? undefined\s+: \(?normalizeBotFaceMouthScale\(faceMouthScale\) \?\? undefined\)?;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceMouthOffsetX =\s+thinkingSpinnerActive \|\| questionGlyphActive\s+\? undefined\s+: \(?normalizeBotFaceMouthOffsetX\(faceMouthOffsetX\) \?\? undefined\)?;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceMouthOffsetY =\s+thinkingSpinnerActive \|\| questionGlyphActive\s+\? undefined\s+: \(?normalizeBotFaceMouthOffsetY\(faceMouthOffsetY\) \?\? undefined\)?;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceMouthRotationDeg =\s+thinkingSpinnerActive \|\| questionGlyphActive\s+\? undefined/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceEyeRotationDeg =\s+thinkingSpinnerActive \|\| questionGlyphActive\s+\? undefined/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const faceEyeRotationCssDeg =\s+normalizedFaceEyeRotationDeg === undefined\s+\? undefined\s+: normalizedFaceEyeRotationDeg;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /screenRelativeFacePartRotationDeg\(\s*normalizedFaceMouthRotationDeg,\s*rotateDeg,?\s*\)/
    );
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-mouth-rotation"/);
    assert.match(coffeeSeatPlateEmojiSource, /`\$\{faceMouthRotationCssDeg\}deg`/);
    assert.match(pageSource, /faceBlinkBar=\{faceStyle\.blinkBar\}/);
    assert.match(
      pageSource,
      /faceBlinkRotationDeg=\{faceStyle\.blinkRotationDeg\}/,
    );
    assert.match(pageSource, /faceMouthRotationDeg=\{faceStyle\.mouthRotationDeg\}/);
    assert.match(pageSource, /faceThinkingFrames=\{faceStyle\.thinkingFrames\}/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /phase: "half"/);
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /COFFEE_SEAT_BLINK_HALF_FRAME_MS/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /function coffeeSeatClosedBlinkHoldMs\(\): number \{\s+return randomBetween\(112, 178\);/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /function coffeeSeatExtraBlinkGapMs\(\): number \{\s+return randomBetween\(118, 260\);/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /if \(roll < 0\.05\) return 2;\s+if \(roll < 0\.22\) return 1;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /armBlink\(coffeeSeatExtraBlinkGapMs\(\), remainingExtraBlinks - 1\);/
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

  it("keeps shared face parts fixed while Default uses visemes and alternates keep custom mouths", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /isTalking && normalizedFaceMouthAnimation === "none"\s*\?\s*null\s*:\s*normalizedFaceMouthCharacter/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /\(\/\[0oOI\]\/\.test\(baseText\)/
    );
    assert.match(
      css,
      /data-coffee-plate-emoji-glyph="I"/
    );
    const sharedFaceRule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji",
      ".messageMoodCoffeeFace",
      ".zenLiveBotPresenceFaceGlyph"
    );
    assert.match(sharedFaceRule, /grid-template-areas:\s*"eyes mouth"\s*;/);
    assert.match(sharedFaceRule, /--coffee-face-feature-paint-pad-block:\s*0\.18em\s*;/);
    assert.match(sharedFaceRule, /--coffee-face-feature-paint-pad-inline:\s*0\.18em\s*;/);
    assert.match(
      sharedFaceRule,
      /grid-template-columns:\s*var\(--coffee-face-eye-track,\s*0\.4em\) var\(--coffee-face-mouth-track,\s*0\.4em\)\s*;/
    );
    assert.doesNotMatch(css, /data-coffee-plate-mouth-open[\s\S]{0,180}--coffee-face-gap/);

    const sharedPartRule = ruleForSelectorNeedlesWithBody(
      [".coffeeSeatPlateEmoji", "[data-coffee-plate-emoji-part]"],
      "--coffee-face-feature-paint-pad-inline"
    );
    assert.match(
      sharedPartRule,
      /inline-size:\s*calc\(\s*100%\s*\+\s*var\(--coffee-face-feature-paint-pad-inline,\s*0em\)\s*\+\s*var\(--coffee-face-feature-paint-pad-inline,\s*0em\)\s*\)\s*;/
    );
    assert.match(
      sharedPartRule,
      /min-inline-size:\s*calc\(\s*100%\s*\+\s*var\(--coffee-face-feature-paint-pad-inline,\s*0em\)\s*\+\s*var\(--coffee-face-feature-paint-pad-inline,\s*0em\)\s*\)\s*;/
    );
    assert.match(sharedPartRule, /max-inline-size:\s*none\s*;/);
    assert.match(
      sharedPartRule,
      /block-size:\s*calc\(\s*1em\s*\+\s*var\(--coffee-face-feature-paint-pad-block,\s*0em\)\s*\+\s*var\(--coffee-face-feature-paint-pad-block,\s*0em\)\s*\)\s*;/
    );
    assert.match(
      sharedPartRule,
      /min-block-size:\s*calc\(\s*1em\s*\+\s*var\(--coffee-face-feature-paint-pad-block,\s*0em\)\s*\+\s*var\(--coffee-face-feature-paint-pad-block,\s*0em\)\s*\)\s*;/
    );
    assert.match(
      sharedPartRule,
      /margin-inline:\s*calc\(var\(--coffee-face-feature-paint-pad-inline,\s*0em\) \* -1\)\s*;/
    );
    assert.match(
      sharedPartRule,
      /margin-block:\s*calc\(var\(--coffee-face-feature-paint-pad-block,\s*0em\) \* -1\)\s*;/
    );
    assert.match(sharedPartRule, /justify-self:\s*center\s*;/);
    assert.match(sharedPartRule, /overflow:\s*visible\s*;/);
    assert.doesNotMatch(sharedPartRule, /min-inline-size:\s*0\s*;/);

    const sharedEyeSlotRule = ruleForSelectorNeedlesWithBody(
      ['[data-coffee-plate-emoji-part="eyes"]'],
      "grid-area: eyes"
    );
    assert.match(sharedEyeSlotRule, /grid-area:\s*eyes\s*;/);

    const sharedMouthSlotRule = ruleForSelectorNeedlesWithBody(
      ['[data-coffee-plate-emoji-part="mouth"]'],
      "grid-area: mouth"
    );
    assert.match(sharedMouthSlotRule, /grid-area:\s*mouth\s*;/);
    assert.match(sharedMouthSlotRule, /var\(--bot-face-mouth-offset-x,\s*0em\)/);
    assert.match(sharedMouthSlotRule, /var\(--bot-face-mouth-offset-y,\s*0em\)/);
    assert.match(sharedMouthSlotRule, /var\(--bot-face-optical-offset-x,\s*0em\)/);
    assert.match(sharedMouthSlotRule, /var\(--bot-face-optical-offset-y,\s*0em\)/);
    assert.doesNotMatch(sharedMouthSlotRule, /rotate\(var\(--bot-face-mouth-rotation,\s*0deg\)\)/);
    assert.match(sharedMouthSlotRule, /scale\(var\(--bot-face-mouth-scale,\s*1\)\)/);
    const sharedMouthGlyphLayerRule = ruleForSelectorNeedlesWithBody(
      ['[data-coffee-plate-emoji-part="mouth"] > [data-crt-glyph-layer="true"]'],
      "transform-box: border-box"
    );
    assert.match(sharedMouthGlyphLayerRule, /inline-size:\s*max-content\s*;/);
    assert.match(sharedMouthGlyphLayerRule, /min-inline-size:\s*100%\s*;/);
    assert.doesNotMatch(sharedMouthGlyphLayerRule, /block-size:/);
    assert.match(sharedMouthGlyphLayerRule, /rotate\(var\(--bot-face-mouth-rotation,\s*0deg\)\)/);
    assert.match(sharedMouthGlyphLayerRule, /transform-origin:\s*center center\s*;/);
    const openMouthRule = ruleForSelectorNeedlesWithBody(
      ['[data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="0"]'],
      "inline-size: 1.12em"
    );
    assert.match(openMouthRule, /inline-size:\s*1\.12em\s*;/);
    assert.match(openMouthRule, /block-size:\s*1\.12em\s*;/);
    assert.match(openMouthRule, /margin:\s*0\s*;/);
    assert.match(openMouthRule, /justify-self:\s*center\s*;/);
    assert.match(openMouthRule, /align-self:\s*center\s*;/);
    assert.match(openMouthRule, /place-items:\s*center\s*;/);
    assert.match(openMouthRule, /line-height:\s*1\s*;/);
    assert.match(openMouthRule, /transform-origin:\s*center center\s*;/);
    const openMouthGlyphLayerRule = ruleForSelectorNeedlesWithBody(
      [
        '[data-coffee-plate-emoji-part="mouth"][data-coffee-plate-emoji-glyph="0"] > [data-crt-glyph-layer="true"]',
      ],
      "block-size: 100%"
    );
    assert.match(openMouthGlyphLayerRule, /inline-size:\s*100%\s*;/);
    assert.match(openMouthGlyphLayerRule, /min-inline-size:\s*100%\s*;/);
    assert.match(openMouthGlyphLayerRule, /block-size:\s*100%\s*;/);
    assert.match(openMouthGlyphLayerRule, /place-items:\s*center\s*;/);
    assert.match(openMouthGlyphLayerRule, /justify-self:\s*center\s*;/);
    assert.match(openMouthGlyphLayerRule, /align-self:\s*center\s*;/);
    assert.match(openMouthGlyphLayerRule, /line-height:\s*1\s*;/);
    const warmMouthRule = ruleForSelectorNeedlesWithBody(
      ['data-prism-mood="warm"', '[data-coffee-plate-emoji-part="mouth"]'],
      "scale(1.06)"
    );
    assert.doesNotMatch(warmMouthRule, /rotate\(var\(--bot-face-mouth-rotation,\s*0deg\)\)/);
    assert.match(warmMouthRule, /scale\(var\(--bot-face-mouth-scale,\s*1\)\)/);

    assert.match(coffeeSeatPlateEmojiSource, /data-coffee-plate-emoji-blink-glyph=/);
    const blinkGlyphRule = ruleForSelectorNeedlesWithBody(
      ['[data-coffee-plate-emoji-blink-glyph="true"]'],
      "justify-self: center"
    );
    assert.match(blinkGlyphRule, /justify-self:\s*center\s*;/);
    assert.match(blinkGlyphRule, /align-self:\s*center\s*;/);
    assert.match(blinkGlyphRule, /translate:\s*0 0\s*;/);

    const blinkEmissionRule = ruleForSelectorNeedlesWithBody(
      [
        '[data-coffee-plate-emoji-part="eyes"][data-coffee-plate-emoji-blink-glyph="true"]',
        '> [data-crt-glyph-layer="true"]',
      ],
      "--crt-glyph-core-red-rgb: 255 255 255"
    );
    assert.match(blinkEmissionRule, /--crt-glyph-core-red-rgb:\s*255 255 255\s*;/);
    assert.match(blinkEmissionRule, /--crt-glyph-core-green-rgb:\s*255 255 255\s*;/);
    assert.match(blinkEmissionRule, /--crt-glyph-core-blue-rgb:\s*255 255 255\s*;/);
    assert.match(blinkEmissionRule, /--crt-glyph-phosphor-midtone-strength:\s*0\.24\s*;/);
    assert.match(blinkEmissionRule, /--crt-glyph-phosphor-bright-strength:\s*0\.09\s*;/);
    assert.match(
      blinkEmissionRule,
      /--bot-face-custom-glyph-base-rotation:\s*var\(--bot-face-blink-rotation,\s*0deg\)\s*;/,
    );
    assert.match(
      blinkEmissionRule,
      /transform:\s*rotate\(var\(--bot-face-blink-rotation,\s*0deg\)\)\s*;/,
    );
  });

  it("maps bot face inflation to weight and stroke while face glow stays live through talking", () => {
    assert.match(coffeeSeatPlateEmojiSource, /function normalizeFaceFontWeight/);
    assert.match(coffeeSeatPlateEmojiSource, /function faceWeightStrokeForWeight/);
    assert.match(coffeeSeatPlateEmojiSource, /function faceWeightGlowRadiusScaleForWeight/);
    assert.match(coffeeSeatPlateEmojiSource, /function faceWeightGlowStrengthScaleForWeight/);
    assert.match(coffeeSeatPlateEmojiSource, /function faceWeightGlowStrokeForWeight/);
    assert.match(coffeeSeatPlateEmojiSource, /t \* 0\.032/);
    assert.match(coffeeSeatPlateEmojiSource, /0\.56 \+ t \* 0\.44/);
    assert.match(coffeeSeatPlateEmojiSource, /1 \+ t \* 0\.36/);
    assert.match(coffeeSeatPlateEmojiSource, /0\.36 \+ t \* 0\.64/);
    assert.match(coffeeSeatPlateEmojiSource, /1 \+ t \* 0\.34/);
    assert.match(coffeeSeatPlateEmojiSource, /0\.004 \+ t \* 0\.026/);
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-font-weight"/);
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-weight-stroke"/);
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-weight-glow-radius-scale"/);
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-weight-glow-strength-scale"/);
    assert.match(coffeeSeatPlateEmojiSource, /"--bot-face-weight-glow-stroke"/);
    assert.match(coffeeSeatPlateEmojiSource, /data-crt-glyph-layer="true"/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-emoji-part=\{part\}[\s\S]*data-crt-glyph-layer="true"[\s\S]*data-crt-glyph-content=\{renderedGlyph\}/
    );
    assert.match(coffeeSeatPlateEmojiSource, /data-crt-glyph-content=\{thinkingSpinnerGlyph\}/);
    assert.match(coffeeSeatPlateEmojiSource, /data-crt-glyph-content="\?"/);
    assert.match(coffeeSeatPlateEmojiSource, /data-crt-glyph-content=\{renderedGlyph\}/);
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
    assert.doesNotMatch(css, /zenLiveBotTalkingFacePartFlicker/);
    assert.doesNotMatch(css, /zenLiveBotTalkingFaceGlowFlicker/);

    const sharedFaceRule = ruleForSelectorNeedles(
      ".coffeeSeatPlateEmoji",
      ".messageMoodCoffeeFace",
      ".zenLiveBotPresenceFaceGlyph"
    );
    assert.match(sharedFaceRule, /--crt-face-edge-color:\s*var\(/);
    assert.match(sharedFaceRule, /--zen-live-bot-face-crt-border-color/);
    assert.match(
      sharedFaceRule,
      /var\(--coffee-bot-color,\s*var\(--coffee-seat-emotion-color,\s*currentColor\)\)/
    );
    assert.match(
      sharedFaceRule,
      /drop-shadow\(0 0 calc\(0\.045em \* var\(--crt-face-glow-radius-scale\)\) color-mix\(in srgb,\s*var\(--crt-face-edge-color\) 72%,\s*transparent\)/
    );
    assert.match(
      sharedFaceRule,
      /drop-shadow\(0 0 calc\(0\.1em \* var\(--crt-face-glow-radius-scale\)\) color-mix\(in srgb,\s*var\(--crt-face-edge-color\) 54%,\s*transparent\)/
    );
    assert.match(
      sharedFaceRule,
      /drop-shadow\(0 0 calc\(0\.44em \* var\(--crt-face-glow-radius-scale\)\) color-mix\(in srgb,\s*var\(--crt-face-edge-color\) 18%,\s*transparent\)/
    );
    assert.match(sharedFaceRule, /--crt-bloom-opacity:\s*0\.075\s*;/);
    assert.match(sharedFaceRule, /--crt-bloom-radius:\s*1\.4px\s*;/);
    assert.match(sharedFaceRule, /--crt-chromatic-offset:\s*0\.46px\s*;/);
    assert.match(sharedFaceRule, /--crt-chromatic-opacity:\s*0\.04\s*;/);

    const glyphLayerRule = ruleForSelectorNeedlesWithBody(
      ['.coffeeSeatPlateEmoji [data-crt-glyph-layer="true"]'],
      "--crt-glyph-beam-softness"
    );
    assert.match(glyphLayerRule, /--crt-glyph-paint-bleed:\s*var\(--crt-glyph-core-paint-bleed,\s*0\.08em\)\s*;/);
    assert.match(
      glyphLayerRule,
      /block-size:\s*calc\(\s*1em\s*\+\s*var\(--crt-glyph-paint-bleed\)\s*\+\s*var\(--crt-glyph-paint-bleed\)\s*\)\s*;/
    );
    assert.match(glyphLayerRule, /padding-block:\s*var\(--crt-glyph-paint-bleed\)\s*;/);
    assert.match(
      glyphLayerRule,
      /margin-block:\s*calc\(var\(--crt-glyph-paint-bleed\) \* -1\)\s*;/
    );
    assert.match(glyphLayerRule, /-webkit-text-stroke:\s*0\s*;/);
    assert.match(glyphLayerRule, /paint-order:\s*fill\s*;/);
    assert.match(glyphLayerRule, /--crt-face-glow-radius-scale:\s*var\(--bot-face-weight-glow-radius-scale,\s*1\)\s*;/);
    assert.match(
      glyphLayerRule,
      /--crt-weighted-bloom-radius:\s*calc\(\s*var\(--crt-bloom-radius,\s*1\.4px\) \* var\(--crt-face-glow-radius-scale\)\s*\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /--crt-glyph-beam-softness:\s*calc\(\s*var\(--crt-beam-softness,\s*0\.45px\) \* var\(--crt-face-glow-radius-scale\)\s*\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /--crt-glyph-bloom-strength-scale:\s*var\(--bot-face-glow-strength-scale,\s*1\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /--crt-glyph-bloom-narrow-radius:\s*calc\(\s*var\(--crt-bloom-narrow-radius,\s*var\(--crt-bloom-radius,\s*1\.4px\)\) \*\s*var\(--crt-face-glow-radius-scale\)\s*\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /--crt-glyph-bloom-wide-radius:\s*calc\(\s*var\(--crt-bloom-wide-radius,\s*6px\) \* var\(--crt-face-glow-radius-scale\)\s*\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /--crt-glyph-core-red-rgb:\s*var\(--crt-phosphor-red-rgb,\s*255 246 238\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /--crt-glyph-core-green-rgb:\s*var\(--crt-phosphor-green-rgb,\s*235 255 246\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /--crt-glyph-core-blue-rgb:\s*var\(--crt-phosphor-blue-rgb,\s*218 238 255\)\s*;/
    );
    assert.match(
      glyphLayerRule,
      /rgb\(var\(--crt-glyph-core-red-rgb\) \/ var\(--crt-glyph-phosphor-midtone-strength\)\)/
    );
    assert.match(
      glyphLayerRule,
      /rgb\(var\(--crt-glyph-core-green-rgb\) \/ var\(--crt-glyph-phosphor-midtone-strength\)\)/
    );
    assert.match(
      glyphLayerRule,
      /rgb\(var\(--crt-glyph-core-blue-rgb\) \/ var\(--crt-glyph-phosphor-midtone-strength\)\)/
    );

    const builtInGlyphCoreRule = ruleForSelectorNeedlesWithBody(
      [
        ':not([data-face-eye-character])',
        '[data-coffee-plate-emoji-part="eyes"]',
        '> [data-crt-glyph-layer="true"]',
      ],
      "--crt-glyph-core-red-rgb: 255 255 255"
    );
    assert.match(builtInGlyphCoreRule, /--crt-glyph-core-red-rgb:\s*255 255 255\s*;/);
    assert.match(builtInGlyphCoreRule, /--crt-glyph-core-green-rgb:\s*255 255 255\s*;/);
    assert.match(builtInGlyphCoreRule, /--crt-glyph-core-blue-rgb:\s*255 255 255\s*;/);
    assert.match(builtInGlyphCoreRule, /--crt-glyph-phosphor-midtone-strength:\s*0\.24\s*;/);
    assert.match(builtInGlyphCoreRule, /--crt-glyph-phosphor-bright-strength:\s*0\.09\s*;/);

    const cloneBaseRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji [data-crt-glyph-layer="true"]::before'
    );
    assert.match(cloneBaseRule, /content:\s*attr\(data-crt-glyph-content\)\s*;/);
    assert.match(cloneBaseRule, /font:\s*inherit\s*;/);
    assert.match(cloneBaseRule, /-webkit-text-stroke:\s*0\s*;/);
    assert.match(cloneBaseRule, /-webkit-background-clip:\s*border-box\s*;/);
    assert.match(cloneBaseRule, /background-clip:\s*border-box\s*;/);
    assert.match(cloneBaseRule, /-webkit-text-fill-color:\s*currentColor\s*;/);
    assert.match(cloneBaseRule, /background:\s*none\s*;/);
    assert.match(cloneBaseRule, /paint-order:\s*fill\s*;/);
    const bloomRule = ruleForSelectorNeedlesWithBody(
      ['.coffeeSeatPlateEmoji [data-crt-glyph-layer="true"]::before'],
      "--crt-glyph-bloom-narrow-radius"
    );
    assert.match(
      bloomRule,
      /font-weight:\s*inherit\s*;/
    );
    assert.match(
      bloomRule,
      /font-variation-settings:\s*inherit\s*;/
    );
    assert.doesNotMatch(bloomRule, /--bot-face-glow-font-weight/);
    assert.match(
      bloomRule,
      /-webkit-text-stroke:\s*var\(--bot-face-glow-stroke,\s*0\)\s*var\(--crt-face-edge-color,\s*currentColor\)\s*;/
    );
    assert.doesNotMatch(bloomRule, /--bot-face-font-weight/);
    assert.doesNotMatch(bloomRule, /--bot-face-weight-stroke/);
    assert.match(bloomRule, /color:\s*var\(--crt-face-edge-color,\s*currentColor\)\s*;/);
    assert.match(bloomRule, /opacity:\s*1\s*;/);
    assert.match(bloomRule, /--crt-glyph-bloom-narrow-radius/);
    assert.match(bloomRule, /--crt-glyph-bloom-wide-radius/);
    assert.match(
      bloomRule,
      /0 0 var\(--crt-glyph-bloom-narrow-radius\)\s*color-mix\(\s*in srgb,\s*var\(--crt-face-edge-color\) calc\(76% \* var\(--crt-glyph-bloom-strength-scale,\s*1\)\),\s*transparent\s*\)/
    );
    assert.doesNotMatch(bloomRule, /rgb\(255 255 255 \/ var\(--crt-glyph-bloom/);
    assert.match(
      bloomRule,
      /filter:\s*blur\(var\(--crt-glyph-beam-softness\)\)\s*var\(--crt-face-glow-filter\)\s*;/
    );
    assert.match(
      bloomRule,
      /mix-blend-mode:\s*var\(--crt-face-glow-blend-mode,\s*screen\)\s*;/
    );

    const chromaticRule = ruleForSelectorNeedlesWithBody(
      ['.coffeeSeatPlateEmoji [data-crt-glyph-layer="true"]::after'],
      "--crt-glyph-convergence-offset"
    );
    assert.match(chromaticRule, /background:\s*[\s\S]*linear-gradient/);
    assert.match(chromaticRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(chromaticRule, /-webkit-background-clip:\s*text\s*;/);
    assert.match(chromaticRule, /background-clip:\s*text\s*;/);
    assert.match(chromaticRule, /-webkit-text-fill-color:\s*transparent\s*;/);
    assert.match(
      chromaticRule,
      /-webkit-text-stroke:\s*calc\(\s*var\(--bot-face-weight-stroke,\s*0em\) \+ 0\.012em\s*\)\s*var\(--zen-live-bot-face-phosphor-ink,\s*#ffffff\)\s*;/,
    );
    assert.match(chromaticRule, /paint-order:\s*stroke fill\s*;/);
    assert.match(chromaticRule, /calc\(0px - var\(--crt-glyph-convergence-offset\)\)/);
    assert.match(chromaticRule, /var\(--crt-glyph-convergence-offset\) 0 0/);
    assert.match(chromaticRule, /var\(--crt-glyph-convergence-opacity\)/);
    assert.match(chromaticRule, /mix-blend-mode:\s*screen\s*;/);

    const liveFaceGlyphRule = ruleForExactSelector(".zenLiveBotPresenceFaceGlyph");
    assert.match(liveFaceGlyphRule, /--crt-face-edge-color:\s*var\(/);
    assert.match(liveFaceGlyphRule, /text-shadow:\s*none\s*;/);

    const customizerFaceGlyphRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-avatar-customizer-preview="true"] .zenLiveBotPresenceFaceGlyph'
    );
    assert.match(customizerFaceGlyphRule, /text-shadow:\s*none\s*;/);

    const facePartRule = ruleForSelectorNeedlesWithBody(
      [".zenLiveBotPresenceFaceGlyph", "[data-coffee-plate-emoji-part]"],
      "--zen-live-bot-idle-face-glow-filter"
    );
    assert.match(facePartRule, /--zen-live-bot-idle-face-glow-filter:/);
    assert.match(facePartRule, /--crt-bloom-opacity:\s*0\.09\s*;/);
    assert.match(facePartRule, /--crt-bloom-radius:\s*1\.35px\s*;/);
    assert.match(facePartRule, /--crt-bloom-wide-radius:\s*6px\s*;/);
    assert.match(facePartRule, /--crt-face-screen-wash-near-opacity:\s*10%\s*;/);
    assert.match(facePartRule, /--crt-face-screen-wash-mid-opacity:\s*4%\s*;/);
    assert.match(facePartRule, /--crt-face-screen-wash-far-opacity:\s*1\.5%\s*;/);
    assert.match(facePartRule, /calc\(0\.58px \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(facePartRule, /calc\(1\.2px \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(facePartRule, /calc\(14px \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.doesNotMatch(facePartRule, /calc\(21px \*/);
    assert.match(facePartRule, /--crt-face-glow-filter:\s*var\(--zen-live-bot-idle-face-glow-filter-high\)\s*;/);
    assert.match(facePartRule, /filter:\s*none\s*;/);
    assert.doesNotMatch(facePartRule, /animation:\s*zenLiveBotIdleLightBreath/);

    const liveFacePartRule = ruleForSelectorNeedlesWithBody(
      [
        '.coffeeSeatPlate[data-live-body-style="zen"]',
        ".coffeeSeatPlateEmoji",
        "[data-coffee-plate-emoji-part]",
      ],
      "--zen-live-bot-idle-face-glow-filter"
    );
    assert.match(liveFacePartRule, /--zen-live-bot-idle-face-glow-filter:/);
    assert.match(liveFacePartRule, /--crt-bloom-opacity:\s*0\.09\s*;/);
    assert.match(liveFacePartRule, /--crt-bloom-radius:\s*1\.35px\s*;/);
    assert.match(liveFacePartRule, /--crt-bloom-wide-radius:\s*6px\s*;/);
    assert.match(liveFacePartRule, /--crt-face-edge-color:\s*var\(/);
    assert.match(liveFacePartRule, /calc\(0\.58px \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(liveFacePartRule, /calc\(1\.2px \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(liveFacePartRule, /calc\(14px \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.doesNotMatch(liveFacePartRule, /calc\(21px \*/);
    assert.match(
      liveFacePartRule,
      /--crt-face-glow-filter:\s*var\(--zen-live-bot-idle-face-glow-filter-high\)\s*;/
    );
    assert.match(liveFacePartRule, /filter:\s*none\s*;/);
    assert.doesNotMatch(liveFacePartRule, /animation:\s*zenLiveBotIdleLightBreath/);

    const glyphLayerCrtFlickerRule = ruleForSelectorNeedlesWithBody(
      [
        ".zenLiveBotPresenceFaceGlyph",
        "[data-coffee-plate-emoji-part]",
        '[data-crt-glyph-layer="true"]',
      ],
      "zenLiveBotCrtFaceFlicker"
    );
    assert.match(
      glyphLayerCrtFlickerRule,
      /animation:\s*zenLiveBotCrtFaceFlicker 11\.7s linear infinite\s*;/
    );
    assert.doesNotMatch(glyphLayerCrtFlickerRule, /not\(\[data-talking="true"\]\)/);
    assert.match(css, /@keyframes zenLiveBotCrtFaceFlicker/);

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
    assert.match(talkingFacePartRule, /--crt-bloom-opacity:\s*0\.12\s*;/);
    assert.match(talkingFacePartRule, /--crt-bloom-radius:\s*1\.55px\s*;/);
    assert.match(talkingFacePartRule, /--crt-bloom-wide-radius:\s*7px\s*;/);
    assert.match(talkingFacePartRule, /--crt-chromatic-offset:\s*0\.42px\s*;/);
    assert.match(talkingFacePartRule, /--crt-chromatic-opacity:\s*0\.042\s*;/);
    assert.match(talkingFacePartRule, /--zen-live-bot-talking-face-glow-filter-high:/);
    assert.match(talkingFacePartRule, /--zen-live-bot-talking-face-glow-filter-mid:/);
    assert.match(talkingFacePartRule, /--zen-live-bot-talking-face-glow-filter-low:/);
    assert.match(talkingFacePartRule, /--crt-face-edge-color:\s*var\(/);
    assert.match(talkingFacePartRule, /var\(--crt-face-edge-color\) 62%,\s*transparent/);
    assert.doesNotMatch(talkingFacePartRule, /#ffffff 46%,\s*currentColor 54%/);
    assert.match(talkingFacePartRule, /drop-shadow\(0 0 calc\(0\.34em \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(talkingFacePartRule, /drop-shadow\(0 0 calc\(0\.28em \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(talkingFacePartRule, /drop-shadow\(0 0 calc\(0\.22em \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(talkingFacePartRule, /--crt-face-glow-filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\)\s*;/);
    assert.match(talkingFacePartRule, /filter:\s*none\s*;/);
    assert.doesNotMatch(talkingFacePartRule, /animation:/);

    const talkingFaceGlowCloneRule = ruleForSelectorNeedles(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"])',
      ".zenLiveBotPresenceFaceGlyph",
      "[data-crt-glyph-layer=\"true\"]::before"
    );
    assert.match(
      talkingFaceGlowCloneRule,
      /animation:\s*none\s*;/
    );

    const coffeeTalkingFacePartRule = ruleForSelectorNeedles(
      '.coffeeSeat[data-table-speaking="true"]',
      '.coffeeSeatPlate[data-live-body-style="zen"]',
      ".coffeeSeatPlateEmoji",
      "[data-coffee-plate-emoji-part]"
    );
    assert.match(coffeeTalkingFacePartRule, /--zen-live-bot-talking-face-glow-filter-high:/);
    assert.match(coffeeTalkingFacePartRule, /--crt-bloom-opacity:\s*0\.12\s*;/);
    assert.doesNotMatch(coffeeTalkingFacePartRule, /animation:/);

    const partRule = ruleForExactSelector(
      ".coffeeSeatPlateEmoji [data-coffee-plate-emoji-part]"
    );
    assert.match(
      partRule,
      /-webkit-text-stroke:\s*var\(--bot-face-weight-stroke,\s*0\)\s*var\(--crt-face-edge-color,\s*currentColor\)\s*;/
    );
    assert.match(partRule, /--crt-weighted-bloom-radius:\s*calc\(/);
    assert.match(partRule, /paint-order:\s*stroke fill\s*;/);

    const customFaceRule = ruleForExactSelector('.coffeeSeatPlateEmoji[data-face-custom="true"]');
    assert.match(customFaceRule, /font-weight:\s*var\(--bot-face-font-weight,\s*var\(--prism-face-weight\)\)\s*;/);
    assert.match(customFaceRule, /font-variation-settings:\s*"wght"\s*var\(--bot-face-font-weight,\s*var\(--prism-face-weight\)\)\s*;/);
  });

  it("renders live Coffee avatars at Zen scale without overlay layers", () => {
    const coffeeStageRule = ruleForExactSelector(".coffeeStage");
    assert.match(coffeeStageRule, /container-type:\s*inline-size\s*;/);
    assert.match(
      coffeeStageRule,
      /--coffee-seat-responsive-avatar-size:\s*clamp\(148px,\s*12\.6vw,\s*196px\)\s*;/
    );
    assert.match(
      css,
      /@supports\s*\(width:\s*1cqw\)\s*\{[\s\S]*\.coffeeStage\s*\{[\s\S]*--coffee-seat-responsive-avatar-size:\s*clamp\(148px,\s*12\.6cqw,\s*196px\)\s*;/
    );

    const coffeeSeatRule = ruleForExactSelector(".coffeeSeat");
    assert.match(coffeeSeatRule, /--coffee-seat-mood-frame-raster-opacity:\s*1\s*;/);

    const clusterRule = ruleForExactSelector(".coffeeSeatCluster");
    assert.match(
      clusterRule,
      /width:\s*var\(--coffee-seat-avatar-size,\s*var\(--zen-live-bot-avatar-size,\s*var\(--coffee-seat-responsive-avatar-size,\s*clamp\(148px,\s*12\.6vw,\s*196px\)\)\)\)\s*;/
    );
    assert.match(
      clusterRule,
      /height:\s*var\(--coffee-seat-avatar-size,\s*var\(--zen-live-bot-avatar-size,\s*var\(--coffee-seat-responsive-avatar-size,\s*clamp\(148px,\s*12\.6vw,\s*196px\)\)\)\)\s*;/
    );

    assert.doesNotMatch(pageSource, /coffeeSeatBodyRaster/);

    const livePlateRule = ruleForSelectorNeedlesWithBody(
      ['.coffeeSeatPlate[data-live-body-style="zen"]'],
      "--zen-live-bot-avatar-size"
    );
    assert.match(
      livePlateRule,
      /--zen-live-bot-avatar-size:\s*var\(\s*--coffee-seat-avatar-size,\s*var\(--coffee-seat-responsive-avatar-size,\s*clamp\(148px,\s*12\.6vw,\s*196px\)\)\s*\)\s*;/
    );
    assert.match(
      livePlateRule,
      /--zen-live-bot-avatar-body-size:\s*var\(--zen-live-bot-avatar-size\)\s*;/
    );
    assert.match(livePlateRule, /--zen-live-bot-body-x:\s*50%\s*;/);
    assert.match(livePlateRule, /--zen-live-bot-body-y:\s*50%\s*;/);
    assert.match(livePlateRule, /--zen-live-bot-face-x:\s*50%\s*;/);
    assert.match(livePlateRule, /--zen-live-bot-face-y:\s*43\.8%\s*;/);
    assert.match(livePlateRule, /--zen-live-bot-face-scale:\s*1\.68\s*;/);
    assert.match(livePlateRule, /--zen-live-bot-glyph-x-anchor:\s*0px\s*;/);
    assert.match(
      livePlateRule,
      /--zen-live-bot-glyph-y-anchor:\s*calc\(var\(--zen-live-bot-avatar-body-size\) \* 0\.37\)\s*;/
    );
    assert.match(
      livePlateRule,
      /--zen-live-bot-frame-tint-color:\s*var\(--coffee-seat-emotion-color\)\s*;/
    );
    assert.match(livePlateRule, /--zen-live-bot-face-phosphor-ink:\s*#ffffff\s*;/);
    assert.match(
      livePlateRule,
      /--zen-live-bot-glyph-ink:\s*var\(--zen-live-bot-face-phosphor-ink\)\s*;/
    );
    assert.match(livePlateRule, /--bot-face-crt-screen-texture-blend-mode:\s*luminosity\s*;/);
    assert.match(livePlateRule, /--coffee-seat-emotion-face-scale:\s*1\s*;/);
    assert.match(livePlateRule, /--zen-live-bot-eye-local-x:\s*-0\.2\s*;/);
    assert.match(
      livePlateRule,
      /--coffee-plate-emoji-nudge-y:\s*clamp\(-5px,\s*-2\.6%,\s*-2px\)\s*;/
    );
    const sharedEyeTransformRule = ruleForSelectorNeedlesWithBody(
      ['[data-coffee-plate-emoji-part="eyes"]'],
      "--bot-face-eye-offset-y"
    );
    assert.match(sharedEyeTransformRule, /--eye-blink-scale-x:\s*1\s*;/);
    assert.match(sharedEyeTransformRule, /--eye-blink-scale-y:\s*1\s*;/);
    assert.match(sharedEyeTransformRule, /--bot-face-mood-eye-shift-y:\s*0em\s*;/);
    assert.match(sharedEyeTransformRule, /--bot-face-mood-eye-scale-x:\s*1\s*;/);
    assert.match(sharedEyeTransformRule, /var\(--bot-face-eye-offset-x,\s*0em\)/);
    assert.match(sharedEyeTransformRule, /var\(--bot-face-eye-offset-y,\s*0em\)/);
    assert.match(sharedEyeTransformRule, /var\(--bot-face-optical-offset-x,\s*0em\)/);
    assert.match(sharedEyeTransformRule, /var\(--bot-face-optical-offset-y,\s*0em\)/);
    assert.match(sharedEyeTransformRule, /scale\(var\(--bot-face-eye-scale,\s*1\)\)/);
    assert.match(sharedEyeTransformRule, /scaleX\(var\(--eye-blink-scale-x\)\)/);
    assert.match(sharedEyeTransformRule, /scaleX\(var\(--bot-face-mood-eye-scale-x,\s*1\)\)/);
    assert.match(sharedEyeTransformRule, /scaleY\(var\(--eye-blink-scale-y\)\)/);
    assert.match(sharedEyeTransformRule, /scaleY\(var\(--bot-face-mood-eye-scale-y,\s*1\)\)/);

    const guardedEyeRule = ruleForSelectorNeedles(
      'data-prism-mood="guarded"',
      '[data-coffee-plate-emoji-part="eyes"]'
    );
    assert.match(guardedEyeRule, /--bot-face-mood-eye-shift-y:\s*-0\.015em\s*;/);
    assert.match(guardedEyeRule, /--bot-face-mood-eye-scale-x:\s*1\.16\s*;/);
    assert.doesNotMatch(guardedEyeRule, /transform:/);

    const strainedEyeRule = ruleForSelectorNeedles(
      'data-prism-mood="strained"',
      '[data-coffee-plate-emoji-part="eyes"]'
    );
    assert.match(strainedEyeRule, /--bot-face-mood-eye-shift-y:\s*0\.025em\s*;/);
    assert.match(strainedEyeRule, /--bot-face-mood-eye-scale-x:\s*0\.92\s*;/);
    assert.doesNotMatch(strainedEyeRule, /transform:/);
    assert.doesNotMatch(css, /data-coffee-plate-emoji-blink-phase="half"/);
    assert.doesNotMatch(livePlateRule, /inset:\s*var\(--coffee-live-bot-body-inset\)/);
    assert.doesNotMatch(livePlateRule, /--coffee-live-bot-face-scale/);
    assert.doesNotMatch(livePlateRule, /--bot-face-screen-glass-opacity/);
    assert.match(
      pageSource,
      /data-live-body-style="zen"[\s\S]*<ZenLiveBotMannequin[\s\S]*glyph=\{seatGlyphName\}[\s\S]*faceStyle=\{seatRenderedFaceStyle\}[\s\S]*plateFace=\{seatPlateGlyph\}[\s\S]*frameMaterialSeed=\{\s*botFrameMaterialSeedForBot\(\s*bot\s*,\s*bot\.id\s*,?\s*\)\s*\}/
    );
    assert.match(
      pageSource,
      /case "strained":\s*return "strained";/
    );
    assert.doesNotMatch(pageSource, /case "strained":\s*return "confused";/);
    assert.match(pageSource, /type BotFaceStyleSource = \{/);
    assert.match(pageSource, /faceEyeOffsetX\?: unknown;/);
    assert.match(pageSource, /faceEyeOffsetY\?: unknown;/);
    assert.match(pageSource, /faceMouthScale\?: unknown;/);
    assert.match(pageSource, /faceMouthOffsetX\?: unknown;/);
    assert.match(pageSource, /faceMouthOffsetY\?: unknown;/);
    assert.match(pageSource, /faceMouthRotationDeg\?: unknown;/);
    assert.match(pageSource, /faceThinkingFrames\?: unknown;/);
    assert.match(
      pageSource,
      /faceEyeOffsetX:\s*bot\?\.face_eye_offset_x \?\? bot\?\.faceEyeOffsetX/
    );
    assert.match(
      pageSource,
      /faceEyeOffsetY:\s*bot\?\.face_eye_offset_y \?\? bot\?\.faceEyeOffsetY/
    );
    assert.match(
      pageSource,
      /faceMouthScale:\s*bot\?\.face_mouth_scale \?\? bot\?\.faceMouthScale/
    );
    assert.match(
      pageSource,
      /faceMouthOffsetX:\s*bot\?\.face_mouth_offset_x \?\? bot\?\.faceMouthOffsetX/
    );
    assert.match(
      pageSource,
      /faceMouthOffsetY:\s*bot\?\.face_mouth_offset_y \?\? bot\?\.faceMouthOffsetY/
    );
    assert.match(
      pageSource,
      /faceMouthRotationDeg:\s*bot\?\.face_mouth_rotation_deg \?\? bot\?\.faceMouthRotationDeg/
    );
    assert.match(
      pageSource,
      /faceBlinkBar:\s*bot\?\.face_blink_bar \?\? bot\?\.faceBlinkBar/
    );
    assert.match(
      pageSource,
      /faceThinkingFrames:\s*parseStoredBotFaceThinkingFrames/
    );
    assert.doesNotMatch(pageSource, /styles\.coffeeSeatFaceEmissionMask/);
    assert.doesNotMatch(pageSource, /styles\.coffeeSeatPlateBotGlyph/);
    assert.doesNotMatch(css, /\.coffeeSeatFaceEmissionMask\b/);
    assert.doesNotMatch(css, /\.coffeeSeatPlateBotGlyph\b/);

    const liveFaceGlowRule = ruleForExactSelector(
      '.coffeeSeatPlate[data-live-body-style="zen"] .zenLiveBotPresenceFace'
    );
    assert.match(liveFaceGlowRule, /--bot-face-ambient-glow-color:\s*var\(--coffee-seat-emotion-color\)\s*;/);
    assert.match(liveFaceGlowRule, /--bot-face-ambient-glow-opacity:\s*0\.36\s*;/);
    assert.match(liveFaceGlowRule, /--bot-face-ambient-glow-blur:\s*clamp\(24px,\s*17%,\s*48px\)\s*;/);

    const liveSpeakingFaceRule = ruleForSelectorNeedlesWithBody(
      [
        '.coffeeSeat[data-table-speaking="true"]',
        '.coffeeSeatPlate[data-live-body-style="zen"]',
        ".zenLiveBotPresenceFace",
      ],
      "--bot-face-ambient-glow-opacity"
    );
    assert.match(liveSpeakingFaceRule, /--bot-face-ambient-glow-opacity:\s*0\.6\s*;/);

    const sharedFaceEmissionRule = ruleForExactSelector(".zenLiveBotPresenceFaceEmissionMask");
    assert.match(sharedFaceEmissionRule, /--bot-face-screen-mask-image:\s*url\("\/bot-frame\/bot-frame-screen-mask-glass\.png\?v=1000"\)\s*;/);
    assert.match(sharedFaceEmissionRule, /mix-blend-mode:\s*normal\s*;/);
    assert.match(sharedFaceEmissionRule, /filter:\s*none\s*;/);
    assert.match(sharedFaceEmissionRule, /isolation:\s*isolate\s*;/);
    assert.match(sharedFaceEmissionRule, /contain:\s*paint\s*;/);
    assert.match(
      sharedFaceEmissionRule,
      /--crt-phosphor-scale:\s*clamp\(1\.85px,\s*1\.16%,\s*3\.8px\)\s*;/
    );
    assert.match(sharedFaceEmissionRule, /--crt-scanline-pitch:\s*clamp\(3px,\s*1\.82%,\s*5px\)\s*;/);
    assert.match(sharedFaceEmissionRule, /--crt-static-opacity:\s*0\.03\s*;/);
    assert.match(sharedFaceEmissionRule, /--crt-convergence-offset:\s*0\.26px\s*;/);
    assert.doesNotMatch(sharedFaceEmissionRule, /--bot-face-crt-screen-texture-image/);
    assert.doesNotMatch(sharedFaceEmissionRule, /--bot-face-crt-gap-opacity/);
    assert.match(
      sharedFaceEmissionRule,
      /--bot-face-crt-grime-opacity:\s*var\(--crt-fresnel-strength\)\s*;/
    );
    assert.match(sharedFaceEmissionRule, /--bot-face-crt-grime-blur:\s*0\.16px\s*;/);
    assert.match(sharedFaceEmissionRule, /--crt-noise-opacity:\s*var\(--crt-static-opacity\)\s*;/);
    assert.match(sharedFaceEmissionRule, /--crt-breath-speed:\s*11\.8s\s*;/);
    assert.match(sharedFaceEmissionRule, /--crt-breath-strength:\s*0\.0018\s*;/);
    assert.match(
      pageSource,
      /botFaceCrtBreathingLayer[\s\S]*botFaceCrtGrimeLayer[\s\S]*data-crt-material-layer="grime"[\s\S]*style=\{screenMaterialStyle\}[\s\S]*CoffeeSeatPlateEmoji/
    );
    assert.match(pageSource, /screenMaterialSeed\?: string \| null/);
    assert.match(pageSource, /frameMaterialSeed\?: string \| null/);
    assert.match(pageSource, /function botScreenMaterialSeedForBot/);
    assert.match(pageSource, /return "bot-screen-material:shared-curved-glass";/);
    assert.match(pageSource, /function botScreenMaterialStyle/);
    assert.match(pageSource, /"--bot-face-crt-grime-opacity"/);
    assert.match(pageSource, /\["--bot-face-crt-grime-opacity" as string\]: "0\.24"/);
    assert.doesNotMatch(pageSource, /stableUnitValue\(`\$\{normalizedSeed\}:grime:/);
    assert.match(pageSource, /function botFrameMaterialSeedForBot/);
    assert.match(pageSource, /normalizeImportedBotHash\(bot\?\.export_hash\)/);
    assert.match(pageSource, /function botFrameMetalMaterialStyle/);
    assert.match(pageSource, /\$\{normalizedSeed\}:metal-scratch:rotation/);
    assert.match(pageSource, /"--bot-face-metal-scratch-opacity"/);
    assert.match(
      pageSource,
      /screenMaterialSeed=\{\s*botScreenMaterialSeedForBot\(\s*bot\s*,\s*bot\.id\s*,?\s*\)\s*\}/
    );
    assert.match(
      pageSource,
      /frameMaterialSeed=\{\s*botFrameMaterialSeedForBot\(\s*bot\s*,\s*bot\.id\s*,?\s*\)\s*\}/
    );

    const phosphorRule = rulesForExactSelector(".zenLiveBotPresenceFaceEmissionMask::before").find((rule) =>
      /Unlit aperture grille/.test(rule)
    );
    assert.ok(phosphorRule, "Missing shared clipped CRT aperture-grille layer");
    assert.match(phosphorRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(phosphorRule, /rgb\(var\(--crt-phosphor-red-rgb\) \/ var\(--crt-unlit-phosphor-opacity\)\)/);
    assert.match(phosphorRule, /rgb\(var\(--crt-phosphor-green-rgb\) \/ var\(--crt-unlit-phosphor-opacity\)\)/);
    assert.match(phosphorRule, /rgb\(var\(--crt-phosphor-blue-rgb\) \/ var\(--crt-unlit-phosphor-opacity\)\)/);
    assert.match(phosphorRule, /background-size:\s*[\s\S]*var\(--crt-phosphor-scale\) 100%/);
    assert.match(phosphorRule, /mix-blend-mode:\s*screen\s*;/);
    assert.doesNotMatch(phosphorRule, /bot-face-crt-screen-texture-image/);

    const scanlineRule = rulesForExactSelector(".zenLiveBotPresenceFaceEmissionMask::after").find((rule) =>
      /Scanlines are screen-fixed/.test(rule)
    );
    assert.ok(scanlineRule, "Missing shared CRT scanline layer");
    assert.match(scanlineRule, /repeating-linear-gradient\(\s*0deg/);
    assert.match(scanlineRule, /var\(--crt-scanline-opacity\)/);
    assert.match(scanlineRule, /var\(--crt-scanline-pitch\)/);
    assert.match(scanlineRule, /mix-blend-mode:\s*multiply\s*;/);

    const noiseRule = ruleForSelectorNeedlesWithBody(
      [".botFaceCrtNoiseLayer"],
      "data:image/svg+xml"
    );
    assert.match(noiseRule, /opacity:\s*var\(--crt-noise-opacity\)\s*;/);
    assert.match(noiseRule, /data:image\/svg\+xml/);
    assert.match(noiseRule, /feTurbulence/);
    assert.doesNotMatch(noiseRule, /repeating-radial-gradient/);
    assert.match(noiseRule, /mix-blend-mode:\s*hard-light\s*;/);
    assert.match(noiseRule, /filter:\s*contrast\(1\.12\) saturate\(0\) brightness\(0\.62\)\s*;/);
    assert.match(noiseRule, /animation:\s*crtStaticSnowJitter var\(--crt-static-speed\) steps\(9,\s*end\) infinite\s*;/);
    assert.doesNotMatch(noiseRule, /steps\(1/);

    const grimeRule = ruleForSelectorNeedlesWithBody(
      [".botFaceCrtGrimeLayer"],
      "radial-gradient"
    );
    assert.match(grimeRule, /inset:\s*0\s*;/);
    assert.match(grimeRule, /z-index:\s*8\s*;/);
    assert.match(grimeRule, /var\(--bot-face-screen-glare-x,\s*38%\)/);
    assert.match(grimeRule, /var\(--bot-face-screen-glare-y,\s*44%\)/);
    assert.doesNotMatch(grimeRule, /repeating-linear-gradient/);
    assert.match(grimeRule, /opacity:\s*1\s*;/);
    assert.match(grimeRule, /mix-blend-mode:\s*normal\s*;/);
    assert.match(grimeRule, /-webkit-backdrop-filter:\s*[\s\S]*blur\(var\(--bot-face-crt-grime-blur\)\)[\s\S]*saturate\(1\.02\)[\s\S]*contrast\(1\.03\)/);
    assert.match(grimeRule, /transform:\s*[\s\S]*translate3d\(var\(--bot-face-crt-grime-x\),\s*var\(--bot-face-crt-grime-y\),\s*0\)[\s\S]*rotate\(var\(--bot-face-crt-grime-rotation\)\)[\s\S]*scale\(var\(--bot-face-crt-grime-scale\)\)/);
    assert.match(grimeRule, /rotate\(var\(--bot-face-crt-grime-rotation\)\)/);
    assert.match(grimeRule, /scale\(var\(--bot-face-crt-grime-scale\)\)/);
    assert.doesNotMatch(grimeRule, /animation:/);

    const breathingRule = ruleForSelectorNeedlesWithBody(
      [".botFaceCrtBreathingLayer"],
      "crtElectronicBreath"
    );
    assert.match(
      breathingRule,
      /animation:\s*crtElectronicBreath var\(--crt-breath-speed\) linear infinite\s*;/
    );
    assert.match(css, /@keyframes crtElectronicBreath\s*\{[\s\S]*11%[\s\S]*34%[\s\S]*58%[\s\S]*77%/);
    assert.match(css, /@keyframes crtElectronicBreathCounter\s*\{[\s\S]*19%[\s\S]*43%[\s\S]*71%[\s\S]*89%/);
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.botFaceCrtNoiseLayer[\s\S]*animation:\s*none\s*;/
    );

    const liveStageFaceNudgeRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="live"]',
      '.coffeeSeatPlate[data-live-body-style="zen"]'
    );
    assert.match(
      liveStageFaceNudgeRule,
      /--coffee-plate-emoji-nudge-y:\s*clamp\(-5px,\s*-2\.6%,\s*-2px\)\s*;/
    );

    const frameRule = ruleForExactSelector(".botFaceFrame");
    assert.match(frameRule, /var\(--bot-face-frame-glow-filter,\s*drop-shadow\(0 0 0 transparent\)\)/);

    const ambientGlowRule = ruleForExactSelector(".zenLiveBotPresenceFace::before");
    assert.match(ambientGlowRule, /z-index:\s*var\(--bot-face-ambient-glow-z,\s*0\)\s*;/);
    assert.match(ambientGlowRule, /width:\s*var\(--bot-face-ambient-glow-size,\s*86%\)\s*;/);
    assert.match(ambientGlowRule, /opacity:\s*var\(--bot-face-ambient-glow-opacity,\s*0\)\s*;/);
    assert.match(ambientGlowRule, /mix-blend-mode:\s*normal\s*;/);
    assert.doesNotMatch(pageSource, /botFaceAmbientGlow/);
    assert.match(frameRule, /opacity:\s*var\(--bot-face-frame-opacity,\s*1\)\s*;/);
    assert.match(frameRule, /overflow:\s*hidden\s*;/);
    assert.match(frameRule, /border-radius:\s*50%\s*;/);
    assert.match(frameRule, /clip-path:\s*circle\(50% at 50% 50%\)\s*;/);
    assert.doesNotMatch(frameRule, /coffee-plate-emoji-face-scale-y/);

    const screenFillRule = ruleForExactSelector(".botFaceScreenFill");
    assert.match(screenFillRule, /inset:\s*auto\s*;/);
    assert.match(screenFillRule, /z-index:\s*var\(--bot-face-screen-z,\s*1\)\s*;/);
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
    assert.match(lightLivePlateRule, /--bot-face-crt-screen-texture-blend-mode:\s*overlay\s*;/);
    assert.match(lightLivePlateRule, /box-shadow:\s*none\s*;/);
    assert.doesNotMatch(lightLivePlateRule, /--bot-face-metal-light-base-color/);

    const lightLiveFaceRule = ruleForSelectorNeedles(
      ".themeLight.coffeeShell",
      '.coffeeSeatPlate[data-live-body-style="zen"]',
      ".zenLiveBotPresenceFace"
    );
    assert.match(
      lightLiveFaceRule,
      /--bot-face-metal-light-base-color:\s*var\(--coffee-bot-color\)\s*;/
    );
    assert.match(lightLiveFaceRule, /--bot-face-ambient-glow-opacity:\s*0\.32\s*;/);
    assert.match(lightLiveFaceRule, /--bot-face-screen-glass-opacity:\s*0\.3\s*;/);
    assert.match(lightLiveFaceRule, /--bot-face-screen-glare-opacity:\s*0\.14\s*;/);
    assert.match(lightLiveFaceRule, /--bot-face-screen-specular-opacity:\s*0\.38\s*;/);

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

    const metalScratchRule = ruleForExactSelector(".botFaceFrameMetalScratchLayer");
    assert.match(metalScratchRule, /opacity:\s*var\(--bot-face-metal-scratch-opacity\)\s*;/);
    assert.match(metalScratchRule, /mix-blend-mode:\s*exclusion\s*;/);
    assert.match(
      metalScratchRule,
      /-webkit-mask-image:\s*var\(--bot-face-metal-scratch-mask-image\)\s*;/
    );
    assert.match(metalScratchRule, /-webkit-mask-mode:\s*luminance\s*;/);
    assert.match(metalScratchRule, /mask-image:\s*var\(--bot-face-metal-scratch-mask-image\)\s*;/);
    assert.match(metalScratchRule, /mask-mode:\s*luminance\s*;/);
    assert.match(metalScratchRule, /rotate\(var\(--bot-face-metal-scratch-rotation\)\)/);
    assert.doesNotMatch(metalScratchRule, /animation:/);

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
    assert.match(guardedRule, /--coffee-seat-mood-frame-raster-opacity:\s*1\s*;/);

    const strainedRule = ruleForExactSelector('.coffeeSeat[data-prism-mood="strained"]');
    assert.match(strainedRule, /--coffee-seat-mood-frame-raster-opacity:\s*1\s*;/);

    const nearDesaturatedRule = ruleForExactSelector(
      '.coffeeSeat[data-mood-near-desaturated="true"]'
    );
    assert.match(nearDesaturatedRule, /--coffee-seat-mood-frame-raster-opacity:\s*0\.1\s*;/);

    const nearDesaturatedFaceRule = ruleForExactSelector(
      '.coffeeSeat[data-mood-near-desaturated="true"] .coffeeSeatPlateEmoji'
    );
    assert.match(nearDesaturatedFaceRule, /--crt-chromatic-offset:\s*0\.72px\s*;/);
    assert.match(nearDesaturatedFaceRule, /--crt-chromatic-opacity:\s*0\.085\s*;/);
  });

  it("keeps Table Talk permanent for joined Coffee sessions", () => {
    assert.match(
      pageSource,
      /const coffeeSessionSurfaceActive =\s*coffeeSessionJoined \|\| shellPolicy\.reviewActive;/,
    );
    assert.match(
      pageSource,
      /const coffeeTranscriptPermanent = coffeeSessionSurfaceActive;/,
    );
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
      /@media\s*\(min-width:\s*1160px\)\s*\{[\s\S]*\.coffeeShell\[data-session-active="true"\]\[data-transcript-open="true"\]\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(300px,\s*var\(--coffee-transcript-width,\s*340px\)\)\s*;/
    );

    const panelRule = ruleForExactSelector(".coffeeTranscriptPanel");
    assert.match(
      panelRule,
      /width:\s*min\(var\(--coffee-transcript-width,\s*340px\),\s*calc\(100vw - 24px\)\)\s*;/
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

  it("turns the Coffee picker composer into the group creation CTA", () => {
    assert.match(
      pageSource,
      /const coffeeSetupComposerVisible =\s*coffeeSessionPhase === "selecting" && !conversationActive && coffeeSelectedGroup === null;/
    );
    assert.match(pageSource, /const coffeeSetupComposerReady = coffeeSetupComposerVisible && coffeeSelectionValid;/);
    assert.match(
      pageSource,
      /const coffeeSetupComposerStyle:[\s\S]*coffeeGroupVisualStyle\(\{[\s\S]*id: `draft:\$\{coffeeSelectedBotIds\.join\(":"\)\}`,[\s\S]*botGroupIds: coffeeSelectedBotIds,/
    );
    assert.match(
      pageSource,
      /const renderCoffeeSetupComposer = \(\): React\.JSX\.Element => \([\s\S]*data-coffee-setup-composer="true"[\s\S]*void createCoffeeGroupFromSelection\(\);/
    );
    assert.match(
      pageSource,
      /className=\{styles\.coffeeSetupComposerButton\}[\s\S]*disabled=\{!coffeeSetupComposerReady \|\| coffeeBusy\}/
    );
    assert.match(
      pageSource,
      /: coffeeSetupComposerVisible\s*\?\s*renderCoffeeSetupComposer\(\)\s*:\s*coffeeGroupStartComposerVisible\s*\?\s*renderCoffeeGroupStartComposer\(\)\s*:\s*shellPolicy\.reviewActive\s*\?\s*null\s*:\s*renderShellComposer\(\{/
    );

    const setupButtonRule = ruleForExactSelector(".coffeeSetupComposerButton");
    assert.match(setupButtonRule, /grid-template-areas:\s*"eyebrow arrow"\s*"title arrow"\s*"meta arrow"\s*;/);
    assert.match(setupButtonRule, /cursor:\s*not-allowed\s*;/);

    const readyButtonRule = ruleForExactSelector(
      '.coffeeSetupComposer[data-coffee-setup-ready="true"] .coffeeSetupComposerButton'
    );
    assert.match(readyButtonRule, /var\(--coffee-group-gradient\)/);
    assert.match(readyButtonRule, /cursor:\s*pointer\s*;/);

    const lightReadyButtonRule = ruleForExactSelector(
      '.themeLight.coffeeShell .coffeeSetupComposer[data-coffee-setup-ready="true"] .coffeeSetupComposerButton'
    );
    assert.match(lightReadyButtonRule, /var\(--coffee-group-gradient\)/);
  });

  it("uses the full-screen PRISM loader only while creating Coffee Groups", () => {
    const selectionCreationSource = pageSource.slice(
      pageSource.indexOf("const createCoffeeGroupFromSelection"),
      pageSource.indexOf("const createCoffeeGroupFromCurrentSession"),
    );
    const sessionCreationSource = pageSource.slice(
      pageSource.indexOf("const createCoffeeGroupFromCurrentSession"),
      pageSource.indexOf("const startCoffeeSessionFromGroup"),
    );
    assert.match(pageSource, /import \{ PrismBlockingLoader \}/u);
    assert.match(
      pageSource,
      /useState<CoffeeGroupCreationOperation \| null>\(null\)/u,
    );
    assert.match(
      selectionCreationSource,
      /title: "Creating your Coffee Group"[\s\S]*stepLabel: "Reading the table"/u,
    );
    assert.match(
      sessionCreationSource,
      /title: "Saving this Coffee Group"[\s\S]*stepLabel: "Gathering the table"/u,
    );
    assert.match(
      selectionCreationSource,
      /finally \{\s*setCoffeeGroupCreationOperation\(null\);\s*setCoffeeBusy\(false\);/u,
    );
    assert.match(
      sessionCreationSource,
      /finally \{\s*setCoffeeGroupCreationOperation\(null\);\s*setCoffeeBusy\(false\);/u,
    );
    assert.match(
      pageSource,
      /<PrismBlockingLoader[\s\S]*open=\{coffeeGroupCreationOperation !== null\}[\s\S]*theme=\{resolvedTheme\}/u,
    );
    assert.match(
      pageSource,
      /footer="Keep this window open while the table takes shape\."/u,
    );
    assert.doesNotMatch(
      pageSource,
      /<PrismBlockingLoader[\s\S]{0,160}open=\{coffeeBusy\}/u,
    );
  });

  it("uses a larger live table with clear action anchors, spatial nameplates, and bigger mugs", () => {
    const liveStageRule = ruleForExactSelector('.coffeeStage[data-phase="arriving"]');
    assert.match(liveStageRule, /--coffee-canvas-y:\s*clamp\(64px,\s*7vh,\s*80px\)\s*;/);

    const tableGlowRule = ruleForExactSelector(".coffeeTableGlow");
    assert.match(tableGlowRule, /width:\s*min\(84%,\s*760px\)\s*;/);

    const tableDiskRule = ruleForExactSelector(".coffeeTableDisk");
    assert.match(tableDiskRule, /width:\s*min\(58vw,\s*560px\)\s*;/);
    assert.match(tableDiskRule, /max-width:\s*calc\(100% - 56px\)\s*;/);
    assert.match(
      css,
      /@media\s*\(min-width:\s*1160px\)\s*\{[\s\S]*\.coffeeShell\[data-session-active="true"\]\[data-transcript-open="true"\][\s\S]*\.coffeeStage:not\(\[data-coffee-perspective="first-person"\]\):is\([\s\S]*\.coffeeTableGlow\s*\{[\s\S]*width:\s*min\(72%,\s*680px\)\s*;[\s\S]*\.coffeeTableDisk\s*\{[\s\S]*width:\s*min\(54vw,\s*540px\)\s*;[\s\S]*max-width:\s*calc\(100% - 96px\)\s*;/,
      "expected docked Table Talk to scale the round table disk up while preserving edge clearance"
    );
    assert.match(
      css,
      /@media\s*\(min-width:\s*1160px\)\s*\{[\s\S]*\.coffeeShell\[data-session-active="true"\]\[data-transcript-open="true"\][\s\S]*\.coffeeStage\[data-coffee-perspective="first-person"\]:is\([\s\S]*\.coffeeTableScene\s*\{[\s\S]*--coffee-table-asset-width:\s*min\(104cqw,\s*1490px\)\s*;/,
      "expected the first-person raster table to keep filling the narrower live stage"
    );

    const liveTableOffsetRule = ruleForExactSelector(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]'
    );
    assert.match(liveTableOffsetRule, /--coffee-live-table-y:\s*0px\s*;/);

    const autoplayDockRule = ruleForExactSelector(".coffeeAutoplayDock");
    assert.match(autoplayDockRule, /position:\s*absolute\s*;/);
    assert.match(autoplayDockRule, /top:\s*clamp\(14px,\s*2vw,\s*24px\)\s*;/);
    assert.match(autoplayDockRule, /left:\s*clamp\(14px,\s*2vw,\s*24px\)\s*;/);

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
    assert.match(liveLeftSeatRule, /left:\s*24%\s*;/);
    assert.match(liveLeftSeatRule, /top:\s*43%\s*;/);

    const liveRightSeatRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeat[data-seat-count="5"][data-seat="2"][data-layout-seat="2"]'
    );
    assert.match(liveRightSeatRule, /left:\s*76%\s*;/);
    assert.match(liveRightSeatRule, /top:\s*43%\s*;/);

    const liveLowerSeatRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeat[data-seat-count="5"][data-seat="3"][data-layout-seat="3"]'
    );
    assert.match(liveLowerSeatRule, /left:\s*29%\s*;/);
    assert.match(liveLowerSeatRule, /top:\s*79%\s*;/);

    const liveLowerRightSeatRule = ruleForSelectorNeedles(
      '.coffeeStage[data-phase="arriving"][data-autoplay-dock="true"]',
      '.coffeeSeat[data-seat-count="5"][data-seat="4"][data-layout-seat="4"]'
    );
    assert.match(liveLowerRightSeatRule, /left:\s*71%\s*;/);
    assert.match(liveLowerRightSeatRule, /top:\s*79%\s*;/);

    assert.match(
      css,
      /\.coffeeStage\[data-autoplay-dock="true"\]:not\(\[data-compact="true"\]\):not\(\[data-coffee-perspective="first-person"\]\):is\([\s\S]*\.coffeeSeatActionAnchor\[data-seat-count="5"\]\[data-layout-seat="0"\][\s\S]*bottom:\s*calc\(100%\s*\+\s*clamp\(10px,\s*1\.4vw,\s*18px\)\)\s*;[\s\S]*width:\s*min\(270px,\s*34cqw,\s*calc\(100cqw\s*-\s*24px\)\)\s*;/,
      "expected the top action label to stay centered above the top bot"
    );
    assert.match(
      css,
      /\.coffeeSeatActionAnchor:is\([\s\S]*\[data-seat-count="5"\]\[data-layout-seat="1"\][\s\S]*\[data-seat-count="5"\]\[data-layout-seat="3"\][\s\S]*right:\s*calc\(100%\s*\+\s*clamp\(10px,\s*1\.5vw,\s*18px\)\)\s*;[\s\S]*width:\s*min\([\s\S]*210px,[\s\S]*calc\(24cqw\s*-\s*var\(--coffee-action-avatar-half\)\s*-\s*18px\),[\s\S]*calc\(100vw\s*-\s*24px\)[\s\S]*\)\s*;[\s\S]*min-width:\s*0\s*;/,
      "expected left-side action labels to be bounded by the stage edge"
    );
    assert.match(
      css,
      /\.coffeeStage\[data-autoplay-dock="true"\]:not\(\[data-compact="true"\]\):not\(\[data-coffee-perspective="first-person"\]\):is\([\s\S]*\.coffeeSeatActionAnchor\[data-seat-count="5"\] \.coffeeSeatActionBadgeText\s*\{[\s\S]*-webkit-line-clamp:\s*3\s*;[\s\S]*font-size:\s*clamp\(0\.86rem,\s*0\.98vw,\s*1\.08rem\)\s*;/,
      "expected five-seat action text to wrap before it can be clipped"
    );

    const actionAnchorRule = ruleForExactSelector(".coffeeSeatActionAnchor");
    assert.match(
      actionAnchorRule,
      /width:\s*var\(--coffee-seat-avatar-size,[\s\S]*--coffee-seat-responsive-avatar-size/
    );
    assert.match(
      actionAnchorRule,
      /height:\s*var\(--coffee-seat-avatar-size,[\s\S]*--coffee-seat-responsive-avatar-size/
    );

    const nameplateRules = rulesForExactSelector(".coffeeSeatGlowPill");
    assert.ok(
      nameplateRules.some((rule) =>
        /--coffee-seat-name-plate-y:\s*clamp\(-42px,\s*-3\.65cqw,\s*-26px\)\s*;/.test(rule)
      ),
      "expected nameplates to sit below the prose corridor"
    );
    assert.ok(
      nameplateRules.some((rule) => /--coffee-seat-glyph-slot-width:\s*30px\s*;/.test(rule)),
      "expected the compact nameplate glyph slot to preserve room for the bot name"
    );
    assert.ok(
      nameplateRules.some((rule) =>
        /--coffee-seat-cup-slot-width:\s*clamp\(52px,\s*4\.6cqw,\s*60px\)\s*;/.test(rule)
      ),
      "expected the table-facing mug slot to stay bounded"
    );
    assert.ok(
      nameplateRules.some((rule) =>
        /--coffee-seat-name-plate-width:\s*clamp\(204px,\s*17cqw,\s*232px\)\s*;/.test(rule) &&
        /width:\s*var\(--coffee-seat-name-plate-width\)\s*;/.test(rule) &&
        /grid-template-columns:\s*var\(--coffee-seat-glyph-slot-width\)\s*minmax\(0,\s*1fr\)\s*var\(--coffee-seat-cup-slot-width\)\s*;/.test(rule)
      ),
      "expected a bounded nameplate with flexible, truncating name space"
    );
    assert.ok(
      nameplateRules.some((rule) =>
        /--coffee-seat-name-glyph-size:\s*clamp\(24px,\s*calc\(var\(--coffee-seat-glyph-slot-width\)\s*\*\s*0\.86\),\s*32px\)\s*;/.test(rule)
      ),
      "expected nameplate body glyph size to stay proportional to the glyph slot"
    );
    assert.ok(
      nameplateRules.some((rule) =>
        /--coffee-seat-name-glyph-gap:\s*4px\s*;/.test(rule) &&
        /column-gap:\s*var\(--coffee-seat-name-glyph-gap\)\s*;/.test(rule)
      ),
      "expected nameplates to tighten the gap between glyph and name"
    );
    assert.match(
      pageSource,
      /className=\{styles\.coffeeSeatGlowGlyph\}[\s\S]*<BotGlyph name=\{seatGlyphName\} size=\{30\} strokeWidth=\{1\.58\}/
    );
    const nameGlyphRule = ruleForExactSelector(".coffeeSeatGlowGlyph svg");
    assert.match(nameGlyphRule, /width:\s*var\(--coffee-seat-name-glyph-size\)\s*;/);
    assert.match(nameGlyphRule, /height:\s*var\(--coffee-seat-name-glyph-size\)\s*;/);

    const nameTextRule = ruleForExactSelector(".coffeeSeatGlowText");
    assert.match(nameTextRule, /justify-items:\s*start\s*;/);
    assert.match(nameTextRule, /text-align:\s*left\s*;/);

    const flippedNameTextRule = ruleForExactSelector(
      '.coffeeSeat[data-cup-side="left"] .coffeeSeatGlowText'
    );
    assert.match(flippedNameTextRule, /justify-items:\s*end\s*;/);
    assert.match(flippedNameTextRule, /text-align:\s*right\s*;/);

    const flippedNameplateRule = ruleForExactSelector(
      '.coffeeSeat[data-cup-side="left"] .coffeeSeatGlowPill'
    );
    assert.match(
      flippedNameplateRule,
      /grid-template-columns:\s*var\(--coffee-seat-cup-slot-width\)\s*minmax\(0,\s*1fr\)\s*var\(--coffee-seat-glyph-slot-width\)\s*;/
    );

    const mugRule = ruleForExactSelector(".coffeeCup");
    assert.match(mugRule, /--coffee-cup-side-offset:\s*clamp\(-16px,\s*-1\.35vw,\s*-8px\)\s*;/);
    assert.match(mugRule, /--coffee-cup-sip-x:\s*clamp\(-36px,\s*-2\.7vw,\s*-24px\)\s*;/);
    assert.match(mugRule, /--coffee-cup-sip-y:\s*clamp\(-10px,\s*-0\.75vw,\s*-6px\)\s*;/);
    assert.match(mugRule, /width:\s*clamp\(52px,\s*6vw,\s*70px\)\s*;/);
    assert.match(mugRule, /height:\s*clamp\(60px,\s*6\.9vw,\s*82px\)\s*;/);

    const leftMugRule = ruleForExactSelector('.coffeeCup[data-cup-side="left"]');
    assert.match(leftMugRule, /--coffee-cup-sip-x:\s*clamp\(24px,\s*2\.7vw,\s*36px\)\s*;/);
    assert.match(
      pageSource,
      /coffeeCupSipTranslationForMouth\(\{[\s\S]{0,280}cupRect:\s*node\.getBoundingClientRect\(\)[\s\S]{0,180}mouthRect:\s*mouth\.getBoundingClientRect\(\)/,
    );
    assert.match(
      pageSource,
      /querySelector<HTMLElement>\(\s*'\[data-coffee-plate-emoji-part="mouth"\]'/,
    );
    assert.match(
      pageSource,
      /node\.style\.setProperty\(\s*"--coffee-cup-sip-x"[\s\S]{0,220}node\.style\.setProperty\(\s*"--coffee-cup-sip-y"/,
    );
  });

  it("selects first-person Coffee automatically while keeping current Coffee settings discoverable", () => {
    const perspectiveDeclarationIndex = pageSource.indexOf(
      "const coffeeFirstPersonPerspective =",
    );
    const gazeSeatLayoutIndex = pageSource.indexOf(
      "const coffeeGazeVisibleSeats =",
    );
    assert.ok(perspectiveDeclarationIndex >= 0);
    assert.ok(gazeSeatLayoutIndex >= 0);
    assert.ok(
      perspectiveDeclarationIndex < gazeSeatLayoutIndex,
      "first-person perspective must be initialized before draft Coffee seats calculate gaze geometry",
    );
    assert.match(
      pageSource,
      /const coffeeFirstPersonPerspective =[\s\S]*?!coffeeReplayActive[\s\S]*?coffeeSessionPhase === "arriving"[\s\S]*?coffeeSessionPhase === "live"/
    );
    assert.match(
      pageSource,
      /data-coffee-perspective=\{[\s\S]*?coffeeFirstPersonPerspective \? "first-person" : "third-person"/
    );
    assert.doesNotMatch(pageSource, /data-experimental-table-angle/);
    assert.doesNotMatch(pageSource, /coffeeExperimentalTableAngleEnabled/);
    assert.match(settingsPanelSource, /scope:\s*"coffee"/u);
    assert.match(pageSource, /data-settings-section="coffee"[\s\S]*Open Coffee Groups/u);
  });

  it("docks the Coffee pot directly above the composer", () => {
    assert.match(
      pageSource,
      /const coffeePotVisible =[\s\S]*conversationActive[\s\S]*coffeeSessionPhase === "arriving"[\s\S]*coffeeSessionPhase === "live"[\s\S]*!previewingSession[\s\S]*!coffeeReplayActive[\s\S]*coffeeBarRitual\?\.role === "pot";/
    );
    assert.match(
      pageSource,
      /const coffeePotComposerDockVisible =[\s\S]*coffeeSessionPhase === "arriving"[\s\S]*coffeeSessionPhase === "live"[\s\S]*!coffeeReplayActive[\s\S]*coffeeConversation\?\.coffeeSettings\?\.barRitual\?\.role === "pot";/
    );
    assert.match(
      pageSource,
      /topContent:\s*coffeePotComposerDockVisible\s*\|\|\s*coffeeShhVisible\s*\?\s*\(/
    );
    assert.match(pageSource, /className=\{styles\.coffeePotComposerDock\}/);
    assert.match(pageSource, /const coffeePotAssetTheme: CoffeePotAssetTheme = resolvedTheme;/);
    assert.match(pageSource, /data-coffee-pot-theme=\{coffeePotAssetTheme\}/);
    assert.match(pageSource, /coffeePotRestImageUrl\(coffeePotAssetTheme\)/);
    assert.match(pageSource, /coffeePotPourImageUrl\(coffeePotAssetTheme\)/);
    assert.match(
      pageSource,
      /coffeePotPourFrameImageUrl\(\s*coffeePotAssetTheme\s*,\s*frameIndex\s*,?\s*\)/
    );
    assert.doesNotMatch(
      pageSource,
      /coffeePot(?:Rest|Pour|PourFrame)ImageUrl\(resolvedTheme/
    );

    const potLayerRule = ruleForExactSelector(".coffeePotLayer");
    assert.match(potLayerRule, /position:\s*absolute\s*;/);
    assert.match(potLayerRule, /z-index:\s*3\s*;/);
    assert.match(potLayerRule, /--coffee-pot-pour-stream-blend-mode:\s*normal\s*;/);
    assert.match(potLayerRule, /--coffee-pot-pour-highlight:\s*rgba\(255,\s*154,\s*52,\s*0\.88\)\s*;/);
    assert.match(potLayerRule, /brightness\(1\.04\)/);

    const lightPotLayerRule = ruleForExactSelector(
      '.coffeePotLayer[data-coffee-pot-theme="light"]'
    );
    assert.match(lightPotLayerRule, /--coffee-pot-pour-stream-blend-mode:\s*normal\s*;/);
    assert.match(lightPotLayerRule, /saturate\(1\.08\)/);

    const potDockRule = ruleForExactSelector(".coffeePotComposerDock");
    assert.match(potDockRule, /left:\s*clamp\(18px,\s*2\.2vw,\s*30px\)\s*;/);
    assert.match(
      potDockRule,
      /bottom:\s*calc\(100%\s*\+\s*clamp\(6px,\s*0\.7vw,\s*10px\)\)\s*;/
    );

    const globalComposerRule = ruleForExactSelector(".coffeeGlobalComposer");
    assert.match(globalComposerRule, /position:\s*relative\s*;/);

    const potTrayRule = ruleForExactSelector(".coffeePotTray");
    assert.match(potTrayRule, /position:\s*relative\s*;/);
    assert.match(potTrayRule, /width:\s*clamp\(54px,\s*6\.6vw,\s*84px\)\s*;/);
    assert.match(potTrayRule, /height:\s*clamp\(46px,\s*5\.4vw,\s*70px\)\s*;/);

    const potImageRule = ruleForExactSelector(".coffeePotTray img");
    assert.match(potImageRule, /width:\s*116%\s*;/);
    assert.match(potImageRule, /height:\s*116%\s*;/);

    const potDragRule = ruleForExactSelector(".coffeePotDrag");
    assert.match(potDragRule, /position:\s*absolute\s*;/);
    assert.match(potDragRule, /--coffee-pot-drag-size:\s*clamp\(63px,\s*7\.65vw,\s*97px\)\s*;/);
    assert.doesNotMatch(css, /coffee-pot-composer-reserve/);
    assert.doesNotMatch(pageSource, /stageRect:\s*DOMRect/);
    assert.match(
      pageSource,
      /const dragPoint = coffeePotScenePointFromClient\(\s*event\.clientX\s*,\s*event\.clientY\s*,?\s*\);[\s\S]*x:\s*dragPoint\.x,[\s\S]*y:\s*dragPoint\.y,/
    );
    assert.match(pageSource, /ref=\{coffeeTableSceneRef\}/);
    assert.match(pageSource, /ref=\{coffeeCenterMessageRef\}/);
    assert.match(pageSource, /coffeePotPointOutsideExclusion\(\{/);
    assert.match(pageSource, /data-coffee-pot-drag-exclusion="center-text"/);
    assert.match(pageSource, /data-coffee-pot-drag-exclusion="nameplate"/);
    assert.match(
      pageSource,
      /querySelectorAll<HTMLElement>\(\s*'\[data-coffee-pot-drag-exclusion="nameplate"\]'\s*,?\s*\)/
    );
    assert.match(pageSource, /paddingPx:\s*28/);
    assert.match(
      pageSource,
      /const coffeePotScenePointFromClient =[\s\S]*coffeeTableSceneRef\.current\?\.getBoundingClientRect\(\)[\s\S]*clientX - \(sceneRect\?\.left \?\? 0\)[\s\S]*clientY - \(sceneRect\?\.top \?\? 0\)/
    );

    const tableSceneIndex = pageSource.indexOf("ref={coffeeTableSceneRef}");
    const potLayerIndex = pageSource.indexOf("className={styles.coffeePotLayer}");
    const canvasPickerIndex = pageSource.indexOf("className={styles.coffeeCanvasPicker}");
    assert.ok(tableSceneIndex >= 0 && potLayerIndex > tableSceneIndex);
    assert.ok(canvasPickerIndex > potLayerIndex, "expected the dragged pot inside the table scene");

    const coffeeSeatRule = ruleForExactSelector(".coffeeSeat");
    assert.match(coffeeSeatRule, /z-index:\s*5\s*;/);

    const potPourFrameRule = ruleForExactSelector(".coffeePotPourStreamFrame");
    assert.match(
      potPourFrameRule,
      /mix-blend-mode:\s*var\(--coffee-pot-pour-stream-blend-mode,\s*normal\)\s*;/
    );
    assert.match(
      potPourFrameRule,
      /filter:\s*var\(--coffee-pot-pour-stream-filter\)\s*;/
    );

    const pourStreamRule = ruleForExactSelector(".coffeePotPourStream");
    assert.match(pourStreamRule, /right:\s*6%\s*;/);

    const pouringPotRule = ruleForExactSelector('.coffeePotDrag[data-pouring="true"]');
    assert.match(pouringPotRule, /--coffee-pot-drag-rotate:\s*0deg\s*;/);

    const pourCoreRule = ruleForExactSelector(".coffeePotPourStream::before");
    assert.match(pourCoreRule, /--coffee-pot-pour-highlight/);
    assert.match(pourCoreRule, /animation:\s*coffeePotPourCorePulse 520ms ease-in-out infinite alternate\s*;/);

    const pourLandingRule = ruleForExactSelector(".coffeePotPourStream::after");
    assert.match(pourLandingRule, /animation:\s*coffeePotPourLandingPulse 560ms ease-out infinite\s*;/);

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

  it("keeps Coffee turns organic while preserving autoplay and Enter submission", () => {
    assert.doesNotMatch(pageSource, /directorTapEnabled/);
    assert.doesNotMatch(pageSource, /triggerDirectedCoffeeTurn/);
    assert.doesNotMatch(pageSource, /queueDirectedCoffeeTurn/);
    assert.doesNotMatch(pageSource, /toggleCoffeeAutoplay/);
    assert.doesNotMatch(pageSource, /data-director-enabled/);
    assert.doesNotMatch(pageSource, /Pause bot autoplay for director mode/);
    assert.doesNotMatch(css, /data-director-enabled/);
    assert.match(
      pageSource,
      /Bots take turns naturally as the conversation unfolds\./
    );
    assert.match(
      pageSource,
      /const startAutonomousTurn = \(\) => \{[\s\S]*coffeeLoopTimerRef\.current = null;[\s\S]*coffeeTurnAbortRef\.current !== null[\s\S]*coffeeContinueAbortRef\.current !== null[\s\S]*coffeeArrivalAutoplayRetryDelayMs/
    );
    assert.match(pageSource, /coffeeAutoplayWatchdogShouldWake\(\{/);
    assert.match(pageSource, /coffeeAutoplayForceTurnShouldRun\(\{/);
    assert.match(pageSource, /coffeeLoopTimerOwnsAutoplayTurn\(\{/);
    assert.match(pageSource, /coffeeLoopDeadlineMsRef\.current = Date\.now\(\) \+ boundedDelayMs;/);
    assert.match(pageSource, /void continueCoffeeSessionRef\.current\(activeConversation\.id, endsAt\);/);
    assert.match(
      pageSource,
      /coffeeEmptyTurnAutoplayRetryDelayMs\(\{[\s\S]*stale:\s*response\.stale,[\s\S]*scheduleCoffeeAutonomousTurnWhenRhythmReady/
    );
    assert.doesNotMatch(
      pageSource,
      /if \(!conversationId \|\| coffeeBusy \|\| coffeeAutoBusy\) return;/
    );
    assert.match(
      pageSource,
      /event\.key !== "ArrowUp" && event\.key !== "Enter"[\s\S]*void sendCoffeeTurn\(\);/
    );
    assert.match(pageSource, /coffeeDraftRef\.current = "";\s+setCoffeeDraft\(""\);/);
    assert.match(pageSource, /coffeeConversationRef\.current = args\.conversation;\s+setCoffeeConversation\(args\.conversation\);/);
  });

  it("puts the cup down before showing thinking while blocking refusal, pot filling, and pending speech", () => {
    assert.match(pageSource, /const COFFEE_CUP_REFILL_SIP_LOCK_MS = 3_200;/);
    assert.match(pageSource, /const refillSipLocked = refillSipLockUntilMs > coffeeCupClockMs;/);
    assert.match(
      pageSource,
      /const visualSeatSipInProgress = coffeeCupRefused \|\| refillSipLocked \|\| coffeeSipTalkGateActive \? false : seatSipInProgress;/,
    );
    assert.match(pageSource, /sipLockedUntilMs: refillSipLockUntilMs \|\| null,/);
    assert.match(
      pageSource,
      /refillSipLocked \|\| coffeeSipTalkGateActive \|\| !seatIsFirmlySeated/,
    );
    assert.match(
      pageSource,
      /await waitForActiveCoffeeSipBeforeTalk\( coffeeCupElementByBotIdRef\.current\.get\(args\.speakerBotId\), \);/,
    );
    assert.match(
      pageSource,
      /data-cup-sip-duration-ms=\{\s*coffeeCupVisual\.sipAnimationMs\s*\}/,
    );
    assert.match(
      pageSource,
      /const seatThinkingVisualActive =\s*seatIsThinkingThisSeat && !coffeeCupVisual\.sipping;/,
    );
    assert.match(
      pageSource,
      /avatarSfxState=\{[\s\S]{0,180}: seatThinkingVisualActive\s*\? "thinking"/,
    );
    assert.match(
      pageSource,
      /showThinkingSpinner=\{seatThinkingVisualActive\}/,
    );
  });

  it("centers the thinking slash spinner within the bot face screen", () => {
    assert.match(coffeeSeatPlateEmojiSource, /const COFFEE_SEAT_THINKING_SPINNER_FRAME_MS = 142;/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /\(index\) => \(index \+ 1\) % normalizedThinkingFrames\.length/
    );
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /COFFEE_SEAT_THINKING_SPINNER_FRAMES/);
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
    assert.match(frameRule, /--crt-glyph-core-paint-bleed:\s*0\.16em\s*;/);
    assert.match(frameRule, /inline-size:\s*calc\(/);
    assert.match(frameRule, /var\(--coffee-face-single-glyph-paint-pad-inline,\s*0em\)/);
    assert.match(frameRule, /block-size:\s*calc\(/);
    assert.match(frameRule, /var\(--coffee-face-single-glyph-paint-pad-block,\s*0em\)/);
    assert.match(frameRule, /margin-inline:\s*calc\(var\(--coffee-face-single-glyph-paint-pad-inline,\s*0em\) \* -1\)\s*;/);
    assert.match(frameRule, /margin-block:\s*calc\(var\(--coffee-face-single-glyph-paint-pad-block,\s*0em\) \* -1\)\s*;/);
    assert.match(frameRule, /overflow:\s*visible\s*;/);
    assert.match(frameRule, /line-height:\s*1\s*;/);
    assert.match(frameRule, /text-align:\s*center\s*;/);
    assert.match(frameRule, /transform:\s*none\s*;/);
  });

  it("renders question marks as a larger single face glyph with a slight upward nudge", () => {
    assert.match(coffeeSeatPlateEmojiSource, /showQuestionMark\?: boolean/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const questionGlyphActive = !thinkingSpinnerActive && showQuestionMark;/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-question-glyph=\{\s*questionGlyphActive \? "true" : undefined\s*\}/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-question-frame="true"/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-font=\{faceMouthFont \?\? faceEyesFont \?\? undefined\}/
    );
    assert.match(coffeeSeatPlateEmojiSource, /const displayGlyphCount =/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-emoji-glyphs=\{displayGlyphCount\}/
    );

    const questionRootRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji[data-coffee-plate-question-glyph="true"]'
    );
    assert.match(questionRootRule, /grid-template-columns:\s*1em\s*;/);
    assert.match(questionRootRule, /grid-template-rows:\s*1em\s*;/);
    assert.match(questionRootRule, /place-self:\s*center\s*;/);
    assert.match(questionRootRule, /--coffee-plate-emoji-nudge-y:\s*-0\.02em\s*;/);
    assert.match(questionRootRule, /letter-spacing:\s*0\s*;/);

    const questionFrameRule = ruleForExactSelector(
      ".coffeeSeatPlateEmoji [data-coffee-plate-question-frame]"
    );
    assert.match(questionFrameRule, /display:\s*grid\s*;/);
    assert.match(questionFrameRule, /place-items:\s*center\s*;/);
    assert.match(questionFrameRule, /--crt-glyph-core-paint-bleed:\s*0\.16em\s*;/);
    assert.match(questionFrameRule, /inline-size:\s*calc\(/);
    assert.match(questionFrameRule, /var\(--coffee-face-single-glyph-paint-pad-inline,\s*0em\)/);
    assert.match(questionFrameRule, /block-size:\s*calc\(/);
    assert.match(questionFrameRule, /var\(--coffee-face-single-glyph-paint-pad-block,\s*0em\)/);
    assert.match(questionFrameRule, /overflow:\s*visible\s*;/);
    assert.match(questionFrameRule, /font-weight:\s*840\s*;/);
    assert.match(questionFrameRule, /letter-spacing:\s*0\s*;/);
    assert.match(questionFrameRule, /transform:\s*translateY\(-0\.015em\)\s*;/);

    const questionMouthFontRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji [data-coffee-plate-question-frame][data-face-font="playful"]'
    );
    assert.match(questionMouthFontRule, /font-family:\s*var\(--font-playful-display\)/);

    const liveQuestionRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph[data-coffee-plate-question-glyph="true"]'
    );
    assert.match(
      liveQuestionRule,
      /font-size:\s*var\(\s*--zen-live-bot-avatar-question-glyph-size,\s*clamp\(2\.35rem,\s*calc\(var\(--zen-live-bot-body-frame-size,\s*190px\) \* 0\.275\),\s*5\.25rem\)\s*\)\s*;/
    );
  });
});
