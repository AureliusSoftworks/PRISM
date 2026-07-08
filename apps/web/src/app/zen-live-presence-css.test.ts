import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");
const cssPath = join(dirname(fileURLToPath(import.meta.url)), "page.module.css");
const pagePath = join(dirname(fileURLToPath(import.meta.url)), "page.tsx");
const botFramePublicDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/bot-frame");
const metalMaskPath = join(botFramePublicDir, "bot-frame-metal-mask.png");
const screenMaskPath = join(botFramePublicDir, "bot-frame-screen-mask.png");
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

function ruleForNormalizedSelector(selector: string): string {
  const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
  const expected = normalize(selector);
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((entry) =>
    (entry[1] ?? "")
      .split(",")
      .map((candidate) => normalize(candidate))
      .includes(expected)
  );
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[2]!;
}

describe("Zen live presence CSS", () => {
  it("keeps bot frame assets normalized to the 1000px canvas", () => {
    for (const assetName of [
      "bot-frame-base.png",
      "bot-frame-led.png",
      "bot-frame-light-base.png",
      "bot-frame-metal-mask.png",
      "bot-frame-metal.png",
      "bot-frame-screen-mask.png",
      "bot-frame-tint-mask.png",
    ]) {
      const asset = PNG.sync.read(readFileSync(join(botFramePublicDir, assetName)));
      assert.equal(asset.width, 1000, `${assetName} width`);
      assert.equal(asset.height, 1000, `${assetName} height`);
    }
  });

  it("keeps the metal frame mask alpha-transparent outside the ring", () => {
    const mask = PNG.sync.read(readFileSync(metalMaskPath));
    const alphaAt = (x: number, y: number): number => mask.data[(y * mask.width + x) * 4 + 3] ?? 0;
    const centerX = Math.round(mask.width / 2);
    const centerY = Math.round(mask.height / 2);

    assert.equal(alphaAt(0, 0), 0);
    assert.equal(alphaAt(mask.width - 1, 0), 0);
    assert.equal(alphaAt(0, mask.height - 1), 0);
    assert.equal(alphaAt(centerX, centerY), 0);
    assert.ok(alphaAt(centerX, Math.round(mask.height * 0.04)) > 180);
  });

  it("keeps the screen glass mask alpha-transparent outside the glass", () => {
    const mask = PNG.sync.read(readFileSync(screenMaskPath));
    const alphaAt = (x: number, y: number): number => mask.data[(y * mask.width + x) * 4 + 3] ?? 0;
    const centerX = Math.round(mask.width / 2);
    const centerY = Math.round(mask.height / 2);

    assert.equal(alphaAt(0, 0), 0);
    assert.equal(alphaAt(mask.width - 1, 0), 0);
    assert.equal(alphaAt(0, mask.height - 1), 0);
    assert.equal(alphaAt(mask.width - 1, mask.height - 1), 0);
    assert.ok(alphaAt(centerX, centerY) > 180);
    assert.ok(alphaAt(centerX, Math.round(mask.height * 0.28)) > 180);
  });

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
    assert.match(hitTargetRule, /left:\s*49\.2%\s*;/);
    assert.match(hitTargetRule, /top:\s*50\.9%\s*;/);
    assert.match(hitTargetRule, /width:\s*77\.4%\s*;/);
    assert.match(hitTargetRule, /height:\s*78\.6%\s*;/);
    assert.match(hitTargetRule, /clip-path:\s*ellipse\(50% 50% at 50% 50%\)\s*;/);
    assert.match(hitTargetRule, /pointer-events:\s*auto\s*;/);
    assert.match(hitTargetRule, /cursor:\s*grab\s*;/);
    assert.match(hitTargetRule, /touch-action:\s*none\s*;/);
  });

  it("uses native grab cursors for the bot and no custom bot cursor overlay", () => {
    const hitTargetRule = ruleForExactSelector(".zenLiveBotPresenceHitTarget");
    assert.match(hitTargetRule, /cursor:\s*grab\s*;/);

    const draggingRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-dragging="true"] .zenLiveBotPresenceHitTarget'
    );
    assert.match(draggingRule, /cursor:\s*grabbing\s*;/);

    assert.doesNotMatch(css, /\.zenLiveBotGrabCursor\b/);
    assert.doesNotMatch(css, /\.zenLiveBotGrabCursorGlyph\b/);
    assert.doesNotMatch(pageSource, /ZEN_LIVE_BOT_GRAB_CURSOR/);
    assert.doesNotMatch(pageSource, /zenLiveBotGrabCursor/);
    assert.doesNotMatch(pageSource, /avatarGrabCursor/);
    assert.doesNotMatch(pageSource, /document\.body\.classList\.toggle\([^)]*zenLiveBotGrabCursor/);
    assert.doesNotMatch(pageSource, /createPortal\([\s\S]*styles\.zenLiveBotGrabCursor[\s\S]*document\.body/);
  });

  it("locks the body and face placement to the final composed bot frame", () => {
    assert.match(pageSource, /const ZEN_LIVE_BOT_LOCKED_BODY_SIZE_PX = 190;/);
    assert.match(pageSource, /xPct:\s*76\.81,/);
    assert.match(pageSource, /yPct:\s*-38\.51,/);
    assert.match(pageSource, /xPct:\s*50\.0,/);
    assert.match(pageSource, /yPct:\s*46\.5,/);
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
      /"--zen-live-bot-copy-vertical-anchor":\s*`\$\{Math\.round\(bodySize \* 0\.72\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-copy-top-anchor":\s*`\$\{Math\.round\(bodySize \* -0\.02\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-copy-side-anchor":\s*`\$\{Math\.round\(bodySize \* 0\.42\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-glyph-x-anchor":\s*"0px"/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-glyph-y-anchor":\s*`\$\{Math\.round\(bodySize \* 0\.37\)\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-face-scale":\s*facePlacement\.scale/
    );
    assert.match(pageSource, /const ZEN_LIVE_BOT_LOCKED_FACE_PLACEMENT:[\s\S]*yPct:\s*46\.5/);
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

    const emissionMaskRule = ruleForExactSelector(".zenLiveBotPresenceFaceEmissionMask");
    assert.match(emissionMaskRule, /left:\s*50%\s*;/);
    assert.match(emissionMaskRule, /top:\s*50%\s*;/);
    assert.match(emissionMaskRule, /z-index:\s*5\s*;/);
    assert.match(emissionMaskRule, /width:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(emissionMaskRule, /height:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(emissionMaskRule, /mix-blend-mode:\s*plus-lighter\s*;/);
    assert.match(
      emissionMaskRule,
      /--bot-face-crt-texture-image:\s*url\("\/bot-frame\/bot-frame-screen-mask\.png\?v=1000"\)\s*;/
    );
    assert.match(emissionMaskRule, /--bot-face-crt-texture-size:\s*100%\s*100%\s*;/);
    assert.match(emissionMaskRule, /--bot-face-crt-texture-repeat:\s*repeat\s*;/);
    assert.match(emissionMaskRule, /--bot-face-crt-phosphor-opacity:\s*0\.18\s*;/);
    assert.match(emissionMaskRule, /--bot-face-crt-gap-opacity:\s*0\.42\s*;/);
    assert.match(
      emissionMaskRule,
      /filter:\s*[\s\S]*drop-shadow\(0 0 2px color-mix\(in srgb,\s*var\(--bot-face-crt-color\)\s*30%,\s*transparent\)\)[\s\S]*drop-shadow\(0 0 10px color-mix\(in srgb,\s*var\(--bot-face-crt-color\)\s*12%,\s*transparent\)\)/
    );
    assert.match(
      emissionMaskRule,
      /-webkit-mask-image:\s*var\(--bot-face-crt-texture-image\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /-webkit-mask-size:\s*var\(--bot-face-crt-texture-size\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /-webkit-mask-repeat:\s*var\(--bot-face-crt-texture-repeat\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /mask-image:\s*var\(--bot-face-crt-texture-image\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /mask-size:\s*var\(--bot-face-crt-texture-size\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /mask-repeat:\s*var\(--bot-face-crt-texture-repeat\)\s*;/
    );
    assert.match(emissionMaskRule, /pointer-events:\s*none\s*;/);

    const phosphorRule = rulesForExactSelector(".zenLiveBotPresenceFaceEmissionMask::before").find(
      (rule) => /mix-blend-mode:\s*color-dodge\s*;/.test(rule)
    );
    assert.ok(phosphorRule, "Missing CRT phosphor color-dodge layer");
    assert.match(phosphorRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(phosphorRule, /var\(--bot-face-crt-texture-image\)/);
    assert.match(phosphorRule, /background-blend-mode:\s*multiply\s*;/);
    assert.match(phosphorRule, /mix-blend-mode:\s*color-dodge\s*;/);
    assert.match(phosphorRule, /filter:\s*brightness\(1\.18\)\s*contrast\(1\.08\)\s*saturate\(1\.35\)\s*;/);

    const gapRule = rulesForExactSelector(".zenLiveBotPresenceFaceEmissionMask::after").find(
      (rule) => /opacity:\s*var\(--bot-face-crt-gap-opacity\)\s*;/.test(rule)
    );
    assert.ok(gapRule, "Missing CRT gap multiply layer");
    assert.match(gapRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(gapRule, /repeating-linear-gradient\(\s*0deg/);
    assert.match(gapRule, /background-blend-mode:\s*multiply\s*;/);
    assert.match(gapRule, /opacity:\s*var\(--bot-face-crt-gap-opacity\)\s*;/);
    assert.match(gapRule, /mix-blend-mode:\s*multiply\s*;/);

    const faceRigRule = ruleForExactSelector(".zenLiveBotPresenceFaceRig");
    assert.match(faceRigRule, /left:\s*var\(--zen-live-bot-face-x,\s*50%\)/);
    assert.match(faceRigRule, /top:\s*var\(--zen-live-bot-face-y,\s*50%\)/);
    assert.match(faceRigRule, /scale\(var\(--zen-live-bot-face-scale,\s*1\)\)/);
    assert.match(faceRigRule, /pointer-events:\s*none\s*;/);
    assert.doesNotMatch(faceRigRule, /cursor:\s*move\s*;/);

    const screenGlassOverlayRule = ruleForExactSelector(".zenLiveBotPresenceScreenGlassOverlay");
    assert.match(screenGlassOverlayRule, /left:\s*50%\s*;/);
    assert.match(screenGlassOverlayRule, /top:\s*50%\s*;/);
    assert.match(screenGlassOverlayRule, /z-index:\s*5\s*;/);
    assert.match(screenGlassOverlayRule, /width:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(screenGlassOverlayRule, /height:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(screenGlassOverlayRule, /pointer-events:\s*none\s*;/);

    const bodyStart = pageSource.indexOf("className={styles.zenLiveBotPresenceBody}");
    assert.notEqual(bodyStart, -1);
    const emissionMaskStart = pageSource.indexOf("className={styles.zenLiveBotPresenceFaceEmissionMask}", bodyStart);
    assert.notEqual(emissionMaskStart, -1);
    const faceRigStart = pageSource.indexOf("className={styles.zenLiveBotPresenceFaceRig}", bodyStart);
    assert.notEqual(faceRigStart, -1);
    assert.ok(emissionMaskStart < faceRigStart);
    const botGlyphStart = pageSource.indexOf("<BotGlyph", faceRigStart);
    assert.notEqual(botGlyphStart, -1);
    const bodyBeforeFaceRig = pageSource.slice(bodyStart, faceRigStart);
    const faceRigMarkup = pageSource.slice(faceRigStart, botGlyphStart);
    assert.doesNotMatch(bodyBeforeFaceRig, /BotFaceScreenTexture/);
    assert.doesNotMatch(faceRigMarkup, /BotFaceScreenTexture/);
    assert.match(faceRigMarkup, /<CoffeeSeatPlateEmoji/);
    assert.match(
      faceRigMarkup,
      /className=\{styles\.zenLiveBotPresenceScreenGlassOverlay\}[\s\S]*<BotFaceScreenGlass className=\{styles\.zenLiveBotPresenceScreenGlass\}/
    );

    assert.doesNotMatch(css, /zenLiveBotPresenceBodyRaster/);

    const faceRule = ruleForExactSelector(".zenLiveBotPresenceFace");
    assert.match(
      faceRule,
      /--bot-face-frame-glow-filter:\s*drop-shadow\(0 0 0 transparent\)\s*;/
    );
    assert.match(faceRule, /--bot-face-screen-left:\s*16\.6%\s*;/);
    assert.match(faceRule, /--bot-face-screen-top:\s*11\.5%\s*;/);
    assert.match(faceRule, /--bot-face-screen-right:\s*15\.2%\s*;/);
    assert.match(faceRule, /--bot-face-screen-bottom:\s*20\.3%\s*;/);
    assert.match(
      faceRule,
      /--bot-face-frame-color:\s*var\(--zen-live-bot-frame-tint-color,\s*var\(--coffee-bot-color\)\)/
    );
    assert.match(faceRule, /--bot-face-frame-inset:\s*0\s*;/);
    assert.match(faceRule, /--bot-face-frame-opacity:\s*1\s*;/);
    assert.match(faceRule, /--bot-face-screen-glare-opacity:\s*0\.34\s*;/);
    assert.match(faceRule, /--zen-live-bot-screen-glass-overlay-opacity:\s*0\.26\s*;/);
    assert.match(faceRule, /--zen-live-bot-screen-glare-overlay-opacity:\s*0\.32\s*;/);
    assert.match(faceRule, /box-shadow:\s*none\s*;/);
    assert.match(faceRule, /width:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(faceRule, /height:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(faceRule, /transform:\s*translate\(-50%,\s*-50%\)\s*;/);
    assert.match(faceRule, /pointer-events:\s*none\s*;/);
    assert.doesNotMatch(faceRule, /cursor:\s*grab\s*;/);
    assert.match(
      css,
      /@keyframes zenLiveBotPresenceIdle\s*\{[\s\S]*transform:\s*translate\(-50%,\s*-50%\)\s*translateY\(0\)\s*scale\(1\)[\s\S]*transform:\s*translate\(-50%,\s*-50%\)\s*translateY\(-0\.75px\)\s*scale\(1\.006\)/
    );

    const faceGlyphRule = ruleForExactSelector(".coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph");
    assert.match(faceGlyphRule, /clamp\(1\.74rem,\s*5\.15vw,\s*2\.58rem\)/);

    const movingFaceRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-dragging="true"] .zenLiveBotPresenceFace'
    );
    assert.match(movingFaceRule, /--zen-live-bot-screen-glass-overlay-opacity:\s*0\.32\s*;/);
    assert.match(movingFaceRule, /--zen-live-bot-screen-glare-overlay-opacity:\s*0\.38\s*;/);

    assert.doesNotMatch(pageSource, /BotFaceScreenTexture/);
    assert.doesNotMatch(css, /\.botFaceScreenTexture/);
    assert.doesNotMatch(css, /\.zenLiveBotPresenceScreenTexture/);
    assert.doesNotMatch(css, /bot-face-screen-texture/);
    assert.doesNotMatch(css, /bot-frame-lcd-refraction/);

    const metalLightRule = ruleForExactSelector(".botFaceFrameMetalLight");
    assert.match(metalLightRule, /z-index:\s*var\(--bot-face-metal-light-z,\s*6\)/);
    assert.match(metalLightRule, /border-radius:\s*50%\s*;/);
    assert.match(
      metalLightRule,
      /clip-path:\s*var\(--bot-face-metal-light-clip-path,\s*circle\(50% at 50% 50%\)\)/
    );
    assert.doesNotMatch(metalLightRule, /isolation:\s*isolate/);
    assert.match(
      metalLightRule,
      /background:\s*var\(--bot-face-metal-light-background,\s*transparent\)/
    );
    assert.match(
      metalLightRule,
      /mix-blend-mode:\s*var\(--bot-face-metal-light-blend-mode,\s*overlay\)/
    );
    assert.match(metalLightRule, /-webkit-mask-mode:\s*luminance\s*;/);
    assert.match(metalLightRule, /mask-mode:\s*luminance\s*;/);
    assert.doesNotMatch(pageSource, /botFaceFrameMetalGrain/);
    assert.doesNotMatch(css, /\.botFaceFrameMetalGrain/);
    assert.doesNotMatch(css, /--bot-face-metal-grain/);

    const lightFaceRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-theme="light"] .zenLiveBotPresenceFace'
    );
    assert.doesNotMatch(lightFaceRule, /--bot-face-frame-glow-filter/);
    assert.match(lightFaceRule, /--bot-face-metal-light-base-color:\s*var\(--coffee-bot-color\)\s*;/);
    assert.match(
      lightFaceRule,
      /--bot-face-metal-light-background:\s*[\s\S]*var\(--bot-face-metal-light-base-color\)/
    );
    assert.match(
      lightFaceRule,
      /--bot-face-metal-light-blend-mode:\s*luminosity\s*;/
    );
    assert.match(
      lightFaceRule,
      /--bot-face-metal-light-filter:\s*grayscale\(1\)\s*contrast\(1\.42\)\s*brightness\(1\.08\)\s*;/
    );
    assert.match(lightFaceRule, /--bot-face-metal-light-raster-blend-mode:\s*luminosity\s*;/);
    assert.match(lightFaceRule, /--bot-face-metal-light-raster-opacity:\s*0\.86\s*;/);
    assert.doesNotMatch(lightFaceRule, /#74695c|#3d352d|#fff2e5/);
    assert.match(
      lightFaceRule,
      /--bot-face-metal-light-opacity:\s*0\.34\s*;/
    );
    assert.doesNotMatch(lightFaceRule, /--bot-face-metal-grain/);

    const coffeeLightZenRule = ruleForExactSelector(
      '.themeLight.coffeeShell .coffeeSeatPlate[data-live-body-style="zen"]'
    );
    assert.match(
      coffeeLightZenRule,
      /--bot-face-metal-light-base-color:\s*var\(--coffee-bot-color\)\s*;/
    );
    assert.match(
      coffeeLightZenRule,
      /--bot-face-metal-light-background:\s*[\s\S]*var\(--bot-face-metal-light-base-color\)/
    );
    assert.match(coffeeLightZenRule, /--bot-face-metal-light-raster-blend-mode:\s*luminosity\s*;/);
    assert.match(coffeeLightZenRule, /--bot-face-metal-light-raster-opacity:\s*0\.86\s*;/);
    assert.doesNotMatch(coffeeLightZenRule, /--bot-face-metal-grain/);

    const prismLightRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-theme="light"][data-prism-persona="true"]'
    );
    assert.match(prismLightRule, /--coffee-bot-color:\s*#242a33\s*;/);
    assert.match(prismLightRule, /--zen-presence-face-ink:\s*#ffffff\s*;/);
    assert.match(prismLightRule, /--zen-live-bot-frame-tint-color:\s*#f7f7f2\s*;/);
    assert.doesNotMatch(prismLightRule, /--bot-face-frame-glow-filter/);
    assert.doesNotMatch(prismLightRule, /--zen-prism-ambient/);

    const metalLightRasterRule = ruleForExactSelector(".botFaceFrameMetalLightRaster");
    assert.match(
      metalLightRasterRule,
      /opacity:\s*var\(--bot-face-metal-light-raster-opacity,\s*1\)\s*;/
    );
    assert.match(
      metalLightRasterRule,
      /mix-blend-mode:\s*var\(--bot-face-metal-light-raster-blend-mode,\s*normal\)\s*;/
    );
    assert.match(metalLightRasterRule, /overflow:\s*hidden\s*;/);
    assert.match(metalLightRasterRule, /border-radius:\s*50%\s*;/);
    assert.match(
      metalLightRasterRule,
      /clip-path:\s*var\(--bot-face-metal-light-clip-path,\s*circle\(50% at 50% 50%\)\)/
    );
    assert.match(
      metalLightRasterRule,
      /-webkit-mask-image:\s*var\(\s*--bot-face-metal-light-mask-image,\s*url\("\/bot-frame\/bot-frame-metal-mask\.png\?v=1000"\)\s*\)/
    );
    assert.match(metalLightRasterRule, /-webkit-mask-mode:\s*luminance\s*;/);
    assert.match(
      metalLightRasterRule,
      /mask-image:\s*var\(\s*--bot-face-metal-light-mask-image,\s*url\("\/bot-frame\/bot-frame-metal-mask\.png\?v=1000"\)\s*\)/
    );
    assert.match(metalLightRasterRule, /mask-mode:\s*luminance\s*;/);
    assert.doesNotMatch(metalLightRasterRule, /rotate\(var\(--bot-face-metal-light-rotation/);
    assert.doesNotMatch(metalLightRasterRule, /background:\s*url\("\/bot-frame\/bot-frame-metal\.png"\)/);

    const metalLightTextureRule = ruleForExactSelector(".botFaceFrameMetalLightRaster::before");
    assert.match(
      metalLightTextureRule,
      /background:\s*url\("\/bot-frame\/bot-frame-metal\.png\?v=1000"\)\s*center\s*\/\s*contain\s*no-repeat/
    );
    assert.match(
      metalLightTextureRule,
      /rotate\(var\(--bot-face-metal-light-rotation,\s*0deg\)\)/
    );
    assert.doesNotMatch(metalLightTextureRule, /mask-image/);
    assert.doesNotMatch(css, /botFaceFrameMetalLightSweep/);
    assert.match(pageSource, /type ZenLiveBotScreenGlareState =/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_DEFAULT: ZenLiveBotScreenGlareState/);
    assert.match(pageSource, /function resolveZenLiveBotScreenGlareState/);
    assert.match(
      pageSource,
      /const lightX = safeViewportWidth \* ZEN_LIVE_BOT_SCREEN_GLARE_LIGHT_X_RATIO;/
    );
    assert.match(
      pageSource,
      /const lightY = safeViewportHeight \* ZEN_LIVE_BOT_SCREEN_GLARE_LIGHT_Y_RATIO;/
    );
    assert.match(pageSource, /yPct:\s*30,/);
    assert.match(pageSource, /opacity:\s*0\.4,/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_X_GAIN = 32;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_Y_GAIN = 20;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_X_MIN_PCT = 28;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_X_MAX_PCT = 72;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_Y_MIN_PCT = 30;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_Y_MAX_PCT = 58;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_SCREEN_GLARE_ANGLE_Y_WEIGHT = 0\.46;/);
    assert.match(
      pageSource,
      /50 \+ normalizedX \* ZEN_LIVE_BOT_SCREEN_GLARE_X_GAIN/
    );
    assert.match(
      pageSource,
      /42 \+ normalizedY \* ZEN_LIVE_BOT_SCREEN_GLARE_Y_GAIN/
    );
    assert.match(
      pageSource,
      /normalizedY \* ZEN_LIVE_BOT_SCREEN_GLARE_ANGLE_Y_WEIGHT/
    );
    assert.match(pageSource, /opacity:\s*0\.38 \+ distance \* 0\.16/);
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_AVATAR_METAL_ROTATION_SPEED_SCALE = 0\.42;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_AVATAR_METAL_MAX_ROTATION_STEP_DEGREES = 24;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_AVATAR_METAL_DEGREES_PER_PX =\s+\(360 \/ \(ZEN_LIVE_BOT_LOCKED_BODY_SIZE_PX \* Math\.PI\)\) \*\s+ZEN_LIVE_BOT_AVATAR_METAL_ROTATION_SPEED_SCALE;/
    );
    assert.match(pageSource, /function advanceZenLiveBotAvatarMetalRotationDegrees/);
    assert.match(
      pageSource,
      /const horizontalDeltaPx = nextPosition\.x - previousPosition\.x;/
    );
    assert.match(
      pageSource,
      /if \(Math\.abs\(horizontalDeltaPx\) < 0\.05\) return currentDegrees;/
    );
    assert.match(
      pageSource,
      /Math\.sign\(horizontalDeltaPx\) \* Math\.min\(\s*Math\.abs\(horizontalDeltaPx\) \* ZEN_LIVE_BOT_AVATAR_METAL_DEGREES_PER_PX,\s*ZEN_LIVE_BOT_AVATAR_METAL_MAX_ROTATION_STEP_DEGREES/
    );
    assert.match(
      pageSource,
      /return currentDegrees \+ rotationDelta;/
    );
    assert.match(
      pageSource,
      /"--bot-face-metal-light-rotation":\s*`\$\{avatarMetalRotation\.toFixed\(2\)\}deg`/
    );
    assert.match(
      pageSource,
      /"--bot-face-screen-glare-x":\s*`\$\{avatarScreenGlare\.xPct\.toFixed\(2\)\}%`/
    );
    assert.match(
      pageSource,
      /"--bot-face-screen-glare-y":\s*`\$\{avatarScreenGlare\.yPct\.toFixed\(2\)\}%`/
    );
    assert.match(
      pageSource,
      /"--bot-face-screen-glare-angle":\s*`\$\{avatarScreenGlare\.angleDeg\.toFixed\(2\)\}deg`/
    );
    assert.match(
      pageSource,
      /"--bot-face-screen-glare-opacity":\s*avatarScreenGlare\.opacity\.toFixed\(3\)/
    );
    assert.doesNotMatch(pageSource, /--bot-face-metal-grain-rotation/);
    assert.doesNotMatch(pageSource, /BotFaceScreenTexture/);
    assert.doesNotMatch(css, /\.botFaceScreenTexture/);
    assert.doesNotMatch(css, /bot-face-screen-pixel|lcd-pixel|screen-pixel/i);

    const frameRule = ruleForExactSelector(".botFaceFrame");
    assert.match(frameRule, /z-index:\s*var\(--bot-face-frame-z,\s*0\)/);
    assert.match(frameRule, /var\(--bot-face-frame-glow-filter,\s*drop-shadow\(0 0 0 transparent\)\)/);
    assert.match(frameRule, /opacity:\s*var\(--bot-face-frame-opacity,\s*1\)\s*;/);
    assert.match(frameRule, /overflow:\s*hidden\s*;/);
    assert.match(frameRule, /border-radius:\s*50%\s*;/);
    assert.match(frameRule, /clip-path:\s*circle\(50% at 50% 50%\)\s*;/);
    assert.doesNotMatch(frameRule, /coffee-plate-emoji-face-scale-y/);
    assert.match(pageSource, /className=\{styles\.botFaceFrameLed\}/);
    assert.match(
      pageSource,
      /function BotFaceFrame\(\)[\s\S]*<BotFaceScreenFill \/>[\s\S]*className=\{styles\.botFaceFrame\}[\s\S]*className=\{styles\.botFaceFrameMetalLight\}/
    );

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
    assert.match(screenGlassRule, /z-index:\s*var\(--bot-face-screen-glass-z,\s*3\)/);
    assert.match(screenGlassRule, /border-radius:\s*var\(--bot-face-screen-radius,\s*50%\)\s*;/);
    assert.match(screenGlassRule, /background:\s*var\(\s*--bot-face-screen-glass-background/);
    assert.match(
      screenGlassRule,
      /-webkit-mask-image:\s*var\(--bot-face-screen-mask-image,\s*none\)\s*;/
    );
    assert.match(screenGlassRule, /-webkit-mask-size:\s*contain\s*;/);
    assert.match(screenGlassRule, /-webkit-mask-mode:\s*alpha\s*;/);
    assert.match(
      screenGlassRule,
      /mask-image:\s*var\(--bot-face-screen-mask-image,\s*none\)\s*;/
    );
    assert.match(screenGlassRule, /mask-size:\s*contain\s*;/);
    assert.match(screenGlassRule, /mask-mode:\s*alpha\s*;/);
    assert.match(screenGlassRule, /opacity:\s*var\(--bot-face-screen-glass-opacity,\s*0\.42\)/);
    assert.match(screenGlassRule, /mix-blend-mode:\s*var\(--bot-face-screen-glass-blend-mode,\s*screen\)/);

    assert.match(css, /\.botFaceScreenGlass::before\s*\{[\s\S]*background:\s*none\s*;/);
    assert.match(css, /\.botFaceScreenGlass::before\s*\{[\s\S]*opacity:\s*0\s*;/);
    assert.match(css, /\.botFaceScreenGlass::before\s*\{[\s\S]*filter:\s*none\s*;/);
    assert.match(
      css,
      /\.botFaceScreenGlass::after\s*\{[\s\S]*var\(--bot-face-screen-glare-x,\s*34%\)[\s\S]*transparent 11\.5%[\s\S]*transparent 15%[\s\S]*opacity:\s*var\(--bot-face-screen-specular-opacity,\s*0\.66\)/
    );
    assert.doesNotMatch(css, /\.botFaceScreenGlass::after\s*\{[\s\S]*linear-gradient\(\s*138deg/);

    const zenScreenGlassRule = ruleForExactSelector(".zenLiveBotPresenceScreenGlass");
    assert.match(zenScreenGlassRule, /--bot-face-screen-inset:\s*0\s*;/);
    assert.match(zenScreenGlassRule, /--bot-face-screen-left:\s*0\s*;/);
    assert.match(zenScreenGlassRule, /--bot-face-screen-top:\s*0\s*;/);
    assert.match(zenScreenGlassRule, /--bot-face-screen-right:\s*0\s*;/);
    assert.match(zenScreenGlassRule, /--bot-face-screen-bottom:\s*0\s*;/);
    assert.match(zenScreenGlassRule, /--bot-face-screen-radius:\s*0\s*;/);
    assert.match(
      zenScreenGlassRule,
      /--bot-face-screen-mask-image:\s*url\("\/bot-frame\/bot-frame-screen-mask\.png\?v=1000"\)\s*;/
    );
    assert.match(zenScreenGlassRule, /--bot-face-screen-glass-background:\s*transparent\s*;/);
    assert.doesNotMatch(zenScreenGlassRule, /--bot-face-screen-glass-blend-mode:\s*plus-lighter\s*;/);
    assert.match(zenScreenGlassRule, /--bot-face-screen-glass-z:\s*0\s*;/);
    assert.match(
      zenScreenGlassRule,
      /--bot-face-screen-glass-opacity:\s*var\(--zen-live-bot-screen-glass-overlay-opacity,\s*0\.2\)/
    );
    assert.match(
      zenScreenGlassRule,
      /--bot-face-screen-glare-opacity:\s*var\(--zen-live-bot-screen-glare-overlay-opacity,\s*0\.24\)/
    );
    assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.botFaceScreenGlass[\s\S]*transition:\s*none\s*;/);

    const frameTintRule = ruleForExactSelector(".botFaceFrameTint");
    assert.match(
      frameTintRule,
      /opacity:\s*var\(--bot-face-frame-tint-opacity,\s*var\(--coffee-seat-mood-frame-raster-opacity,\s*1\)\)\s*;/
    );
    assert.match(frameTintRule, /background:\s*var\(--bot-face-frame-tint-background,\s*currentColor\)/);
    assert.match(frameTintRule, /filter:\s*var\(\s*--bot-face-frame-tint-filter/);

    const ledRule = ruleForExactSelector(".botFaceFrameLed");
    assert.match(ledRule, /background:\s*url\("\/bot-frame\/bot-frame-led\.png\?v=1000"\)\s*center\s*\/\s*contain\s*no-repeat/);
    assert.doesNotMatch(ledRule, /mask-image/);
  });

  it("keeps talking avatars still and flickers their lights instead", () => {
    const prismRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"]'
    );
    assert.match(prismRule, /--bot-face-frame-tint-talking-opacity-high:\s*0\.96\s*;/);
    assert.match(prismRule, /--bot-face-frame-tint-talking-opacity-mid:\s*0\.76\s*;/);
    assert.match(prismRule, /--bot-face-frame-tint-talking-opacity-low:\s*0\.52\s*;/);
    assert.match(prismRule, /--bot-face-frame-led-talking-opacity-mid:\s*0\.84\s*;/);
    assert.match(prismRule, /--bot-face-frame-led-talking-opacity-low:\s*0\.62\s*;/);
    assert.match(prismRule, /--zen-live-bot-face-talking-opacity-mid:\s*1\s*;/);
    assert.match(prismRule, /--zen-live-bot-face-talking-opacity-low:\s*1\s*;/);
    assert.doesNotMatch(prismRule, /--zen-prism-ambient/);

    const talkingFaceRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-talking="true"] .zenLiveBotPresenceFace'
    );
    assert.match(talkingFaceRule, /animation:\s*none\s*;/);
    assert.doesNotMatch(css, /@keyframes zenLiveBotPresenceTalk\b/);

    assert.match(css, /@keyframes zenLiveBotTalkingLightFlicker/);
    assert.match(css, /@keyframes zenLiveBotTalkingFaceGlowFlicker/);
    assert.doesNotMatch(css, /zenLiveBotTalkingLightFlicker[^;{]*steps\(/);
    const talkingLightKeyframesStart = css.indexOf("@keyframes zenLiveBotTalkingLightFlicker");
    assert.notEqual(talkingLightKeyframesStart, -1);
    const talkingLightKeyframesEnd = css.indexOf(
      "@keyframes zenLiveBotTalkingFaceGlowFlicker",
      talkingLightKeyframesStart
    );
    assert.notEqual(talkingLightKeyframesEnd, -1);
    const talkingLightKeyframes = css.slice(talkingLightKeyframesStart, talkingLightKeyframesEnd);
    assert.match(talkingLightKeyframes, /8%,[\s\S]*24%,[\s\S]*47%,[\s\S]*71%/);
    assert.match(talkingLightKeyframes, /12%,[\s\S]*37%,[\s\S]*60%,[\s\S]*82%/);
    assert.match(talkingLightKeyframes, /15%,[\s\S]*55%,[\s\S]*87%/);
    assert.doesNotMatch(talkingLightKeyframes, /35%|58%|78%/);
    assert.match(
      css,
      /@keyframes zenLiveBotTalkingLightFlicker\s*\{[\s\S]*opacity:\s*var\(--zen-live-bot-talking-light-opacity-low/
    );

    const talkingFaceGlowKeyframesStart = css.indexOf("@keyframes zenLiveBotTalkingFaceGlowFlicker");
    assert.notEqual(talkingFaceGlowKeyframesStart, -1);
    const talkingFaceGlowKeyframesEnd = css.indexOf(
      "@keyframes zenLiveBotPresenceSaturateIn",
      talkingFaceGlowKeyframesStart
    );
    assert.notEqual(talkingFaceGlowKeyframesEnd, -1);
    const talkingFaceGlowKeyframes = css.slice(
      talkingFaceGlowKeyframesStart,
      talkingFaceGlowKeyframesEnd
    );
    assert.match(talkingFaceGlowKeyframes, /8%,[\s\S]*24%,[\s\S]*47%,[\s\S]*71%/);
    assert.match(talkingFaceGlowKeyframes, /12%,[\s\S]*37%,[\s\S]*60%,[\s\S]*82%/);
    assert.match(talkingFaceGlowKeyframes, /15%,[\s\S]*55%,[\s\S]*87%/);
    assert.match(
      talkingFaceGlowKeyframes,
      /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\)/
    );
    assert.match(
      talkingFaceGlowKeyframes,
      /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-mid\)/
    );
    assert.match(
      talkingFaceGlowKeyframes,
      /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-low\)/
    );

    const talkingFrameTintRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"]) .botFaceFrameTint'
    );
    assert.match(
      talkingFrameTintRule,
      /animation:\s*zenLiveBotTalkingLightFlicker 840ms ease-in-out infinite\s*;/
    );

    const talkingLedRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"]) .botFaceFrameLed'
    );
    assert.match(
      talkingLedRule,
      /animation:\s*zenLiveBotTalkingLightFlicker 780ms ease-in-out infinite\s*;/
    );

    const talkingGlyphPartRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"]) .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part]'
    );
    assert.match(talkingGlyphPartRule, /--zen-live-bot-talking-light-opacity-high:\s*1\s*;/);
    assert.match(talkingGlyphPartRule, /--zen-live-bot-talking-light-opacity-mid:\s*1\s*;/);
    assert.match(talkingGlyphPartRule, /--zen-live-bot-talking-light-opacity-low:\s*1\s*;/);
    assert.match(talkingGlyphPartRule, /--zen-live-bot-talking-face-glow-filter-high:/);
    assert.match(talkingGlyphPartRule, /--zen-live-bot-talking-face-glow-filter-mid:/);
    assert.match(talkingGlyphPartRule, /--zen-live-bot-talking-face-glow-filter-low:/);
    assert.match(talkingGlyphPartRule, /opacity:\s*1\s*;/);
    assert.match(talkingGlyphPartRule, /filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\)\s*;/);
    assert.match(
      talkingGlyphPartRule,
      /animation:\s*zenLiveBotTalkingFaceGlowFlicker 760ms ease-in-out infinite,\s*zenLiveBotTalkingLightFlicker 760ms ease-in-out infinite\s*;/
    );

    const talkingMouthRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"])[data-mouth-open="true"] .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part="mouth"]'
    );
    assert.match(
      talkingMouthRule,
      /animation:\s*zenLiveBotPresenceMouthPulse 130ms cubic-bezier\(0\.37,\s*0,\s*0\.2,\s*1\) infinite,\s*zenLiveBotTalkingFaceGlowFlicker 760ms ease-in-out infinite,\s*zenLiveBotTalkingLightFlicker 760ms ease-in-out infinite\s*;/
    );
  });

  it("removes the Prism ambient aura from Zen mode", () => {
    const prismRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"]'
    );
    assert.match(prismRule, /--coffee-bot-color:\s*#f7f7f2\s*;/);
    assert.match(prismRule, /--bot-face-frame-tint-background:\s*[\s\S]*conic-gradient/);
    assert.match(prismRule, /--bot-face-frame-tint-opacity:\s*0\.64\s*;/);
    assert.match(prismRule, /--bot-face-metal-light-opacity:\s*0\.3\s*;/);
    assert.doesNotMatch(prismRule, /--bot-face-frame-glow-filter/);
    assert.doesNotMatch(prismRule, /--zen-prism-ambient/);
    assert.match(prismRule, /--zen-presence-face-bg:\s*[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.05\)/);
    assert.match(prismRule, /--zen-presence-face-border:\s*color-mix\(in srgb,\s*#ff3f6f 12%,\s*#ffb62e 8%\)\s*;/);
    assert.match(prismRule, /--zen-presence-face-ring:\s*transparent\s*;/);
    assert.doesNotMatch(prismRule, /#ffffff 3%/);

    const privatePrismRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-private-mode="true"]'
    );
    assert.match(privatePrismRule, /--bot-face-frame-tint-background:\s*currentColor\s*;/);
    assert.match(privatePrismRule, /--bot-face-frame-tint-opacity:\s*0\.52\s*;/);
    assert.doesNotMatch(privatePrismRule, /--bot-face-frame-glow-filter/);
    assert.doesNotMatch(privatePrismRule, /--zen-prism-ambient/);

    assert.doesNotMatch(css, /--zen-prism-ambient/);
    assert.doesNotMatch(css, /zenLivePrismRainbowAura/);
    assert.doesNotMatch(css, /zenLiveBotPresenceFace::before/);

    assert.match(
      pageSource,
      /data-private-mode=\{privateModeActive \? "true" : undefined\}/
    );
    const presenceCallSites = [...pageSource.matchAll(/<ZenLiveBotPresencePlate[\s\S]*?\/>/g)];
    assert.equal(presenceCallSites.length, 2);
    for (const callSite of presenceCallSites) {
      assert.match(callSite[0], /privateModeActive=\{privateChatActive\}/);
    }
  });

  it("keeps Prism talking frame effects while identity ink stays white", () => {
    assert.match(css, /@keyframes zenLiveBotTalkingLightFlicker/);
    assert.doesNotMatch(css, /@keyframes zenLivePrismRainbowAura/);
    assert.match(css, /@keyframes zenLivePrismEmitterHueRotate/);
    assert.match(css, /@keyframes zenLivePrismFaceGlowHueRotate/);
    assert.match(css, /@keyframes zenLivePrismFaceGlowHueRotateLight/);
    assert.doesNotMatch(css, /@keyframes zenLivePrismRainbowInk\b/);
    assert.doesNotMatch(css, /@keyframes zenLivePrismRainbowInkLight\b/);
    assert.doesNotMatch(css, /zenLiveBotPresenceFace::before/);

    const talkingFrameTintRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-talking="true"]:not([data-private-mode="true"]) .botFaceFrameTint'
    );
    assert.match(
      talkingFrameTintRule,
      /animation:\s*zenLivePrismEmitterHueRotate 1\.7s linear infinite,\s*zenLiveBotTalkingLightFlicker 840ms ease-in-out infinite\s*;/
    );

    const talkingLedRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-talking="true"]:not([data-private-mode="true"]) .botFaceFrameLed'
    );
    assert.match(
      talkingLedRule,
      /animation:\s*zenLiveBotTalkingLightFlicker 780ms ease-in-out infinite\s*;/
    );

    const talkingFaceRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-talking="true"] .zenLiveBotPresenceFaceGlyph'
    );
    assert.match(talkingFaceRule, /color:\s*#ffffff\s*;/);
    assert.match(talkingFaceRule, /text-shadow:\s*none\s*;/);
    assert.match(talkingFaceRule, /filter:\s*none\s*;/);
    assert.match(talkingFaceRule, /animation:\s*none\s*;/);

    const talkingFacePartRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-talking="true"] .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part]'
    );
    assert.match(talkingFacePartRule, /filter:\s*[\s\S]*drop-shadow/);
    assert.match(
      talkingFacePartRule,
      /animation:\s*zenLivePrismFaceGlowHueRotate 1\.7s linear infinite,\s*zenLiveBotTalkingLightFlicker 760ms ease-in-out infinite\s*;/
    );
    assert.doesNotMatch(talkingFacePartRule, /#ff3f6f/);

    assert.match(
      css,
      /@keyframes zenLivePrismFaceGlowHueRotate\s*\{[\s\S]*hue-rotate\(0deg\)[\s\S]*hue-rotate\(360deg\)/
    );

    const privateTalkingFaceRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-private-mode="true"][data-talking="true"] .zenLiveBotPresenceFaceGlyph'
    );
    assert.match(privateTalkingFaceRule, /animation:\s*none\s*;/);
    const privateTalkingFacePartRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-private-mode="true"][data-talking="true"] .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part]'
    );
    assert.match(privateTalkingFacePartRule, /animation:\s*none\s*;/);
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
    assert.match(bodyMarkup, /strokeWidth=\{1\.95\}/);

    const copyMarkup = pageSource.slice(copyStart, pageSource.indexOf("</span>", copyStart) + 7);
    assert.doesNotMatch(copyMarkup, /<BotGlyph/);

    const glyphRule = ruleForExactSelector(".zenLiveBotPresenceBotGlyph");
    assert.match(glyphRule, /position:\s*absolute\s*;/);
    assert.match(glyphRule, /left:\s*calc\(50%\s*\+\s*var\(--zen-live-bot-glyph-x-anchor,\s*0px\)\)/);
    assert.match(glyphRule, /top:\s*calc\(50%\s*\+\s*var\(--zen-live-bot-glyph-y-anchor,\s*70px\)\)/);
    assert.match(glyphRule, /width:\s*clamp\(23px,\s*calc\(var\(--zen-live-bot-body-frame-size\)\s*\*\s*0\.16\),\s*33px\)/);
    assert.match(glyphRule, /padding:\s*0\s*;/);
    assert.match(glyphRule, /border:\s*0\s*;/);
    assert.match(glyphRule, /border-radius:\s*0\s*;/);
    assert.match(glyphRule, /background:\s*transparent\s*;/);
    assert.match(
      glyphRule,
      /--zen-live-bot-glyph-glow-color:\s*var\(--coffee-bot-color\)\s*;/
    );
    assert.match(
      glyphRule,
      /--zen-live-bot-glyph-edge-shadow:\s*color-mix\(\s*in srgb,\s*#020706 74%,\s*var\(--coffee-bot-color\)\s*26%\s*\)\s*;/
    );
    assert.match(
      glyphRule,
      /filter:\s*[\s\S]*drop-shadow\(0 0 1px var\(--zen-live-bot-glyph-edge-shadow\)\)[\s\S]*drop-shadow\(\s*0 0 4px\s*color-mix\(in srgb,\s*var\(--zen-live-bot-glyph-glow-color\)\s*82%,\s*transparent\)\s*\)[\s\S]*drop-shadow\(\s*0 0 19px\s*color-mix\(in srgb,\s*var\(--zen-live-bot-glyph-glow-color\)\s*28%,\s*transparent\)\s*\)/
    );
    assert.doesNotMatch(glyphRule, /#ffffff 72%,\s*currentColor 28%/);
    assert.doesNotMatch(glyphRule, /box-shadow:/);
    assert.doesNotMatch(glyphRule, /radial-gradient/);
  });

  it("lets the pull-quote action text drift away from the fixed body", () => {
    assert.match(pageSource, /type ZenLiveBotActionCopyPlacement = "top" \| "right" \| "bottom" \| "left";/);
    assert.match(pageSource, /type ZenLiveBotActionCopyAnchor = \{/);
    assert.match(pageSource, /resolveZenLiveBotActionCopyPlacement\(/);
    assert.match(pageSource, /resolveZenLiveBotActionCopyAnchor\(/);
    assert.match(pageSource, /\[data-zen-live-bot-action-copy-measure='true'\]/);
    assert.match(pageSource, /getPropertyValue\("--zen-live-bot-body-x"\)/);
    assert.match(pageSource, /getPropertyValue\("--zen-live-bot-copy-center-anchor"\)/);
    assert.match(pageSource, /setActionCopyAnchor\(\{ key, \.\.\.anchor \}\);/);
    assert.match(pageSource, /data-copy-placement=\{actionCopyAnchorForRender\?\.placement \?\? avatarCopyPlacement\}/);
    assert.match(
      pageSource,
      /const actionCopyKey = actionText\s+\?\s+`\$\{actionState\?\.createdAtMs \?\? "static"\}:\$\{actionText\}`\s+:\s+null;/
    );
    assert.match(pageSource, /key=\{actionCopyKey\}/);
    assert.match(pageSource, /data-zen-live-bot-action-copy-measure="true"/);
    assert.match(pageSource, /data-copy-anchored="true"/);
    assert.match(pageSource, /data-copy-placement=\{actionCopyAnchorForRender\.placement\}/);
    assert.match(pageSource, /createPortal\([\s\S]*data-zen-live-bot-action-copy="true"[\s\S]*document\.body/);
    assert.match(pageSource, /"--zen-live-bot-action-copy-anchor-x":\s*`\$\{Math\.round\(actionCopyAnchorForRender\.x\)\}px`/);
    assert.match(pageSource, /"--zen-live-bot-action-copy-anchor-y":\s*`\$\{Math\.round\(actionCopyAnchorForRender\.y\)\}px`/);
    assert.match(pageSource, /aria-label=\{actionText \? `\$\{botName\}: \$\{actionText\}` : botName\}/);

    const placementStart = pageSource.indexOf("function resolveZenLiveBotActionCopyPlacement");
    assert.notEqual(placementStart, -1);
    const placementEnd = pageSource.indexOf(
      "function resolveZenLiveBotActionCopyOffsetX",
      placementStart
    );
    assert.notEqual(placementEnd, -1);
    const placementSource = pageSource.slice(placementStart, placementEnd);
    const verticalFitDecision = placementSource.indexOf("if (topFits || bottomFits)");
    const proseFitDecision = placementSource.indexOf("if (proseHillRect)");
    const horizontalFitDecision = placementSource.indexOf(
      "if (spaceRight >= horizontalNeed || spaceLeft >= horizontalNeed)"
    );
    assert.notEqual(verticalFitDecision, -1);
    assert.notEqual(proseFitDecision, -1);
    assert.notEqual(horizontalFitDecision, -1);
    assert.ok(verticalFitDecision < proseFitDecision);
    assert.ok(verticalFitDecision < horizontalFitDecision);
    assert.match(placementSource, /const verticalNeed = copyHeight \+ bodyGap;/);
    assert.match(placementSource, /return bodyCenterY > safeCenterY \? "top" : "bottom";/);

    const copyRule = ruleForExactSelector(".zenLiveBotPresenceCopy");
    assert.match(copyRule, /z-index:\s*13\s*;/);
    assert.match(copyRule, /left:\s*calc\(\s*var\(--zen-live-bot-body-x,\s*50%\)/);
    assert.match(copyRule, /var\(--zen-live-bot-copy-center-anchor,\s*95px\)/);
    assert.match(copyRule, /top:\s*calc\(var\(--zen-live-bot-body-y,\s*50%\)\s*\+\s*var\(--zen-live-bot-copy-vertical-anchor,\s*136px\)\)/);
    assert.match(copyRule, /border-left:\s*3px solid/);
    assert.match(copyRule, /background:\s*transparent\s*;/);
    assert.match(copyRule, /box-shadow:\s*none\s*;/);
    assert.match(copyRule, /opacity:\s*0\s*;/);
    assert.match(copyRule, /overflow:\s*visible\s*;/);
    assert.doesNotMatch(copyRule, /animation:\s*zenLiveBotActionQuoteDrift/);
    const anchoredCopyRule = ruleForExactSelector(
      '.zenLiveBotPresenceCopy[data-copy-anchored="true"]'
    );
    assert.match(anchoredCopyRule, /position:\s*fixed\s*;/);
    assert.match(anchoredCopyRule, /left:\s*var\(--zen-live-bot-action-copy-anchor-x,\s*50vw\)\s*;/);
    assert.match(anchoredCopyRule, /top:\s*var\(--zen-live-bot-action-copy-anchor-y,\s*50vh\)\s*;/);
    assert.match(anchoredCopyRule, /animation:\s*zenLiveBotActionQuoteDrift 11800ms cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\) both\s*;/);
    assert.doesNotMatch(css, /translateY\(clamp\(-58px,\s*-12vw,\s*-46px\)\)/);
    assert.match(
      css,
      /@keyframes zenLiveBotActionQuoteDrift\s*\{[\s\S]*transform:\s*var\(--zen-live-bot-action-copy-start-transform\)[\s\S]*34%\s*\{[\s\S]*transform:\s*var\(--zen-live-bot-action-copy-mid-transform\)[\s\S]*100%\s*\{[\s\S]*transform:\s*var\(--zen-live-bot-action-copy-end-transform\)/
    );

    const topRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-copy-placement="top"] .zenLiveBotPresenceCopy'
    );
    assert.match(topRule, /var\(--zen-live-bot-copy-top-anchor,\s*38px\)/);
    assert.match(topRule, /--zen-live-bot-action-copy-start-transform:\s*translateX\(-50%\)\s*translateY\(calc\(-100% \+ 8px\)\)\s*scale\(0\.982\)/);
    assert.match(topRule, /translateX\(-50%\)\s*translateY\(-100%\)/);
    assert.equal(
      ruleForExactSelector('.zenLiveBotPresenceCopy[data-copy-placement="top"]'),
      topRule
    );

    const rightRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-copy-placement="right"] .zenLiveBotPresenceCopy'
    );
    assert.match(rightRule, /var\(--zen-live-bot-copy-center-anchor,\s*95px\)/);
    assert.match(rightRule, /var\(--zen-live-bot-copy-side-anchor,\s*82px\)/);
    assert.match(rightRule, /--zen-live-bot-action-copy-end-transform:\s*translateX\(24px\)\s*translateY\(-50%\)\s*scale\(0\.992\)/);
    assert.equal(
      ruleForExactSelector('.zenLiveBotPresenceCopy[data-copy-placement="right"]'),
      rightRule
    );

    const leftRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-copy-placement="left"] .zenLiveBotPresenceCopy'
    );
    assert.match(leftRule, /var\(--zen-live-bot-copy-center-anchor,\s*95px\)/);
    assert.match(leftRule, /var\(--zen-live-bot-copy-side-anchor,\s*82px\)/);
    assert.match(leftRule, /--zen-live-bot-action-copy-end-transform:\s*translateX\(calc\(-100% - 24px\)\)\s*translateY\(-50%\)\s*scale\(0\.992\)/);
    assert.match(leftRule, /transform:\s*translateX\(-100%\)\s*translateY\(-50%\)/);
    assert.equal(
      ruleForExactSelector('.zenLiveBotPresenceCopy[data-copy-placement="left"]'),
      leftRule
    );

    const textRule = ruleForExactSelector(".zenLiveBotPresenceText");
    assert.match(textRule, /font-size:\s*clamp\(1rem,\s*1\.05vw,\s*1\.2rem\)/);
    assert.match(textRule, /font-style:\s*italic\s*;/);
    assert.match(textRule, /line-clamp:\s*2\s*;/);
  });

  it("redirects live bot momentum down the visible Zen prose hill", () => {
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_PROSE_HILL_SELECTOR = "\[data-zen-live-prose-target='true'\]";/
    );
    assert.match(pageSource, /const ZEN_LIVE_BOT_PROSE_HILL_CLEARANCE_PX = 34;/);
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_PROSE_HILL_ACCELERATION_PX_PER_SEC = 1600;/
    );
    assert.match(pageSource, /const ZEN_LIVE_BOT_PROSE_HILL_MAX_SIDE_SPEED = 960;/);
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_PROSE_HILL_INERTIA_DAMPING_PER_FRAME = 0\.955;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_PROSE_HILL_VERTICAL_DAMPING_PER_FRAME = 0\.88;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_PROSE_HILL_ROLLING_FRICTION_PER_FRAME = 0\.972;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_PROSE_HILL_SIDE_WALL_RESTITUTION = 0\.34;/
    );
    assert.match(pageSource, /function collectZenLiveBotProseHillRect\(/);
    assert.match(
      pageSource,
      /querySelectorAll<HTMLElement>\(ZEN_LIVE_BOT_PROSE_HILL_SELECTOR\)/
    );
    assert.match(pageSource, /function resolveZenLiveBotAvatarProseHillPosition\(/);
    assert.match(pageSource, /function resolveZenLiveBotAvatarProseHillMotion\(/);
    assert.match(pageSource, /Math\.min\(320,\s*bounds\.width \* 1\.18\)/);
    assert.match(pageSource, /const hillStrength = Math\.max\(0\.22,\s*distanceRatio\);/);
    assert.match(pageSource, /Math\.abs\(velocity\.x\) > 42/);
    assert.match(pageSource, /const avatarProseHillRollingRef = useRef\(false\);/);
    assert.match(
      pageSource,
      /const inertiaDamping = Math\.pow\(\s*ZEN_LIVE_BOT_PROSE_HILL_INERTIA_DAMPING_PER_FRAME,/
    );
    assert.match(pageSource, /velocity\.y \* verticalDamping/);
    assert.match(
      pageSource,
      /speed < ZEN_LIVE_BOT_AVATAR_FLING_MIN_SPEED[\s\S]*const hillMotion = resolveZenLiveBotAvatarProseHillMotion\([\s\S]*initialVelocity = hillMotion\.velocity;/
    );
    assert.match(
      pageSource,
      /const hillMotion = resolveZenLiveBotAvatarProseHillMotion\(\s*current,\s*avatarVelocityRef\.current,[\s\S]*dt\s*\);/
    );
    assert.match(
      pageSource,
      /let nextVx = hillMotion\.velocity\.x;\s+let nextVy = hillMotion\.velocity\.y;\s+let nextX = current\.x \+ nextVx \* dt;/
    );
    assert.match(
      pageSource,
      /const hillRolling = hillMotion\.affected \|\| avatarProseHillRollingRef\.current;/
    );
    assert.match(
      pageSource,
      /hillRolling[\s\S]*\? ZEN_LIVE_BOT_PROSE_HILL_SIDE_WALL_RESTITUTION[\s\S]*: ZEN_LIVE_BOT_AVATAR_WALL_RESTITUTION/
    );
    assert.match(
      pageSource,
      /hillRolling && !hillMotion\.affected[\s\S]*ZEN_LIVE_BOT_PROSE_HILL_ROLLING_FRICTION_PER_FRAME/
    );
    assert.match(pageSource, /persistAvatarPositionIfUserRelocated\(next\);/);
    assert.doesNotMatch(pageSource, /ZEN_LIVE_BOT_PROSE_HILL_SLIDE_MS/);
    assert.doesNotMatch(pageSource, /ZEN_LIVE_BOT_PROSE_HILL_MIN_SIDE_SPEED/);
    assert.doesNotMatch(pageSource, /startAvatarProseHillSlide/);
    assert.doesNotMatch(pageSource, /settleAvatarAwayFromProseHill/);
    assert.doesNotMatch(
      pageSource,
      /setAvatarFlinging\(false\);\s+settleAvatarAwayFromProseHill\(true\);/
    );
    assert.match(
      pageSource,
      /resolveZenLiveBotActionCopyPlacement\([\s\S]*collectZenLiveBotProseHillRect/
    );
    assert.match(
      pageSource,
      /data-zen-live-prose-target=\{chatLikeSurface \? "true" : undefined\}/
    );
  });

  it("routes pre-stream Zen thinking state into the shared face spinner", () => {
    const mannequinStart = pageSource.indexOf("function ZenLiveBotMannequin");
    assert.notEqual(mannequinStart, -1);
    const mannequinEnd = pageSource.indexOf("function ZenLiveBotPresencePlate", mannequinStart);
    assert.notEqual(mannequinEnd, -1);
    const mannequinSource = pageSource.slice(mannequinStart, mannequinEnd);

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
    assert.match(mannequinSource, /className=\{styles\.zenLiveBotPresenceThinkingGlyphAnchor\}/);
    assert.match(mannequinSource, /showThinkingSpinner\s+baseText=\{plateFace\.text\}/);
    assert.match(mannequinSource, /className=\{styles\.zenLiveBotPresenceFaceEmissionMask\}/);
    assert.match(mannequinSource, /\{showThinkingSpinner \? \(/);
    assert.match(
      presenceSource,
      /data-thinking-spinner-active=\{faceSpinnerVisible \? "true" : undefined\}/
    );
    assert.doesNotMatch(mannequinSource, /zenLiveBotPresenceSpinner/);
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
    assert.match(
      zenSpinnerGlyphRule,
      /color:\s*var\(--zen-live-bot-face-ink,\s*var\(--zen-presence-face-ink\)\)\s*;/
    );
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

  it("turns active AskQuestion prompts into the live bot face glyph", () => {
    const mannequinStart = pageSource.indexOf("function ZenLiveBotMannequin");
    assert.notEqual(mannequinStart, -1);
    const mannequinEnd = pageSource.indexOf("function ZenLiveBotPresencePlate", mannequinStart);
    assert.notEqual(mannequinEnd, -1);
    const mannequinSource = pageSource.slice(mannequinStart, mannequinEnd);

    const presenceStart = pageSource.indexOf("function ZenLiveBotPresencePlate");
    assert.notEqual(presenceStart, -1);
    const presenceEnd = pageSource.indexOf("function wrapCleanupRevealMessageBody", presenceStart);
    assert.notEqual(presenceEnd, -1);
    const presenceSource = pageSource.slice(presenceStart, presenceEnd);

    assert.match(pageSource, /showQuestionMark\?: boolean;/);
    assert.match(mannequinSource, /showQuestionMark = false/);
    assert.match(mannequinSource, /showQuestionMark=\{showQuestionMark\}/);
    assert.match(presenceSource, /showQuestionMark=\{askQuestionActive\}/);
    assert.match(
      presenceSource,
      /data-ask-question-active=\{askQuestionActive \? "true" : undefined\}/
    );
    assert.doesNotMatch(pageSource, /data-zen-live-bot-question-marker/);
    assert.doesNotMatch(pageSource, /zenLiveBotPresenceQuestionMark/);

    const liveQuestionRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph[data-coffee-plate-question-glyph="true"]'
    );
    assert.match(
      liveQuestionRule,
      /font-size:\s*var\(--zen-live-bot-avatar-question-glyph-size,\s*clamp\(2rem,\s*4\.25vw,\s*2\.58rem\)\)\s*;/
    );
  });

  it("keeps static tiny message mood badges face-only and centered", () => {
    const moodFaceStart = pageSource.indexOf("function MessageMoodFace");
    assert.notEqual(moodFaceStart, -1);
    const moodFaceEnd = pageSource.indexOf("// PRISM fallback", moodFaceStart);
    assert.notEqual(moodFaceEnd, -1);
    const moodFaceSource = pageSource.slice(moodFaceStart, moodFaceEnd);
    assert.match(moodFaceSource, /<CoffeeSeatPlateEmoji/);
    assert.match(moodFaceSource, /questionMarkActive\?: boolean;/);
    assert.match(moodFaceSource, /showQuestionMark=\{questionMarkActive\}/);
    assert.match(moodFaceSource, /const showRasterFrame = variant === "prism";/);
    assert.match(moodFaceSource, /\{showRasterFrame \? <BotFaceFrame \/> : null\}/);
    assert.doesNotMatch(moodFaceSource, /BotFaceScreenTexture/);

    const staticMoodBadgeRule = ruleForExactSelector(
      '.messageMoodBadge[data-face="coffee"][data-variant="classic"]'
    );
    assert.match(staticMoodBadgeRule, /background:\s*[\s\S]*radial-gradient/);
    assert.match(staticMoodBadgeRule, /border:\s*1px solid/);
    assert.doesNotMatch(staticMoodBadgeRule, /url\(/);
  });

  it("drags from the Zen surface while preserving body geometry and relocation persistence", () => {
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
      /if \(!node \|\| !zenLiveBotAvatarPointerCanStartGrab\(node, clientX, clientY, options\)\) \{\s+return false;\s+\}/
    );
    assert.match(pageSource, /allowSurfaceDrag:\s*true/);
    assert.match(pageSource, /data-zen-live-bot-composer-boundary="true"/);
    assert.match(pageSource, /data-zen-live-bot-drag-exclusion="top-bar"/);
    assert.match(pageSource, /avatarPositionUserRelocatedRef\.current = true;/);
    assert.match(
      pageSource,
      /if \(!avatarPositionUserRelocatedRef\.current\) return;\s+persistZenLiveBotAvatarPosition\(position\);/
    );
  });

  it("finalizes metal blend modes without the temporary picker", () => {
    assert.doesNotMatch(pageSource, /BOT_METAL_BLEND_MODE_OPTIONS/);
    assert.doesNotMatch(pageSource, /BotMetalBlendTuning/);
    assert.doesNotMatch(pageSource, /normalizeBotMetalBlendMode/);
    assert.doesNotMatch(pageSource, /botMetalBlend/);
    assert.doesNotMatch(pageSource, /renderBotMetalBlendPicker/);
    assert.doesNotMatch(pageSource, /Temporary metal blend picker/);
    assert.doesNotMatch(css, /\.botMetalBlendPicker/);
    assert.doesNotMatch(css, /--bot-face-metal-dark-sheen/);
    assert.doesNotMatch(css, /--bot-face-metal-light-sheen/);
    assert.match(css, /--bot-face-metal-light-blend-mode:\s*overlay\s*;/);
    assert.match(css, /--bot-face-metal-light-blend-mode:\s*luminosity\s*;/);
    assert.match(css, /--bot-face-metal-light-opacity:\s*0\.58\s*;/);
    assert.match(css, /--bot-face-metal-light-opacity:\s*0\.34\s*;/);
  });

  it("lets the live bot overlap side panels while keeping top and bottom safe areas", () => {
    assert.match(
      pageSource,
      /const panelInsets = collectDevPanelSafeAreaInsets\(viewportWidth, viewportHeight\);/
    );
    assert.match(
      pageSource,
      /const insets = \{\s+\.\.\.panelInsets,\s+left: 0,\s+right: 0,\s+\};/
    );
    assert.match(pageSource, /safeAreaInsets\.top/);
    assert.match(pageSource, /safeAreaInsets\.bottom/);
  });

  it("hides the canvas wordmark while the left sidebar is open", () => {
    assert.match(
      pageSource,
      /data-chat-sidebar-hidden=\{sidebarOpen \? undefined : "true"\}/
    );
    assert.match(pageSource, /className=\{styles\.chatHeaderWordmarkColumn\}/);

    const sidebarOpenRule = ruleForExactSelector(
      '.appLayout:not([data-chat-sidebar-hidden="true"]) .chatHeaderWordmarkColumn'
    );
    assert.match(sidebarOpenRule, /display:\s*none\s*;/);
  });

  it("keeps default PRISM presence visible on collapsed empty Zen", () => {
    assert.match(
      pageSource,
      /const zenDefaultPrismPresenceVisible =\s*chatLikeSurface &&\s*zenPersonaBotId === null &&\s*zenPersonaPresence\.visibleBotId === null &&\s*\(!zenEmptyHeroVisible \|\| !sidebarOpen\);/
    );
  });

  it("keeps selected persona hero headings as Zen with name", () => {
    assert.match(
      pageSource,
      /<div className=\{styles\.emptyStateTitle\}>\s*\{`Zen with \$\{titleSubject\}`\}\s*<\/div>/
    );
  });

  it("moves refresh to the permanent recycle navbar button", () => {
    assert.match(pageSource, /Recycle,/);
    assert.match(pageSource, /onClick=\{\(\) => runAction\(refreshPrismFromNavbar\)\}/);
    assert.match(pageSource, /aria-label="Refresh Prism"/);
    assert.match(pageSource, /window\.location\.reload\(\)/);
    assert.doesNotMatch(pageSource, /createBuiltInRefreshCommand/);
    assert.doesNotMatch(pageSource, /id:\s*"builtin:\/refresh"/);
    assert.doesNotMatch(pageSource, /renderNavbarRefreshSplash/);
    assert.doesNotMatch(pageSource, /navbarRefreshSplashVisible/);
    assert.match(
      pageSource,
      /showLocalCommandToast\("Refresh moved", "Use the recycle icon in the navbar\."\)/
    );
  });

  it("does not keep the old custom navbar refresh splash mounted", () => {
    const headerRule = ruleForExactSelector(".chatHeader");
    assert.match(headerRule, /position:\s*relative\s*;/);
    assert.match(headerRule, /z-index:\s*180\s*;/);

    assert.doesNotMatch(css, /navbarRefreshSplash/);
    assert.doesNotMatch(css, /data-refresh-splash-active/);
  });
});
