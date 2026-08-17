import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { coffeeSeatThinkingPresentationActive } from "./coffee-seat-thinking-presentation.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const rendererSource = readFileSync(
  new URL("./CoffeeSeatPlateEmoji.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("Coffee thinking replaces the face with its authored spinner only", () => {
  const spinnerStart = rendererSource.indexOf("{thinkingSpinnerActive ? (");
  const questionStart = rendererSource.indexOf(
    ") : questionGlyphActive ? (",
    spinnerStart,
  );
  assert.notEqual(spinnerStart, -1);
  assert.notEqual(questionStart, -1);

  const spinnerBranch = rendererSource.slice(spinnerStart, questionStart);
  assert.match(spinnerBranch, /data-coffee-plate-thinking-frame="true"/u);
  assert.match(spinnerBranch, /<CrtPixelTextGlyph/u);
  assert.doesNotMatch(spinnerBranch, /data-coffee-plate-emoji-part/u);
  assert.doesNotMatch(spinnerBranch, /data-face-mouth-character/u);

  assert.match(
    pageSource,
    /const directionIndependentThinkingScreen = thinkingSpinnerActive \? \(/u,
  );
  const directionIndependentStart = pageSource.indexOf(
    "const directionIndependentThinkingScreen = thinkingSpinnerActive ? (",
  );
  const microFallbackStart = pageSource.indexOf(
    "if (microFallbackActive)",
    directionIndependentStart,
  );
  assert.notEqual(directionIndependentStart, -1);
  assert.notEqual(microFallbackStart, -1);
  const directionIndependentBranch = pageSource.slice(
    directionIndependentStart,
    microFallbackStart,
  );
  assert.match(directionIndependentBranch, /showThinkingSpinner/u);
  assert.match(directionIndependentBranch, /<CoffeeSeatPlateEmoji\s+enabled/u);
  assert.match(
    directionIndependentBranch,
    /faceThinkingFrames=\{faceStyle\.thinkingFrames\}/u,
  );
  assert.match(
    directionIndependentBranch,
    /faceThinkingScale=\{faceStyle\.thinkingScale\}/u,
  );
  assert.match(
    directionIndependentBranch,
    /faceThinkingOffsetX=\{faceStyle\.thinkingOffsetX\}/u,
  );
  assert.match(
    directionIndependentBranch,
    /faceThinkingOffsetY=\{faceStyle\.thinkingOffsetY\}/u,
  );
  assert.match(
    pageSource,
    /\{directionIndependentThinkingScreen \?\? \(/u,
  );

  assert.match(
    pageSource,
    /mannequinProps=\{\{[\s\S]{0,1800}showThinkingSpinner:\s*seatThinkingVisualActive/u,
  );
  const renderKeyStart = pageSource.indexOf(
    "const coffeeSeatAvatarRenderKey = coffeeSeatAvatarViewModelKey({",
  );
  const renderKeyEnd = pageSource.indexOf("\n              });", renderKeyStart);
  assert.notEqual(renderKeyStart, -1);
  assert.notEqual(renderKeyEnd, -1);
  assert.match(
    pageSource.slice(renderKeyStart, renderKeyEnd),
    /thinking:\s*seatThinkingVisualActive/u,
  );
  assert.match(
    pageSource,
    /minimumRenderedSizeTier:\s*coffeeLiveMinimumRenderedSizeTier/u,
  );
  assert.match(
    pageSource,
    /const thinkingBotId = coffeeLiveSeatThinkingBotId\(\{/u,
  );
  assert.doesNotMatch(
    pageSource,
    /const showThinkingIndicator =[\s\S]{0,180}!userLineTyping/u,
  );
  assert.doesNotMatch(pageSource, /coffeeSeatThinkingIndicator/u);
  assert.doesNotMatch(cssSource, /coffeeSeatThinkingIndicator/u);
  assert.doesNotMatch(
    cssSource,
    /\.zenLiveBotPresenceThinkingGlyphAnchor::(?:before|after)/u,
  );

  const anchorMatch = cssSource.match(
    /\.zenLiveBotPresenceThinkingGlyphAnchor \{\s*position:\s*absolute;[\s\S]*?\n\}/u,
  );
  assert.ok(anchorMatch);
  const anchorStart = anchorMatch.index ?? -1;
  const spinnerStartCss = cssSource.indexOf(
    '.zenLiveBotPresenceThinkingGlyph[data-coffee-plate-thinking-spinner="true"] {',
    anchorStart,
  );
  const spinnerEndCss = cssSource.indexOf("\n}", spinnerStartCss);
  assert.notEqual(anchorStart, -1);
  assert.notEqual(spinnerStartCss, -1);
  const anchorRule = anchorMatch[0];
  const spinnerRule = cssSource.slice(spinnerStartCss, spinnerEndCss + 2);
  assert.match(anchorRule, /left:\s*50%/u);
  assert.match(anchorRule, /transform:\s*translate\(-50%,\s*-50%\)/u);
  assert.doesNotMatch(anchorRule, /scaleX|rotate/u);
  assert.match(
    spinnerRule,
    /font-size:\s*var\(--zen-live-bot-avatar-thinking-glyph-size,\s*27\.5cqw\)/u,
  );

  assert.match(
    cssSource,
    /\[data-coffee-plate-thinking-frame\][\s\S]{0,1800}transform:\s*translate\(\s*var\(--bot-face-thinking-offset-x,\s*0em\),\s*var\(--bot-face-thinking-offset-y,\s*0em\)\s*\)\s*scale\(var\(--bot-face-thinking-scale,\s*1\)\)/u,
  );
});

test("compact Coffee seats keep authored thinking content instead of falling back to the normal face", () => {
  assert.equal(
    coffeeSeatThinkingPresentationActive({
      showThinkingSpinner: true,
      isTalking: false,
      thinkingSpinnerDisabled: false,
    }),
    true,
  );
  assert.equal(
    coffeeSeatThinkingPresentationActive({
      showThinkingSpinner: true,
      isTalking: true,
      thinkingSpinnerDisabled: false,
    }),
    false,
  );
});

test("Coffee does not schedule a closed phase for the default blank blink", () => {
  assert.match(
    rendererSource,
    /const faceBlinkDisabled = coffeeSeatBlinkKeepsFaceStill\(\s*normalizedFaceBlinkBar,\s*\);/u,
  );
  assert.match(
    rendererSource,
    /if \(\s*!blinkEnabled \|\|\s*faceBlinkDisabled \|\|/u,
  );
});
