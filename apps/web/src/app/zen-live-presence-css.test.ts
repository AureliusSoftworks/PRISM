import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "page.module.css");
const pagePath = join(dirname(fileURLToPath(import.meta.url)), "page.tsx");
const css = readFileSync(cssPath, "utf8");
const pageSource = readFileSync(pagePath, "utf8");

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

describe("Zen live presence CSS", () => {
  it("keeps the rail passive while the visible avatar remains draggable", () => {
    const railRule = ruleForExactSelector(".zenLiveActionStatusRail");
    assert.match(railRule, /pointer-events:\s*none\s*;/);

    const plateRule = ruleForExactSelector(".zenLiveBotPresencePlate");
    assert.match(plateRule, /pointer-events:\s*auto\s*;/);
    assert.match(plateRule, /cursor:\s*default\s*;/);
    assert.match(plateRule, /touch-action:\s*none\s*;/);
    assert.match(plateRule, /user-select:\s*none\s*;/);

    const childRule = ruleForExactSelector(".zenLiveBotPresencePlate *");
    assert.match(childRule, /pointer-events:\s*none\s*;/);

    const bodyRule = ruleForExactSelector(".zenLiveBotPresenceBody");
    assert.match(bodyRule, /pointer-events:\s*none\s*;/);
    assert.match(bodyRule, /cursor:\s*default\s*;/);

    const hitTargetRule = ruleForExactSelector(".zenLiveBotPresenceHitTarget");
    assert.match(hitTargetRule, /pointer-events:\s*auto\s*;/);
    assert.match(hitTargetRule, /cursor:\s*grab\s*;/);
    assert.match(hitTargetRule, /touch-action:\s*none\s*;/);
  });

  it("locks the body and face placement to the final composed bot frame", () => {
    assert.match(pageSource, /const ZEN_LIVE_BOT_LOCKED_BODY_SIZE_PX = 190;/);
    assert.match(pageSource, /xPct:\s*76\.81,/);
    assert.match(pageSource, /yPct:\s*-38\.51,/);
    assert.match(pageSource, /xPct:\s*93\.0,/);
    assert.match(pageSource, /yPct:\s*92\.5,/);
    assert.match(pageSource, /scale:\s*1\.68,/);
    assert.match(
      pageSource,
      /"--zen-live-bot-avatar-body-size":\s*`\$\{bodySize\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-copy-center-anchor":\s*`\$\{Math\.round\(bodySize \* 0\.5\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-copy-vertical-anchor":\s*`\$\{Math\.round\(bodySize \* 1\.08\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-copy-top-anchor":\s*`\$\{Math\.round\(bodySize \* -0\.06\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-copy-side-anchor":\s*`\$\{Math\.round\(bodySize \* 0\.58\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-glyph-x-anchor":\s*`\$\{Math\.round\(bodySize \* 0\.5\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-glyph-y-anchor":\s*`\$\{Math\.round\(bodySize \* 0\.78\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-face-scale":\s*facePlacement\.scale/
    );
    assert.doesNotMatch(pageSource, /readZenLiveBotBodySize/);
    assert.doesNotMatch(pageSource, /readZenLiveBotFacePlacement/);
    assert.doesNotMatch(pageSource, /facePlacementScope/);
  });

  it("keeps body raster and face as fixed non-editable layers", () => {
    const bodyRule = ruleForExactSelector(".zenLiveBotPresenceBody");
    assert.match(bodyRule, /--zen-live-bot-body-frame-size:\s*var\(/);
    assert.match(bodyRule, /--zen-live-bot-avatar-body-size,/);
    assert.match(bodyRule, /z-index:\s*8\s*;/);
    assert.match(bodyRule, /width:\s*var\(--zen-live-bot-avatar-size,/);
    assert.match(bodyRule, /aspect-ratio:\s*1\s*;/);
    assert.match(bodyRule, /translateX\(calc\(var\(--zen-live-bot-body-x,\s*50%\)\s*-\s*50%\)\)/);
    assert.match(bodyRule, /translateY\(calc\(var\(--zen-live-bot-body-y,\s*50%\)\s*-\s*50%\)\)/);
    assert.doesNotMatch(bodyRule, /drop-shadow/);
    assert.match(bodyRule, /will-change:\s*transform\s*;/);

    const faceRigRule = ruleForExactSelector(".zenLiveBotPresenceFaceRig");
    assert.match(faceRigRule, /left:\s*var\(--zen-live-bot-face-x,\s*50%\)/);
    assert.match(faceRigRule, /top:\s*var\(--zen-live-bot-face-y,\s*50%\)/);
    assert.match(faceRigRule, /scale\(var\(--zen-live-bot-face-scale,\s*1\)\)/);
    assert.match(faceRigRule, /pointer-events:\s*none\s*;/);
    assert.doesNotMatch(faceRigRule, /cursor:\s*move\s*;/);

    const bodyStart = pageSource.indexOf("className={styles.zenLiveBotPresenceBody}");
    assert.notEqual(bodyStart, -1);
    const faceRigStart = pageSource.indexOf("className={styles.zenLiveBotPresenceFaceRig}", bodyStart);
    assert.notEqual(faceRigStart, -1);
    const botGlyphStart = pageSource.indexOf("<BotGlyph", faceRigStart);
    assert.notEqual(botGlyphStart, -1);
    const bodyBeforeFaceRig = pageSource.slice(bodyStart, faceRigStart);
    const faceRigMarkup = pageSource.slice(faceRigStart, botGlyphStart);
    assert.doesNotMatch(bodyBeforeFaceRig, /BotFaceScreenTexture/);
    assert.doesNotMatch(faceRigMarkup, /BotFaceScreenTexture/);
    assert.match(faceRigMarkup, /<CoffeeSeatPlateEmoji/);

    const rasterRule = ruleForExactSelector(".zenLiveBotPresenceBodyRaster");
    assert.match(rasterRule, /--bot-body-raster-mask-image:\s*[\s\S]*radial-gradient\(circle at 50% 45%, #000 0 40%/);
    assert.match(rasterRule, /radial-gradient\(circle at 50% 78%/);
    assert.match(rasterRule, /-webkit-mask-image:\s*var\(--bot-body-raster-mask-image\)/);
    assert.match(rasterRule, /mask-image:\s*var\(--bot-body-raster-mask-image\)/);
    assert.match(rasterRule, /mask-size:\s*var\(--bot-body-raster-mask-size\)\s*;/);
    assert.match(rasterRule, /mask-repeat:\s*var\(--bot-body-raster-mask-repeat\)\s*;/);

    const faceRule = ruleForExactSelector(".zenLiveBotPresenceFace");
    assert.match(faceRule, /--bot-face-frame-glow-filter:\s*[\s\S]*drop-shadow/);
    assert.match(faceRule, /--bot-face-frame-inset:\s*0\s*;/);
    assert.match(faceRule, /box-shadow:\s*none\s*;/);
    assert.match(faceRule, /width:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(faceRule, /height:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(faceRule, /pointer-events:\s*none\s*;/);
    assert.doesNotMatch(faceRule, /cursor:\s*grab\s*;/);

    const faceGlyphRule = ruleForExactSelector(".coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph");
    assert.match(faceGlyphRule, /clamp\(1\.74rem,\s*5\.15vw,\s*2\.58rem\)/);

    assert.doesNotMatch(pageSource, /BotFaceScreenTexture/);
    assert.doesNotMatch(css, /\.botFaceScreenTexture/);
    assert.doesNotMatch(css, /\.zenLiveBotPresenceScreenTexture/);
    assert.doesNotMatch(css, /bot-face-screen-texture/);
    assert.doesNotMatch(css, /bot-frame-lcd-refraction/);

    const metalLightRule = ruleForExactSelector(".botFaceFrameMetalLight");
    assert.match(metalLightRule, /z-index:\s*var\(--bot-face-metal-light-z,\s*6\)/);

    const frameRule = ruleForExactSelector(".botFaceFrame");
    assert.match(frameRule, /var\(--bot-face-frame-glow-filter,\s*drop-shadow\(0 0 0 transparent\)\)/);
  });

  it("removes temporary calibration handles and drag affordances", () => {
    assert.doesNotMatch(pageSource, /data-zen-live-bot-resize-handle="true"/);
    assert.doesNotMatch(pageSource, /data-zen-live-bot-face-resize-handle="true"/);
    assert.doesNotMatch(pageSource, /className=\{styles\.zenLiveBotPresenceResizeHandle\}/);
    assert.doesNotMatch(pageSource, /className=\{styles\.zenLiveBotPresenceFaceResizeHandle\}/);
    assert.doesNotMatch(pageSource, /data-body-dragging=/);
    assert.doesNotMatch(pageSource, /data-face-dragging=/);
    assert.doesNotMatch(pageSource, /data-face-resizing=/);
    assert.doesNotMatch(pageSource, /data-resizing=/);
    assert.doesNotMatch(css, /\.zenLiveBotPresenceResizeHandle/);
    assert.doesNotMatch(css, /\.zenLiveBotPresenceFaceResizeHandle/);
  });

  it("places the bot glyph on the body badge, not inside the action text", () => {
    const bodyStart = pageSource.indexOf("className={styles.zenLiveBotPresenceBody}");
    assert.notEqual(bodyStart, -1);
    const copyStart = pageSource.indexOf("className={styles.zenLiveBotPresenceCopy}", bodyStart);
    assert.notEqual(copyStart, -1);
    const bodyMarkup = pageSource.slice(bodyStart, copyStart);
    assert.match(bodyMarkup, /<BotGlyph[\s\S]*?className=\{styles\.zenLiveBotPresenceBotGlyph\}/);

    const copyMarkup = pageSource.slice(copyStart, pageSource.indexOf("</span>", copyStart) + 7);
    assert.doesNotMatch(copyMarkup, /<BotGlyph/);

    const glyphRule = ruleForExactSelector(".zenLiveBotPresenceBotGlyph");
    assert.match(glyphRule, /position:\s*absolute\s*;/);
    assert.match(glyphRule, /left:\s*calc\(50%\s*\+\s*var\(--zen-live-bot-glyph-x-anchor,\s*95px\)\)/);
    assert.match(glyphRule, /top:\s*calc\(50%\s*\+\s*var\(--zen-live-bot-glyph-y-anchor,\s*148px\)\)/);
    assert.match(glyphRule, /width:\s*clamp\(23px,\s*calc\(var\(--zen-live-bot-body-frame-size\)\s*\*\s*0\.16\),\s*33px\)/);
    assert.match(glyphRule, /padding:\s*0\s*;/);
    assert.match(glyphRule, /border:\s*0\s*;/);
    assert.match(glyphRule, /border-radius:\s*0\s*;/);
    assert.match(glyphRule, /background:\s*transparent\s*;/);
    assert.match(glyphRule, /filter:\s*[\s\S]*drop-shadow/);
    assert.doesNotMatch(glyphRule, /box-shadow:/);
    assert.doesNotMatch(glyphRule, /radial-gradient/);
  });

  it("lets the action box move around the fixed body when screen edges require it", () => {
    assert.match(pageSource, /type ZenLiveBotActionCopyPlacement = "top" \| "right" \| "bottom" \| "left";/);
    assert.match(pageSource, /resolveZenLiveBotActionCopyPlacement\(/);
    assert.match(pageSource, /getPropertyValue\("--zen-live-bot-body-x"\)/);
    assert.match(pageSource, /getPropertyValue\("--zen-live-bot-copy-center-anchor"\)/);
    assert.match(pageSource, /data-copy-placement=\{avatarCopyPlacement\}/);

    const copyRule = ruleForExactSelector(".zenLiveBotPresenceCopy");
    assert.match(copyRule, /z-index:\s*13\s*;/);
    assert.match(copyRule, /left:\s*calc\(\s*var\(--zen-live-bot-body-x,\s*50%\)/);
    assert.match(copyRule, /var\(--zen-live-bot-copy-center-anchor,\s*95px\)/);
    assert.match(copyRule, /top:\s*calc\(var\(--zen-live-bot-body-y,\s*50%\)\s*\+\s*var\(--zen-live-bot-copy-vertical-anchor,\s*152px\)\)/);
    assert.doesNotMatch(css, /translateY\(clamp\(-58px,\s*-12vw,\s*-46px\)\)/);

    const topRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-copy-placement="top"] .zenLiveBotPresenceCopy'
    );
    assert.match(topRule, /var\(--zen-live-bot-copy-top-anchor,\s*38px\)/);
    assert.match(topRule, /translateX\(-50%\)\s*translateY\(-100%\)/);

    const rightRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-copy-placement="right"] .zenLiveBotPresenceCopy'
    );
    assert.match(rightRule, /var\(--zen-live-bot-copy-center-anchor,\s*95px\)/);
    assert.match(rightRule, /var\(--zen-live-bot-copy-side-anchor,\s*82px\)/);

    const leftRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-copy-placement="left"] .zenLiveBotPresenceCopy'
    );
    assert.match(leftRule, /var\(--zen-live-bot-copy-center-anchor,\s*95px\)/);
    assert.match(leftRule, /var\(--zen-live-bot-copy-side-anchor,\s*82px\)/);
    assert.match(leftRule, /transform:\s*translateX\(-100%\)\s*translateY\(-50%\)/);
  });

  it("routes pre-stream Zen thinking state into the shared face spinner", () => {
    const presenceStart = pageSource.indexOf("function ZenLiveBotPresencePlate");
    assert.notEqual(presenceStart, -1);
    const presenceEnd = pageSource.indexOf("function wrapCleanupRevealMessageBody", presenceStart);
    assert.notEqual(presenceEnd, -1);
    const presenceSource = pageSource.slice(presenceStart, presenceEnd);

    assert.match(presenceSource, /showThinkingSpinner = false/);
    assert.match(presenceSource, /showThinkingSpinner\?: boolean;/);
    assert.match(
      presenceSource,
      /const faceSpinnerVisible = showThinkingSpinner \|\| transitioning;/
    );
    assert.match(presenceSource, /className=\{styles\.zenLiveBotPresenceThinkingGlyphAnchor\}/);
    assert.match(presenceSource, /showThinkingSpinner\s+baseText=\{plateFace\.text\}/);
    assert.match(presenceSource, /\{!faceSpinnerVisible \? \(/);
    assert.match(
      presenceSource,
      /data-thinking-spinner-active=\{faceSpinnerVisible \? "true" : undefined\}/
    );
    assert.doesNotMatch(presenceSource, /zenLiveBotPresenceSpinner/);
    assert.match(
      pageSource,
      /const zenPendingReplyPlaceholderVisible =\s+chatLikeSurface && pendingReplyVisualVisible && !chatAssistantRevealInProgress;/
    );

    const spinnerFrameRule = ruleForExactSelector(
      ".coffeeSeatPlateEmoji [data-coffee-plate-thinking-frame]"
    );
    assert.match(spinnerFrameRule, /font-size:\s*1em\s*;/);

    const zenSpinnerAnchorRule = ruleForExactSelector(
      ".zenLiveBotPresenceThinkingGlyphAnchor"
    );
    assert.match(zenSpinnerAnchorRule, /left:\s*50%\s*;/);
    assert.match(zenSpinnerAnchorRule, /top:\s*46%\s*;/);
    assert.match(zenSpinnerAnchorRule, /translate\(-50%,\s*-50%\)/);

    const zenSpinnerGlyphRule = ruleForExactSelector(
      ".zenLiveBotPresenceThinkingGlyph[data-coffee-plate-thinking-spinner=\"true\"]"
    );
    assert.match(zenSpinnerGlyphRule, /color:\s*var\(--zen-presence-face-ink\)\s*;/);
    assert.match(zenSpinnerGlyphRule, /var\(--coffee-bot-color\)/);
    assert.match(zenSpinnerGlyphRule, /font-size:\s*clamp\(1\.82rem,\s*4\.5vw,\s*3\.08rem\)/);
    assert.doesNotMatch(zenSpinnerGlyphRule, /#55ffe0|#0aa996/);
    assert.match(
      css,
      /\.coffeeSeatPlateEmoji \[data-coffee-plate-thinking-frame\]\[data-face-font="warm"\]/
    );
    assert.doesNotMatch(
      css,
      /\.zenLiveBotPresencePlate\[data-thinking-spinner-active="true"\] \.zenLiveBotPresenceFaceRig/
    );
    assert.doesNotMatch(css, /\.zenLiveBotPresenceSpinner/);

    const presenceCallSites = [...pageSource.matchAll(/<ZenLiveBotPresencePlate[\s\S]*?\/>/g)];
    assert.equal(presenceCallSites.length, 2);
    for (const callSite of presenceCallSites) {
      assert.match(
        callSite[0],
        /showThinkingSpinner=\{zenPendingReplyPlaceholderVisible\}/
      );
    }
  });

  it("keeps tiny message mood badges on the shared face glyph without LCD texture", () => {
    const moodFaceStart = pageSource.indexOf("function MessageMoodFace");
    assert.notEqual(moodFaceStart, -1);
    const moodFaceEnd = pageSource.indexOf("// PRISM fallback", moodFaceStart);
    assert.notEqual(moodFaceEnd, -1);
    const moodFaceSource = pageSource.slice(moodFaceStart, moodFaceEnd);
    assert.match(moodFaceSource, /<CoffeeSeatPlateEmoji/);
    assert.match(moodFaceSource, /<BotFaceFrame \/>/);
    assert.doesNotMatch(moodFaceSource, /BotFaceScreenTexture/);
  });

  it("drags only from the visible body and persists only after user relocation", () => {
    assert.match(
      pageSource,
      /const avatarPositionUserRelocatedRef = useRef\(avatarPosition !== null\)/
    );
    assert.match(
      pageSource,
      /function zenLiveBotAvatarPointerIsInsideBody\(\s*node: HTMLElement,/
    );
    assert.match(
      pageSource,
      /if \(!zenLiveBotAvatarPointerIsInsideBody\(node, event\.clientX, event\.clientY\)\) \{\s+return;\s+\}/
    );
    assert.match(pageSource, /avatarPositionUserRelocatedRef\.current = true;/);
    assert.match(
      pageSource,
      /if \(!avatarPositionUserRelocatedRef\.current\) return;\s+persistZenLiveBotAvatarPosition\(position\);/
    );
  });
});
