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
const coffeeSeatPlateEmojiPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "CoffeeSeatPlateEmoji.tsx"
);
const botFramePublicDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/bot-frame");
const metalMaskPath = join(botFramePublicDir, "bot-frame-metal-mask.png");
const screenGlassMaskPath = join(botFramePublicDir, "bot-frame-screen-mask-glass.png");
const screenGrimeMaskPath = join(botFramePublicDir, "bot-frame-screen-grime-mask.png");
const nativeGeometryPaintMaskNames = [
  "bot-frame-top-crown-mask.png",
  "bot-frame-side-pods-mask.png",
  "bot-frame-lower-jaw-mask.png",
  "bot-frame-staggered-dashes-mask.png",
  "bot-frame-diagonal-sweep-mask.png",
  "bot-frame-quartered-panels-mask.png",
] as const;
const opaquePaintMaskNames = [
  "bot-frame-broken-band-mask.png",
  "bot-frame-offset-stripe-mask.png",
  ...nativeGeometryPaintMaskNames,
  "bot-frame-weathered-asymmetric-mask.png",
  "bot-frame-weathered-segments-mask.png",
  "bot-frame-weathered-ring-mask.png",
  "bot-frame-weathered-gap-mask.png",
] as const;
const css = readFileSync(cssPath, "utf8")
  .replace(/\s+/gu, " ")
  .replace(/\(\s+/gu, "(")
  .replace(/\s+\)/gu, ")");
const pageSource = readFileSync(pagePath, "utf8").replace(/\s+/gu, " ");
const coffeeSeatPlateEmojiSource = readFileSync(coffeeSeatPlateEmojiPath, "utf8");

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
  it("uses visible Ink blend modes on dark and light surfaces", () => {
    assert.match(
      pageSource,
      /DEFAULT_ZEN_PERSONA_BACKDROP_TUNING:[^{]+\{[^}]*darkBlendMode: "screen",[^}]*lightBlendMode: "multiply",/u
    );
    assert.equal(
      css.match(/--zen-persona-ink-blend-mode-dark: screen/g)?.length,
      3
    );
    assert.equal(
      css.match(/--zen-persona-ink-blend-mode-light: multiply/g)?.length,
      3
    );
    assert.match(
      ruleForExactSelector(".zenPersonaInkWash"),
      /mix-blend-mode: var\(--zen-persona-ink-blend-mode-dark, screen\)/u
    );
    assert.match(
      ruleForExactSelector(".themeLight .zenPersonaInkWash"),
      /mix-blend-mode: var\(--zen-persona-ink-blend-mode-light, multiply\)/u
    );
    assert.match(
      ruleForSelectorNeedles(
        ".themeLight .zenPersonaContinuityWash",
        ".themeLight .zenPersonaComposerBrushWash"
      ),
      /mix-blend-mode: var\(--zen-persona-ink-blend-mode-light, multiply\)/u
    );
  });

  it("keeps bot frame assets normalized to the 1000px canvas", () => {
    for (const assetName of [
      "bot-frame-base.png",
      "bot-frame-broken-band-mask.png",
      "bot-frame-chipped-paint-mask.png",
      "bot-frame-led.png",
      "bot-frame-light-base.png",
      "bot-frame-metal-mask.png",
      "bot-frame-metal.png",
      "bot-frame-offset-stripe-mask.png",
      ...opaquePaintMaskNames,
      "bot-frame-screen-mask-glass.png",
      "bot-frame-screen-grime-mask.png",
      "bot-frame-screen-mask.png",
      "bot-frame-tint-mask.png",
    ]) {
      const asset = PNG.sync.read(readFileSync(join(botFramePublicDir, assetName)));
      assert.equal(asset.width, 1000, `${assetName} width`);
      assert.equal(asset.height, 1000, `${assetName} height`);
    }
  });

  it("keeps paint masks at exactly transparent or opaque coverage", () => {
    for (const assetName of opaquePaintMaskNames) {
      const mask = PNG.sync.read(readFileSync(join(botFramePublicDir, assetName)));
      const pixelValues = new Set<string>();
      let paintedPixelCount = 0;
      for (let offset = 0; offset < mask.data.length; offset += 4) {
        const red = mask.data[offset] ?? 0;
        const green = mask.data[offset + 1] ?? 0;
        const blue = mask.data[offset + 2] ?? 0;
        const alpha = mask.data[offset + 3] ?? 0;
        pixelValues.add(`${red},${green},${blue},${alpha}`);
        if (alpha > 0) paintedPixelCount += 1;
      }

      const alphaAt = (x: number, y: number): number =>
        mask.data[(y * mask.width + x) * 4 + 3] ?? 0;
      assert.deepEqual(
        [...pixelValues].sort(),
        ["0,0,0,0", "255,255,255,255"],
        `${assetName} binary coverage pixels`
      );
      assert.ok(paintedPixelCount > 0, `${assetName} painted coverage`);
      assert.equal(alphaAt(0, 0), 0, `${assetName} top-left corner`);
      assert.equal(alphaAt(mask.width - 1, 0), 0, `${assetName} top-right corner`);
      assert.equal(alphaAt(0, mask.height - 1), 0, `${assetName} bottom-left corner`);
      assert.equal(
        alphaAt(Math.round(mask.width / 2), Math.round(mask.height / 2)),
        0,
        `${assetName} screen center`
      );
    }
  });

  it("keeps every paint mask within exact native frame geometry", () => {
    const geometry = PNG.sync.read(readFileSync(metalMaskPath));
    for (const assetName of opaquePaintMaskNames) {
      const mask = PNG.sync.read(readFileSync(join(botFramePublicDir, assetName)));
      assert.equal(mask.width, geometry.width, `${assetName} native width`);
      assert.equal(mask.height, geometry.height, `${assetName} native height`);
      for (let offset = 0; offset < mask.data.length; offset += 4) {
        const maskAlpha = mask.data[offset + 3] ?? 0;
        const geometryAlpha = geometry.data[offset + 3] ?? 0;
        if (maskAlpha > 0) {
          assert.ok(
            geometryAlpha >= 128,
            `${assetName} paints outside native geometry at pixel ${offset / 4}`
          );
        }
      }
    }
    assert.match(
      pageSource,
      /finishRecipe\.paintMaskAsset\}\?v=1003/
    );
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
    const mask = PNG.sync.read(readFileSync(screenGlassMaskPath));
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

  it("keeps the screen grime mask as a subtle oversized alpha map", () => {
    const mask = PNG.sync.read(readFileSync(screenGrimeMaskPath));
    const alphaAt = (x: number, y: number): number => mask.data[(y * mask.width + x) * 4 + 3] ?? 0;
    let maxAlpha = 0;
    for (let index = 3; index < mask.data.length; index += 4) {
      maxAlpha = Math.max(maxAlpha, mask.data[index] ?? 0);
    }

    assert.equal(alphaAt(0, 0), 0);
    assert.equal(alphaAt(mask.width - 1, 0), 0);
    assert.equal(alphaAt(0, mask.height - 1), 0);
    assert.equal(alphaAt(mask.width - 1, mask.height - 1), 0);
    assert.ok(alphaAt(Math.round(mask.width * 0.5), Math.round(mask.height * 0.5)) > 0);
    assert.ok(maxAlpha > 80);
    assert.ok(maxAlpha < 170);
  });

  it("keeps the rail passive while the visible avatar remains draggable", () => {
    const railRule = ruleForExactSelector(".zenLiveActionStatusRail");
    assert.match(railRule, /pointer-events:\s*none\s*;/);

    const plateRule = ruleForExactSelector(".zenLiveBotPresencePlate");
    assert.match(plateRule, /pointer-events:\s*auto\s*;/);
    assert.match(plateRule, /cursor:\s*default\s*;/);
    assert.match(plateRule, /touch-action:\s*none\s*;/);
    assert.match(plateRule, /user-select:\s*none\s*;/);
    assert.match(plateRule, /--zen-live-bot-eye-local-x:\s*-0\.2\s*;/);
    assert.match(plateRule, /--coffee-plate-emoji-nudge-y:\s*clamp\(-5px,\s*-2\.6%,\s*-2px\)\s*;/);

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
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_LOCKED_FACE_PLACEMENT:[\s\S]*=\s*BOT_AVATAR_CANONICAL_FACE_PLACEMENT;/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-avatar-body-size":\s*`\$\{bodySize\}px`/
    );
    assert.match(
      pageSource,
      /"--zen-live-bot-avatar-size":\s*`\$\{bodySize\}px`/
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
    assert.doesNotMatch(pageSource, /readZenLiveBotBodySize/);
    assert.doesNotMatch(pageSource, /readZenLiveBotFacePlacement/);
    assert.doesNotMatch(pageSource, /facePlacementScope/);
  });

  it("lets the Zen bot resize from its context menu while prose width moves inversely", () => {
    assert.match(
      pageSource,
      /const PRISM_ZEN_LIVE_BOT_AVATAR_SIZE_STORAGE_KEY =\s+"prism_zen_live_bot_avatar_size_v1";/
    );
    assert.match(pageSource, /const ZEN_LIVE_BOT_AVATAR_SIZE_STEP_PX = 24;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_PROSE_WIDTH_MIN_PX = 680;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_PROSE_WIDTH_DEFAULT_PX = 860;/);
    assert.match(pageSource, /const ZEN_LIVE_BOT_PROSE_WIDTH_MAX_PX = 980;/);
    assert.match(pageSource, /function readZenLiveBotAvatarSizePx\(\): number/);
    assert.match(pageSource, /function persistZenLiveBotAvatarSizePx\(sizePx: number\): void/);
    assert.match(pageSource, /function resizeZenLiveBotAvatarSizePx\(/);
    assert.match(pageSource, /function resolveZenLiveBotProseWidthPx\(avatarSizePx: number\): number/);
    assert.match(
      pageSource,
      /if \(normalizedSize === ZEN_LIVE_BOT_LOCKED_BODY_SIZE_PX\) \{\s+return ZEN_LIVE_BOT_PROSE_WIDTH_DEFAULT_PX;/
    );
    assert.match(
      pageSource,
      /ZEN_LIVE_BOT_PROSE_WIDTH_MAX_PX -\s+sizeProgress \* \(ZEN_LIVE_BOT_PROSE_WIDTH_MAX_PX - ZEN_LIVE_BOT_PROSE_WIDTH_MIN_PX\)/
    );
    assert.match(pageSource, /const \[zenLiveBotAvatarSizePx, setZenLiveBotAvatarSizePx\]/);
    assert.match(pageSource, /const \[zenLiveBotContextMenu, setZenLiveBotContextMenu\]/);
    assert.match(pageSource, /const openZenLiveBotContextMenu = useCallback/);
    assert.match(pageSource, /function renderZenLiveBotContextMenu\(\): React\.JSX\.Element \| null/);
    assert.match(pageSource, /label: "Grow"/);
    assert.match(pageSource, /label: "Shrink"/);
    assert.match(pageSource, /label: "Reset size"/);
    assert.match(pageSource, /label: "Edit avatar"/);
    assert.match(pageSource, /openBotCustomizer\(bot\);\s+setBotAvatarCustomizerOpen\(true\);/);
    assert.match(pageSource, /openDefaultBotCustomizer\(\);/);
    assert.match(
      pageSource,
      /"--zen-live-bot-prose-width":\s*`\$\{resolveZenLiveBotProseWidthPx\(\s*zenLiveBotAvatarSizePx\s*,?\s*\)\}px`/
    );

    const zenMessagesRule = ruleForNormalizedSelector(
      '.appLayout[data-zen-surface="true"] .messages[data-chat-ephemeral="true"]'
    );
    assert.match(
      zenMessagesRule,
      /--chat-reading-width:\s*min\(var\(--zen-live-bot-prose-width,\s*860px\),\s*94%\)\s*;/
    );

    const presenceCallSites = [...pageSource.matchAll(/<ZenLiveBotPresencePlate[\s\S]*?\/>/g)];
    assert.equal(presenceCallSites.length, 2);
    for (const callSite of presenceCallSites) {
      assert.match(callSite[0], /avatarSizePx=\{zenLiveBotAvatarSizePx\}/);
      assert.match(callSite[0], /onContextMenuRequest=\{openZenLiveBotContextMenu\}/);
    }
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
    assert.match(emissionMaskRule, /mix-blend-mode:\s*normal\s*;/);
    assert.match(emissionMaskRule, /overflow:\s*hidden\s*;/);
    assert.match(
      emissionMaskRule,
      /--bot-face-screen-mask-image:\s*url\("\/bot-frame\/bot-frame-screen-mask-glass\.png\?v=1000"\)\s*;/
    );
    assert.match(emissionMaskRule, /--bot-face-screen-mask-size:\s*100%\s*100%\s*;/);
    assert.match(emissionMaskRule, /--bot-face-screen-mask-repeat:\s*no-repeat\s*;/);
    assert.match(emissionMaskRule, /contain:\s*paint\s*;/);
    assert.match(emissionMaskRule, /--crt-strength:\s*1\s*;/);
    assert.match(emissionMaskRule, /--crt-core-opacity:\s*0\.82\s*;/);
    assert.match(emissionMaskRule, /--crt-beam-softness:\s*0\.45px\s*;/);
    assert.match(emissionMaskRule, /--crt-bloom-narrow-radius:\s*1\.25px\s*;/);
    assert.match(emissionMaskRule, /--crt-bloom-narrow-strength:\s*0\.28\s*;/);
    assert.match(emissionMaskRule, /--crt-bloom-wide-radius:\s*6px\s*;/);
    assert.match(emissionMaskRule, /--crt-bloom-wide-strength:\s*0\.08\s*;/);
    assert.match(emissionMaskRule, /--crt-phosphor-opacity:\s*0\.16\s*;/);
    assert.match(emissionMaskRule, /--crt-phosphor-midtone-strength:\s*0\.38\s*;/);
    assert.match(emissionMaskRule, /--crt-phosphor-bright-strength:\s*0\.14\s*;/);
    assert.match(emissionMaskRule, /--crt-unlit-phosphor-opacity:\s*0\.018\s*;/);
    assert.match(emissionMaskRule, /--crt-phosphor-scale:\s*clamp\(1\.85px,\s*1\.16%,\s*3\.8px\)\s*;/);
    assert.match(emissionMaskRule, /--crt-scanline-opacity:\s*0\.045\s*;/);
    assert.match(emissionMaskRule, /--crt-scanline-pitch:\s*clamp\(3px,\s*1\.82%,\s*5px\)\s*;/);
    assert.match(emissionMaskRule, /--crt-pixel-grid-opacity:\s*0\.14\s*;/);
    assert.match(
      emissionMaskRule,
      /--crt-pixel-grid-line-width:\s*clamp\(0\.32px,\s*0\.18%,\s*0\.48px\)\s*;/,
    );
    assert.match(emissionMaskRule, /--crt-static-opacity:\s*0\.03\s*;/);
    assert.match(emissionMaskRule, /--crt-static-speed:\s*860ms\s*;/);
    assert.match(emissionMaskRule, /--crt-convergence-offset:\s*0\.26px\s*;/);
    assert.match(emissionMaskRule, /--crt-convergence-opacity:\s*0\.068\s*;/);
    assert.match(emissionMaskRule, /--crt-vignette-strength:\s*0\.2\s*;/);
    assert.match(emissionMaskRule, /--crt-fresnel-strength:\s*0\.2\s*;/);
    assert.match(emissionMaskRule, /--crt-glare-strength:\s*0\.24\s*;/);
    assert.match(emissionMaskRule, /--crt-accent-rgb:\s*255 255 255\s*;/);
    assert.match(emissionMaskRule, /--crt-noise-opacity:\s*var\(--crt-static-opacity\)\s*;/);
    assert.match(emissionMaskRule, /--crt-breath-speed:\s*11\.8s\s*;/);
    assert.match(emissionMaskRule, /--crt-breath-strength:\s*0\.0018\s*;/);
    assert.match(emissionMaskRule, /filter:\s*none\s*;/);
    assert.match(
      emissionMaskRule,
      /-webkit-mask-image:\s*var\(--bot-face-screen-mask-image\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /-webkit-mask-size:\s*var\(--bot-face-screen-mask-size\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /-webkit-mask-repeat:\s*var\(--bot-face-screen-mask-repeat\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /mask-image:\s*var\(--bot-face-screen-mask-image\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /mask-size:\s*var\(--bot-face-screen-mask-size\)\s*;/
    );
    assert.match(
      emissionMaskRule,
      /mask-repeat:\s*var\(--bot-face-screen-mask-repeat\)\s*;/
    );
    assert.match(emissionMaskRule, /pointer-events:\s*none\s*;/);

    const cleanProfileRule = ruleForExactSelector(
      '.zenLiveBotPresenceFaceEmissionMask[data-crt-profile="clean"]'
    );
    assert.match(cleanProfileRule, /--crt-core-opacity:\s*0\.94\s*;/);
    assert.match(cleanProfileRule, /--crt-phosphor-midtone-strength:\s*0\.42\s*;/);
    assert.match(cleanProfileRule, /--crt-phosphor-bright-strength:\s*0\.17\s*;/);
    assert.match(cleanProfileRule, /--crt-static-opacity:\s*0\.026\s*;/);
    assert.ok(ruleForExactSelector('.zenLiveBotPresenceFaceEmissionMask[data-crt-profile="arcade"]'));
    assert.ok(ruleForExactSelector('.zenLiveBotPresenceFaceEmissionMask[data-crt-profile="broadcast"]'));
    assert.ok(ruleForExactSelector('.zenLiveBotPresenceFaceEmissionMask[data-crt-profile="worn"]'));
    assert.ok(ruleForExactSelector('.zenLiveBotPresenceFaceEmissionMask[data-crt-phosphor="white"]'));
    assert.ok(ruleForExactSelector('.zenLiveBotPresenceFaceEmissionMask[data-crt-phosphor="green"]'));
    assert.ok(ruleForExactSelector('.zenLiveBotPresenceFaceEmissionMask[data-crt-phosphor="amber"]'));
    assert.ok(ruleForExactSelector('.zenLiveBotPresenceFaceEmissionMask[data-crt-phosphor="bot"]'));

    const lightCrtRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-theme="light"] .zenLiveBotPresenceFaceEmissionMask'
    );
    assert.match(lightCrtRule, /--crt-core-opacity:\s*0\.88\s*;/);
    assert.match(lightCrtRule, /--crt-bloom-wide-strength:\s*0\.045\s*;/);
    assert.match(lightCrtRule, /--crt-static-opacity:\s*0\.018\s*;/);
    const darkCrtRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-theme="dark"] .zenLiveBotPresenceFaceEmissionMask'
    );
    assert.match(darkCrtRule, /--crt-bloom-narrow-strength:\s*0\.31\s*;/);
    assert.match(darkCrtRule, /--crt-vignette-strength:\s*0\.22\s*;/);

    assert.match(
      pageSource,
      /className=\{styles\.zenLiveBotPresenceFaceEmissionMask\}[\s\S]*botFaceCrtNoiseLayer[\s\S]*botFaceCrtBreathingLayer[\s\S]*CoffeeSeatPlateEmoji/
    );
    assert.match(pageSource, /data-crt-profile="clean"/);
    assert.match(pageSource, /data-crt-phosphor="white"/);
    assert.match(
      pageSource,
      /botFaceCrtBreathingLayer[\s\S]*botFaceCrtGrimeLayer[\s\S]*data-crt-material-layer="grime"[\s\S]*style=\{screenMaterialStyle\}[\s\S]*CoffeeSeatPlateEmoji/
    );
    assert.match(
      pageSource,
      /CoffeeSeatPlateEmoji[\s\S]*botFaceCrtPixelGridLayer[\s\S]*data-crt-material-layer="pixel-grid"[\s\S]*depth="above-face"/,
    );
    assert.match(pageSource, /function botScreenMaterialSeedForBot/);
    assert.match(pageSource, /return "bot-screen-material:shared-curved-glass";/);
    assert.match(pageSource, /function botScreenMaterialStyle/);
    assert.match(pageSource, /\["--bot-face-crt-grime-rotation" as string\]: "0deg"/);
    assert.match(pageSource, /\["--bot-face-crt-grime-x" as string\]: "0%"/);
    assert.match(pageSource, /\["--bot-face-crt-grime-y" as string\]: "0%"/);
    assert.match(pageSource, /\["--bot-face-crt-grime-scale" as string\]: "1"/);
    assert.match(pageSource, /\["--bot-face-crt-grime-opacity" as string\]: "0\.24"/);
    assert.match(pageSource, /\["--bot-face-crt-grime-blur" as string\]: "0\.16px"/);
    assert.doesNotMatch(pageSource, /stableUnitValue\(`\$\{normalizedSeed\}:grime:/);
    assert.match(pageSource, /const screenMaterialSeed = botScreenMaterialSeedForBot\(bot,\s*"prism"\);/);
    assert.match(pageSource, /screenMaterialSeed=\{screenMaterialSeed\}/);
    assert.match(
      pageSource,
      /screenMaterialSeed=\{\s*botScreenMaterialSeedForBot\(\s*bot\s*,\s*bot\.id\s*,?\s*\)\s*\}/
    );
    assert.match(pageSource, /function botFrameMaterialSeedForBot/);
    assert.match(pageSource, /normalizeImportedBotHash\(bot\?\.export_hash\)/);
    assert.match(pageSource, /function botFrameMetalMaterialStyle/);
    assert.match(pageSource, /botFrameFinishForSeed\(normalizedSeed\)/);
    assert.match(pageSource, /botFrameFinishMirroredForSeed\(normalizedSeed\)/);
    assert.match(pageSource, /--bot-face-frame-finish-scale-x/);
    assert.match(pageSource, /--bot-face-frame-paint-mask-image/);
    assert.match(pageSource, /--bot-face-frame-wear-mask-image/);
    assert.match(pageSource, /\$\{normalizedSeed\}:metal-scratch:rotation/);
    assert.match(pageSource, /"--bot-face-metal-scratch-opacity"/);
    assert.match(
      pageSource,
      /const frameMaterialSeed = defaultPrismPresence\s*\? PRISM_FACTORY_CLEAN_FRAME_SEED\s*:\s*botFrameMaterialSeedForBot\(bot,\s*"prism"\);/
    );
    assert.match(pageSource, /frameMaterialSeed=\{frameMaterialSeed\}/);
    assert.match(
      pageSource,
      /frameMaterialSeed=\{\s*botFrameMaterialSeedForBot\(\s*bot\s*,\s*bot\.id\s*,?\s*\)\s*\}/
    );
    assert.match(
      pageSource,
      /frameMaterialSeed=\{\s*isDefaultPrismBot\s*\? PRISM_FACTORY_CLEAN_FRAME_SEED\s*:\s*frameMaterialSeed\s*\}/
    );

    const phosphorRule = rulesForExactSelector(".zenLiveBotPresenceFaceEmissionMask::before").find(
      (rule) => /Unlit aperture grille/.test(rule)
    );
    assert.ok(phosphorRule, "Missing clipped unlit CRT aperture-grille layer");
    assert.match(phosphorRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(phosphorRule, /rgb\(var\(--crt-phosphor-red-rgb\) \/ var\(--crt-unlit-phosphor-opacity\)\)/);
    assert.match(phosphorRule, /rgb\(var\(--crt-phosphor-green-rgb\) \/ var\(--crt-unlit-phosphor-opacity\)\)/);
    assert.match(phosphorRule, /rgb\(var\(--crt-phosphor-blue-rgb\) \/ var\(--crt-unlit-phosphor-opacity\)\)/);
    assert.match(phosphorRule, /background-size:\s*[\s\S]*var\(--crt-phosphor-scale\) 100%/);
    assert.match(phosphorRule, /mix-blend-mode:\s*screen\s*;/);
    assert.doesNotMatch(phosphorRule, /bot-face-crt-screen-texture-image/);
    assert.doesNotMatch(phosphorRule, /repeating-radial-gradient/);

    const scanlineRule = rulesForExactSelector(".zenLiveBotPresenceFaceEmissionMask::after").find(
      (rule) => /Scanlines are screen-fixed/.test(rule)
    );
    assert.ok(scanlineRule, "Missing dedicated CRT scanline layer");
    assert.doesNotMatch(scanlineRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(scanlineRule, /repeating-linear-gradient\(\s*0deg/);
    assert.match(scanlineRule, /var\(--crt-scanline-opacity\)/);
    assert.match(scanlineRule, /var\(--crt-scanline-pitch\)/);
    assert.match(scanlineRule, /mix-blend-mode:\s*multiply\s*;/);

    const pixelGridRule = ruleForExactSelector(".botFaceCrtPixelGridLayer");
    assert.match(pixelGridRule, /position:\s*absolute\s*;/);
    assert.match(pixelGridRule, /inset:\s*0\s*;/);
    assert.match(pixelGridRule, /z-index:\s*6\s*;/);
    assert.match(pixelGridRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(pixelGridRule, /repeating-linear-gradient\(\s*0deg/);
    assert.match(pixelGridRule, /var\(--bot-face-crt-cell-width\)/);
    assert.match(pixelGridRule, /var\(--bot-face-crt-cell-height\)/);
    assert.match(pixelGridRule, /opacity:\s*var\(--crt-pixel-grid-opacity\)\s*;/);
    assert.match(pixelGridRule, /mix-blend-mode:\s*multiply\s*;/);
    assert.doesNotMatch(pixelGridRule, /filter:/);
    assert.doesNotMatch(pixelGridRule, /data-crt-glyph-layer/);

    const glyphEmissionRule = ruleForSelectorNeedlesWithBody(
      ['[data-crt-glyph-layer="true"]'],
      "--crt-glyph-core-opacity"
    );
    assert.match(glyphEmissionRule, /--crt-glyph-core-opacity:\s*var\(--crt-core-opacity,\s*0\.82\)\s*;/);
    assert.match(glyphEmissionRule, /--crt-glyph-phosphor-midtone-strength:\s*var\(--crt-phosphor-midtone-strength,\s*0\.38\)\s*;/);
    assert.match(glyphEmissionRule, /--crt-glyph-phosphor-bright-strength:\s*var\(--crt-phosphor-bright-strength,\s*0\.14\)\s*;/);
    assert.match(glyphEmissionRule, /--crt-glyph-core-red-rgb:\s*var\(--crt-phosphor-red-rgb,\s*255 246 238\)\s*;/);
    assert.match(glyphEmissionRule, /--crt-glyph-core-green-rgb:\s*var\(--crt-phosphor-green-rgb,\s*235 255 246\)\s*;/);
    assert.match(glyphEmissionRule, /--crt-glyph-core-blue-rgb:\s*var\(--crt-phosphor-blue-rgb,\s*218 238 255\)\s*;/);
    assert.match(glyphEmissionRule, /--crt-glyph-paint-bleed:\s*var\(--crt-glyph-core-paint-bleed,\s*0\.08em\)\s*;/);
    assert.match(glyphEmissionRule, /display:\s*inline-grid\s*;/);
    assert.match(glyphEmissionRule, /inline-size:\s*max-content\s*;/);
    assert.match(glyphEmissionRule, /min-inline-size:\s*100%\s*;/);
    assert.match(
      glyphEmissionRule,
      /block-size:\s*calc\(\s*1em\s*\+\s*var\(--crt-glyph-paint-bleed\)\s*\+\s*var\(--crt-glyph-paint-bleed\)\s*\)\s*;/
    );
    assert.match(glyphEmissionRule, /padding-inline:\s*var\(--crt-glyph-paint-bleed\)\s*;/);
    assert.match(glyphEmissionRule, /padding-block:\s*var\(--crt-glyph-paint-bleed\)\s*;/);
    assert.match(glyphEmissionRule, /margin-inline:\s*calc\(var\(--crt-glyph-paint-bleed\) \* -1\)\s*;/);
    assert.match(glyphEmissionRule, /margin-block:\s*calc\(var\(--crt-glyph-paint-bleed\) \* -1\)\s*;/);
    assert.match(glyphEmissionRule, /overflow:\s*visible\s*;/);
    assert.match(glyphEmissionRule, /-webkit-text-stroke:\s*0\s*;/);
    assert.match(glyphEmissionRule, /paint-order:\s*fill\s*;/);
    assert.match(glyphEmissionRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(glyphEmissionRule, /rgb\(var\(--crt-glyph-core-red-rgb\) \/ var\(--crt-glyph-phosphor-midtone-strength\)\)/);
    assert.match(glyphEmissionRule, /rgb\(var\(--crt-glyph-core-green-rgb\) \/ var\(--crt-glyph-phosphor-midtone-strength\)\)/);
    assert.match(glyphEmissionRule, /rgb\(var\(--crt-glyph-core-blue-rgb\) \/ var\(--crt-glyph-phosphor-midtone-strength\)\)/);
    assert.match(glyphEmissionRule, /-webkit-background-clip:\s*text\s*;/);
    assert.match(glyphEmissionRule, /-webkit-text-fill-color:\s*transparent\s*;/);

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

    const zenFaceGlyphRule = ruleForExactSelector(".coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph");
    assert.match(zenFaceGlyphRule, /--crt-glyph-core-paint-bleed:\s*0\.14em\s*;/);

    const glyphCloneBaseRule = ruleForExactSelector(
      '.coffeeSeatPlateEmoji [data-crt-glyph-layer="true"]::before'
    );
    assert.match(glyphCloneBaseRule, /-webkit-background-clip:\s*border-box\s*;/);
    assert.match(glyphCloneBaseRule, /background-clip:\s*border-box\s*;/);
    assert.match(glyphCloneBaseRule, /-webkit-text-fill-color:\s*currentColor\s*;/);
    assert.match(glyphCloneBaseRule, /background:\s*none\s*;/);

    const featurePartRule = ruleForSelectorNeedlesWithBody(
      [".coffeeSeatPlateEmoji [data-coffee-plate-emoji-part]"],
      "text-align: center"
    );
    assert.match(featurePartRule, /--coffee-face-feature-paint-pad-block/);
    assert.match(featurePartRule, /--coffee-face-feature-paint-pad-inline/);
    assert.match(
      featurePartRule,
      /inline-size:\s*calc\(\s*100%\s*\+\s*var\(--coffee-face-feature-paint-pad-inline,\s*0em\)\s*\+\s*var\(--coffee-face-feature-paint-pad-inline,\s*0em\)\s*\)\s*;/
    );
    assert.match(
      featurePartRule,
      /margin-inline:\s*calc\(var\(--coffee-face-feature-paint-pad-inline,\s*0em\) \* -1\)\s*;/
    );
    assert.match(
      featurePartRule,
      /margin-block:\s*calc\(var\(--coffee-face-feature-paint-pad-block,\s*0em\) \* -1\)\s*;/
    );
    assert.match(featurePartRule, /overflow:\s*visible\s*;/);
    assert.match(featurePartRule, /text-align:\s*center\s*;/);

    const featureGeometryDebugRule = ruleForSelectorNeedlesWithBody(
      ['.zenLiveBotPresenceFaceEmissionMask[data-crt-debug="feature-geometry"]'],
      "--crt-glyph-beam-softness"
    );
    assert.match(featureGeometryDebugRule, /--crt-glyph-beam-softness:\s*0px\s*;/);
    assert.match(featureGeometryDebugRule, /--crt-convergence-offset:\s*0px\s*;/);
    assert.ok(
      ruleForSelectorNeedlesWithBody(
        ['[data-crt-debug-pass="lit-phosphor-emission"]'],
        "#ffe94a"
      )
    );

    const glyphBloomRule = rulesForExactSelector(
      '.coffeeSeatPlateEmoji [data-crt-glyph-layer="true"]::before'
    ).find((rule) => /--crt-glyph-bloom-narrow-radius/.test(rule));
    assert.ok(glyphBloomRule, "Missing glyph bloom emission rule");
    assert.match(glyphBloomRule, /--crt-glyph-bloom-narrow-radius/);
    assert.match(glyphBloomRule, /--crt-glyph-bloom-wide-radius/);
    assert.match(
      glyphBloomRule,
      /mix-blend-mode:\s*var\(--crt-face-glow-blend-mode,\s*screen\)\s*;/
    );

    const glyphConvergenceRule = ruleForSelectorNeedlesWithBody(
      ['.coffeeSeatPlateEmoji [data-crt-glyph-layer="true"]::after'],
      "rgb(70 218 255"
    );
    assert.match(glyphConvergenceRule, /background:\s*[\s\S]*linear-gradient/);
    assert.match(glyphConvergenceRule, /repeating-linear-gradient\(\s*90deg/);
    assert.match(glyphConvergenceRule, /-webkit-background-clip:\s*text\s*;/);
    assert.match(glyphConvergenceRule, /background-clip:\s*text\s*;/);
    assert.match(glyphConvergenceRule, /-webkit-text-fill-color:\s*transparent\s*;/);
    assert.match(
      glyphConvergenceRule,
      /-webkit-text-stroke:\s*calc\(\s*var\(--bot-face-weight-stroke,\s*0em\) \+ 0\.012em\s*\)\s*var\(--zen-live-bot-face-phosphor-ink,\s*#ffffff\)\s*;/,
    );
    assert.match(glyphConvergenceRule, /paint-order:\s*stroke fill\s*;/);
    assert.match(glyphConvergenceRule, /rgb\(255 54 78 \/ var\(--crt-glyph-convergence-opacity\)\)/);
    assert.match(glyphConvergenceRule, /rgb\(70 218 255 \/ var\(--crt-glyph-convergence-opacity\)\)/);
    assert.match(glyphConvergenceRule, /mix-blend-mode:\s*screen\s*;/);

    const noiseRule = ruleForSelectorNeedlesWithBody(
      [".botFaceCrtNoiseLayer"],
      "mix-blend-mode: hard-light"
    );
    assert.match(noiseRule, /opacity:\s*var\(--crt-noise-opacity\)\s*;/);
    assert.match(noiseRule, /data:image\/svg\+xml/);
    assert.match(noiseRule, /feTurbulence/);
    assert.match(noiseRule, /baseFrequency='0\.82'/);
    assert.match(noiseRule, /feComponentTransfer/);
    assert.match(noiseRule, /opacity='0\.86'/);
    assert.doesNotMatch(noiseRule, /repeating-radial-gradient/);
    assert.match(noiseRule, /mix-blend-mode:\s*hard-light\s*;/);
    assert.match(noiseRule, /filter:\s*contrast\(1\.12\) saturate\(0\) brightness\(0\.62\)\s*;/);
    assert.match(noiseRule, /animation:\s*crtStaticSnowJitter var\(--crt-static-speed\) steps\(9,\s*end\) infinite\s*;/);

    const grimeRule = ruleForSelectorNeedlesWithBody(
      [".botFaceCrtGrimeLayer"],
      "backdrop-filter"
    );
    assert.match(grimeRule, /inset:\s*0\s*;/);
    assert.match(grimeRule, /z-index:\s*8\s*;/);
    assert.match(grimeRule, /var\(--bot-face-screen-glare-x,\s*38%\)/);
    assert.match(grimeRule, /var\(--bot-face-screen-glare-y,\s*44%\)/);
    assert.match(grimeRule, /var\(--crt-vignette-strength\)/);
    assert.match(grimeRule, /var\(--crt-fresnel-strength\)/);
    assert.match(grimeRule, /var\(--crt-glare-strength\)/);
    assert.doesNotMatch(grimeRule, /repeating-radial-gradient/);
    assert.doesNotMatch(grimeRule, /repeating-linear-gradient/);
    assert.match(grimeRule, /mix-blend-mode:\s*normal\s*;/);
    assert.match(grimeRule, /backdrop-filter:\s*[\s\S]*blur\(var\(--bot-face-crt-grime-blur\)\)[\s\S]*saturate\(1\.02\)[\s\S]*contrast\(1\.03\)/);
    assert.doesNotMatch(grimeRule, /mask-image:\s*var\(--bot-face-crt-grime-mask-image\)/);
    assert.match(grimeRule, /translate3d\(var\(--bot-face-crt-grime-x\),\s*var\(--bot-face-crt-grime-y\),\s*0\)/);
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
    assert.match(css, /@keyframes crtStaticSnowJitter/);
    assert.match(css, /@keyframes crtElectronicBreath/);
    assert.match(css, /@keyframes crtElectronicBreathCounter/);
    assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.botFaceCrtGrimeLayer[\s\S]*animation:\s*none\s*;/);
    assert.match(css, /data-crt-debug-layer="base"/);
    assert.match(css, /data-crt-debug-layer="unlit-phosphor"/);
    assert.match(css, /data-crt-debug-layer="static"/);
    assert.match(css, /data-crt-debug-layer="source-glyph"/);
    assert.match(css, /data-crt-debug-layer="wide-halo"/);
    assert.match(css, /data-crt-debug-layer="narrow-bloom"/);
    assert.match(css, /data-crt-debug-layer="lit-phosphor-emission"/);
    assert.match(css, /data-crt-debug-layer="sharp-core"/);
    assert.match(css, /data-crt-debug-layer="red-convergence"/);
    assert.match(css, /data-crt-debug-layer="blue-convergence"/);
    assert.match(css, /data-crt-debug-layer="scanlines"/);
    assert.match(css, /data-crt-debug-layer="curvature"/);
    assert.match(css, /data-crt-debug-layer="fresnel"/);
    assert.match(css, /data-crt-debug-layer="glass-and-glare"/);
    assert.match(css, /data-crt-debug-layer="final"/);

    const faceRigRule = ruleForExactSelector(".zenLiveBotPresenceFaceRig");
    assert.match(faceRigRule, /left:\s*var\(--zen-live-bot-face-x,\s*50%\)/);
    assert.match(faceRigRule, /top:\s*var\(--zen-live-bot-face-y,\s*50%\)/);
    assert.match(faceRigRule, /z-index:\s*6\s*;/);
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
    assert.match(
      pageSource,
      /data-zen-live-bot-presence-plate="true"[\s\S]*<BotAmbientPresenceRig[\s\S]*scheduleKey=\{`zen-live-/,
    );
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
    assert.match(faceRule, /--bot-face-ambient-glow-color:\s*var\(--zen-live-bot-frame-tint-color,\s*var\(--coffee-bot-color\)\)\s*;/);
    assert.match(faceRule, /--bot-face-ambient-glow-size:\s*86%\s*;/);
    assert.match(faceRule, /--bot-face-ambient-glow-opacity:\s*0\.36\s*;/);
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
    assert.match(faceRule, /--bot-face-screen-glare-opacity:\s*0\.18\s*;/);
    assert.match(faceRule, /--zen-live-bot-screen-glass-overlay-opacity:\s*0\.09\s*;/);
    assert.match(faceRule, /--zen-live-bot-screen-glare-overlay-opacity:\s*0\.16\s*;/);
    assert.match(faceRule, /box-shadow:\s*[\s\S]*--bot-face-ambient-glow-blur[\s\S]*--bot-face-ambient-glow-spread/);
    assert.match(faceRule, /width:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(faceRule, /height:\s*var\(--zen-live-bot-body-frame-size\)/);
    assert.match(faceRule, /transform:\s*translate\(-50%,\s*-50%\)\s*;/);
    assert.match(faceRule, /pointer-events:\s*none\s*;/);
    assert.doesNotMatch(faceRule, /cursor:\s*grab\s*;/);
    assert.doesNotMatch(faceRule, /animation:\s*zenLiveBotPresenceIdle/);
    assert.doesNotMatch(faceRule, /scale\(1\.006\)/);
    assert.doesNotMatch(css, /@keyframes zenLiveBotPresenceIdle\b/);
    assert.doesNotMatch(css, /zenLiveBotPresenceIdle/);
    assert.match(
      css,
      /@keyframes zenLiveBotIdleLightBreath\s*\{[\s\S]*opacity:\s*var\(--zen-live-bot-idle-light-opacity-low,\s*1\);[\s\S]*filter:\s*var\(--zen-live-bot-idle-light-filter-low,\s*brightness\(0\.96\)\);[\s\S]*54% \{[\s\S]*opacity:\s*var\(--zen-live-bot-idle-light-opacity-high,\s*1\);[\s\S]*filter:\s*var\(--zen-live-bot-idle-light-filter-high,\s*brightness\(1\.06\)\);/
    );

    const idleFrameTintRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate:not([data-talking="true"]):not([data-transitioning="true"]) .botFaceFrameTint'
    );
    assert.match(
      idleFrameTintRule,
      /animation:\s*zenLiveBotIdleLightBreath 4\.8s ease-in-out infinite\s*;/
    );
    assert.match(idleFrameTintRule, /--zen-live-bot-idle-light-filter-low:/);
    assert.match(idleFrameTintRule, /--zen-live-bot-idle-light-filter-high:/);
    assert.doesNotMatch(idleFrameTintRule, /transform:/);

    const idleLedRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate:not([data-talking="true"]):not([data-transitioning="true"]) .botFaceFrameLed'
    );
    assert.match(
      idleLedRule,
      /animation:\s*zenLiveBotIdleLightBreath 4\.8s ease-in-out infinite\s*;/
    );
    assert.match(idleLedRule, /brightness\(0\.94\)/);
    assert.match(idleLedRule, /brightness\(1\.08\)/);
    assert.doesNotMatch(idleLedRule, /transform:/);

    const glyphPartRule = ruleForSelectorNeedlesWithBody(
      [".zenLiveBotPresenceFaceGlyph", "[data-coffee-plate-emoji-part]"],
      "--zen-live-bot-idle-face-glow-filter-high"
    );
    assert.match(glyphPartRule, /--zen-live-bot-idle-face-glow-filter-high:/);
    assert.match(glyphPartRule, /--crt-face-glow-filter:\s*var\(--zen-live-bot-idle-face-glow-filter-high\)\s*;/);
    assert.doesNotMatch(glyphPartRule, /zenLiveBotIdleLightBreath/);

    const glyphLayerRule = ruleForNormalizedSelector(
      '.zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part] [data-crt-glyph-layer="true"]'
    );
    assert.match(
      glyphLayerRule,
      /animation:\s*zenLiveBotCrtFaceFlicker 11\.7s linear infinite\s*;/
    );
    assert.match(css, /@keyframes zenLiveBotCrtFaceFlicker/);

    const coffeeIdleFrameTintRule = ruleForNormalizedSelector(
      '.coffeeSeat:not([data-table-speaking="true"]) .coffeeSeatPlate[data-live-body-style="zen"] .botFaceFrameTint'
    );
    assert.match(
      coffeeIdleFrameTintRule,
      /animation:\s*zenLiveBotIdleLightBreath 4\.8s ease-in-out infinite\s*;/
    );

    const coffeeGlyphRule = ruleForSelectorNeedlesWithBody(
      [
        '.coffeeSeatPlate[data-live-body-style="zen"]',
        ".coffeeSeatPlateEmoji",
        "[data-coffee-plate-emoji-part]",
      ],
      "--zen-live-bot-idle-face-glow-filter-high"
    );
    assert.doesNotMatch(coffeeGlyphRule, /zenLiveBotIdleLightBreath/);
    const coffeeGlyphLayerRule = ruleForNormalizedSelector(
      '.coffeeSeatPlate[data-live-body-style="zen"] .coffeeSeatPlateEmoji [data-coffee-plate-emoji-part] [data-crt-glyph-layer="true"]'
    );
    assert.match(
      coffeeGlyphLayerRule,
      /animation:\s*zenLiveBotCrtFaceFlicker 11\.7s linear infinite\s*;/
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.zenLiveBotPresencePlate:not\(\[data-talking="true"\]\):not\(\[data-transitioning="true"\]\)[\s\S]*\.botFaceFrameTint,[\s\S]*\.botFaceFrameLed,[\s\S]*animation:\s*none\s*;/
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\[data-coffee-plate-emoji-part\][\s\S]*\[data-crt-glyph-layer="true"\][\s\S]*animation:\s*none\s*;/
    );

    const faceGlyphRule = ruleForExactSelector(".coffeeSeatPlateEmoji.zenLiveBotPresenceFaceGlyph");
    assert.match(
      faceGlyphRule,
      /clamp\(1\.74rem,\s*calc\(var\(--zen-live-bot-body-frame-size,\s*190px\) \* 0\.217\),\s*4\.08rem\)/
    );

    const movingFaceRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-dragging="true"] .zenLiveBotPresenceFace'
    );
    assert.match(movingFaceRule, /--bot-face-ambient-glow-opacity:\s*0\.5\s*;/);
    assert.match(movingFaceRule, /--zen-live-bot-screen-glass-overlay-opacity:\s*0\.12\s*;/);
    assert.match(movingFaceRule, /--zen-live-bot-screen-glare-overlay-opacity:\s*0\.2\s*;/);

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
    assert.match(lightFaceRule, /--bot-face-ambient-glow-opacity:\s*0\.32\s*;/);
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

    const coffeeLightZenRule = ruleForSelectorNeedles(
      ".themeLight.coffeeShell",
      '.coffeeSeatPlate[data-live-body-style="zen"]',
      ".zenLiveBotPresenceFace"
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
    assert.match(prismLightRule, /--zen-live-bot-frame-tint-color:\s*#f7fbff\s*;/);
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
    assert.match(
      frameRule,
      /--bot-face-metal-scratch-mask-image:\s*url\("\/bot-frame\/bot-frame-metal-mask\.png\?v=1000"\)\s*;/
    );
    assert.match(frameRule, /--bot-face-metal-scratch-opacity:\s*0\s*;/);
    assert.match(frameRule, /z-index:\s*var\(--bot-face-frame-z,\s*2\)/);
    assert.match(frameRule, /var\(--bot-face-frame-glow-filter,\s*drop-shadow\(0 0 0 transparent\)\)/);
    assert.match(frameRule, /opacity:\s*var\(--bot-face-frame-opacity,\s*1\)\s*;/);
    assert.match(frameRule, /overflow:\s*hidden\s*;/);
    assert.match(frameRule, /border-radius:\s*50%\s*;/);
    assert.match(frameRule, /clip-path:\s*circle\(50% at 50% 50%\)\s*;/);
    assert.doesNotMatch(frameRule, /coffee-plate-emoji-face-scale-y/);
    assert.equal(
      pageSource.match(/className=\{styles\.botFaceFrameLed\}/g)?.length,
      1,
      "one top-level LED layer"
    );
    assert.match(
      pageSource,
      /function BotFaceFrame\(\{[\s\S]*metalMaterialStyle[\s\S]*<BotFaceScreenFill \/>[\s\S]*className=\{styles\.botFaceFrame\} style=\{metalMaterialStyle\}[\s\S]*botFaceFrameTint[\s\S]*botFaceFrameWearLayer[\s\S]*data-frame-material-layer="wear"[\s\S]*botFaceFrameMetalScratchLayer[\s\S]*data-frame-material-layer="scratches"[\s\S]*className=\{styles\.botFaceFrameMetalLight\}[\s\S]*botFaceFramePaintLayer[\s\S]*style=\{metalMaterialStyle\}[\s\S]*data-frame-material-layer="paint"[\s\S]*botFaceFrameLed/
    );
    assert.match(
      pageSource,
      /<BotFaceFrame metalMaterialStyle=\{frameMetalMaterialStyle\} \/>/
    );

    const scratchRule = ruleForExactSelector(".botFaceFrameMetalScratchLayer");
    assert.match(scratchRule, /inset:\s*-9%\s*;/);
    assert.match(scratchRule, /linear-gradient\(104deg/);
    assert.match(scratchRule, /opacity:\s*var\(--bot-face-metal-scratch-opacity\)\s*;/);
    assert.match(scratchRule, /mix-blend-mode:\s*exclusion\s*;/);
    assert.doesNotMatch(scratchRule, /z-index:/);
    assert.match(scratchRule, /filter:\s*contrast\(var\(--bot-face-metal-scratch-contrast\)\) brightness\(1\.08\)\s*;/);
    assert.match(scratchRule, /-webkit-mask-image:\s*var\(--bot-face-metal-scratch-mask-image\)\s*;/);
    assert.match(scratchRule, /-webkit-mask-mode:\s*luminance\s*;/);
    assert.match(scratchRule, /mask-image:\s*var\(--bot-face-metal-scratch-mask-image\)\s*;/);
    assert.match(scratchRule, /mask-mode:\s*luminance\s*;/);
    assert.match(scratchRule, /translate3d\(var\(--bot-face-metal-scratch-x\),\s*var\(--bot-face-metal-scratch-y\),\s*0\)/);
    assert.match(scratchRule, /rotate\(var\(--bot-face-metal-scratch-rotation\)\)/);
    assert.match(scratchRule, /scale\(var\(--bot-face-metal-scratch-scale\)\)/);
    assert.doesNotMatch(scratchRule, /rgba\(255,\s*255,\s*255/);
    assert.doesNotMatch(scratchRule, /animation:/);
    assert.doesNotMatch(pageSource, /botFaceAmbientGlow/);

    const finishMaskRule = ruleForSelectorNeedles(
      ".botFaceFramePaintLayer",
      ".botFaceFrameWearLayer"
    );
    assert.match(
      finishMaskRule,
      /transform:\s*scaleX\(var\(--bot-face-frame-finish-scale-x\)\)\s*;/
    );

    const paintRule = ruleForSelectorNeedlesWithBody(
      [".botFaceFramePaintLayer"],
      "--bot-face-frame-paint-z"
    );
    assert.match(paintRule, /z-index:\s*var\(--bot-face-frame-paint-z,\s*7\)\s*;/);
    assert.match(
      paintRule,
      /--bot-face-frame-paint-substrate-image,[\s\S]*?url\("\/bot-frame\/bot-frame-base\.png\?v=1001"\)[\s\S]*?center \/ contain no-repeat,[\s\S]*?#a3a3a3\s*;/
    );
    assert.match(paintRule, /background-blend-mode:\s*soft-light\s*;/);
    assert.match(paintRule, /isolation:\s*isolate\s*;/);
    assert.match(paintRule, /mix-blend-mode:\s*normal\s*;/);
    assert.match(
      paintRule,
      /var\(--bot-face-frame-paint-strength,\s*0\)[\s\S]*?var\(--bot-face-frame-paint-theme-gain,\s*1\)/
    );
    assert.match(
      paintRule,
      /mask-image:\s*var\(--bot-face-frame-paint-mask-image,\s*none\)\s*;/
    );
    assert.match(
      css,
      /--bot-face-frame-paint-theme-gain:\s*1;/
    );

    const paintColorRule = ruleForExactSelector(".botFaceFramePaintLayer::before");
    assert.match(paintColorRule, /content:\s*""\s*;/);
    assert.match(paintColorRule, /background:\s*currentColor\s*;/);
    assert.match(paintColorRule, /opacity:\s*1\s*;/);
    assert.match(
      paintColorRule,
      /mix-blend-mode:\s*var\(--bot-face-frame-paint-color-blend-mode,\s*multiply\)\s*;/
    );
    assert.doesNotMatch(paintColorRule, /bot-frame-metal\.png/);
    assert.doesNotMatch(paintColorRule, /blur\(/);
    assert.doesNotMatch(paintColorRule, /bot-face-metal-light-rotation/);

    const paintPlasticLightRule = ruleForExactSelector(".botFaceFramePaintLayer::after");
    assert.match(paintPlasticLightRule, /content:\s*""\s*;/);
    assert.match(paintPlasticLightRule, /linear-gradient\(\s*110deg/);
    assert.match(
      paintPlasticLightRule,
      /opacity:\s*var\(--bot-face-frame-paint-plastic-light-opacity,\s*0\.28\)\s*;/
    );
    assert.match(
      paintPlasticLightRule,
      /mix-blend-mode:\s*var\(--bot-face-frame-paint-plastic-light-blend-mode,\s*screen\)\s*;/
    );
    assert.match(
      paintPlasticLightRule,
      /blur\(var\(--bot-face-frame-paint-plastic-light-blur,\s*14px\)\)/
    );
    assert.match(
      paintPlasticLightRule,
      /rotate\(var\(--bot-face-metal-light-rotation,\s*0deg\)\)[\s\S]*?scale\(1\.12\)/
    );
    assert.doesNotMatch(paintPlasticLightRule, /bot-frame-metal\.png/);
    assert.match(
      css,
      /\.themeLight \.botFaceFramePaintLayer,[\s\S]*?--bot-face-frame-paint-substrate-image:\s*url\("\/bot-frame\/bot-frame-light-base\.png\?v=1001"\)\s*;/
    );

    const ambientGlowRule = ruleForExactSelector(".zenLiveBotPresenceFace::before");
    assert.match(ambientGlowRule, /content:\s*""\s*;/);
    assert.match(ambientGlowRule, /z-index:\s*var\(--bot-face-ambient-glow-z,\s*0\)\s*;/);
    assert.match(ambientGlowRule, /width:\s*var\(--bot-face-ambient-glow-size,\s*86%\)\s*;/);
    assert.match(ambientGlowRule, /height:\s*var\(--bot-face-ambient-glow-size,\s*86%\)\s*;/);
    assert.match(ambientGlowRule, /border-radius:\s*50%\s*;/);
    assert.match(ambientGlowRule, /box-shadow:\s*[\s\S]*var\(--bot-face-ambient-glow-blur,\s*30px\)[\s\S]*var\(--bot-face-ambient-glow-spread,\s*18px\)/);
    assert.match(ambientGlowRule, /opacity:\s*var\(--bot-face-ambient-glow-opacity,\s*0\)\s*;/);
    assert.match(ambientGlowRule, /mix-blend-mode:\s*normal\s*;/);

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
      /--bot-face-screen-mask-image:\s*url\("\/bot-frame\/bot-frame-screen-mask-glass\.png\?v=1000"\)\s*;/
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
    assert.match(ledRule, /inset:\s*var\(--bot-face-frame-inset,\s*-7%\)\s*;/);
    assert.match(ledRule, /z-index:\s*var\(--bot-face-frame-led-z,\s*8\)\s*;/);
    assert.match(ledRule, /overflow:\s*hidden\s*;/);
    assert.match(ledRule, /clip-path:\s*circle\(50% at 50% 50%\)\s*;/);
    assert.match(
      ledRule,
      /mix-blend-mode:\s*var\(--bot-face-frame-led-blend-mode,\s*plus-lighter\)\s*;/
    );
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
    const talkingFaceGlowRule = rulesForExactSelector(
      '.zenLiveBotPresencePlate[data-talking="true"] .zenLiveBotPresenceFace'
    ).find((rule) => /--bot-face-ambient-glow-opacity:\s*0\.52\s*;/.test(rule));
    assert.ok(talkingFaceGlowRule, "Missing talking ambient glow lift");
    assert.doesNotMatch(css, /@keyframes zenLiveBotPresenceTalk\b/);

    assert.match(css, /@keyframes zenLiveBotTalkingLightFlicker/);
    assert.doesNotMatch(css, /zenLiveBotTalkingFacePartFlicker/);
    assert.doesNotMatch(css, /zenLiveBotTalkingFaceGlowFlicker/);
    assert.doesNotMatch(css, /zenLiveBotTalkingLightFlicker[^;{]*steps\(/);
    const talkingLightKeyframesStart = css.indexOf("@keyframes zenLiveBotTalkingLightFlicker");
    assert.notEqual(talkingLightKeyframesStart, -1);
    const talkingLightKeyframesEnd = css.indexOf(
      "@keyframes zenLiveBotPresenceSaturateIn",
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
    assert.match(talkingGlyphPartRule, /--crt-bloom-opacity:\s*0\.16\s*;/);
    assert.match(talkingGlyphPartRule, /--crt-bloom-radius:\s*2px\s*;/);
    assert.match(talkingGlyphPartRule, /--crt-bloom-wide-radius:\s*12px\s*;/);
    assert.match(talkingGlyphPartRule, /opacity:\s*1\s*;/);
    assert.match(talkingGlyphPartRule, /--crt-face-glow-filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\)\s*;/);
    assert.match(talkingGlyphPartRule, /filter:\s*var\(--crt-face-glow-filter\)\s*;/);
    assert.doesNotMatch(talkingGlyphPartRule, /animation:/);

    const talkingGlyphGlowRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-talking="true"]:not([data-private-mode="true"]) .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part] [data-crt-glyph-layer="true"]::before'
    );
    assert.match(
      talkingGlyphGlowRule,
      /animation:\s*none\s*;/
    );

    assert.doesNotMatch(css, /zenLiveBotPresenceMouthPulse/);
    assert.doesNotMatch(
      css,
      /data-mouth-open="true"[^{}]*[\s\S]*?animation:/
    );
    assert.match(
      pageSource,
      /normalizeCrtSpeechText\(\s*getBotMentionDisplayText\(displayContent\)\s*,?\s*\)/
    );
    assert.match(pageSource, /zenLiveBotMouthShapeFromRevealProgress\(/);
    assert.match(
      pageSource,
      /plateFace \?\? zenLiveActionPlateFace\(moodHint, displayedMouthShape\)/
    );
  });

  it("routes Default custom mouths through standard visemes and keeps alternate motion explicit", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /isTalking && normalizedFaceMouthAnimation === "none"\s*\?\s*null\s*:\s*normalizedFaceMouthCharacter/
    );
    assert.doesNotMatch(coffeeSeatPlateEmojiSource, /data-face-eye-animation=/);
    assert.match(coffeeSeatPlateEmojiSource, /data-face-mouth-animation=/);
    assert.match(coffeeSeatPlateEmojiSource, /data-talking=\{isTalking \? "true" : undefined\}/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-mouth-open=\{mouthOpen \? "true" : undefined\}/
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-mouth-shape=\{isTalking \? streamedMouthShape : undefined\}/
    );
    assert.match(pageSource, /mouthShape=\{seatMouthShape\}/);
    assert.match(pageSource, /mouthShape=\{displayedMouthShape\}/);
    assert.match(pageSource, /zenLiveBotMouthShapeForTalkingState\(\{/);
    assert.doesNotMatch(css, /data-face-eye-animation=/);
    assert.doesNotMatch(css, /botFaceCustomGlyphPulsate/);
    assert.doesNotMatch(css, /botFaceCustomGlyphSpin/);
    assert.match(
      css,
      /\[data-talking="true"\][\s\S]*transition:\s*transform 70ms ease-out/
    );
    for (const mouthShape of [
      "closed",
      "speech-closed",
      "dot",
      "narrow",
      "open-small",
      "open-wide",
      "open-round",
      "at",
    ]) {
      assert.match(
        css,
        new RegExp(
          `data-coffee-plate-mouth-shape="${mouthShape}"`
        )
      );
    }
    const closedShapeRule = ruleForSelectorNeedles(
      'data-coffee-plate-mouth-shape="closed"',
    );
    const openWideShapeRule = ruleForSelectorNeedles(
      'data-coffee-plate-mouth-shape="open-wide"',
    );
    assert.match(closedShapeRule, /--bot-face-mouth-pulse-scale-x:\s*0\.97\s*;/);
    assert.match(openWideShapeRule, /--bot-face-mouth-pulse-scale-x:\s*1\.1\s*;/);
    assert.match(openWideShapeRule, /--bot-face-mouth-pulse-scale-y:\s*1\.12\s*;/);
    assert.doesNotMatch(css, /data-face-mouth-animation="none"/);
    for (const animation of ["pulsate", "spin", "flicker", "wobble"]) {
      assert.match(css, new RegExp(`data-face-mouth-animation="${animation}"`));
    }
    const pulsateRule = ruleForSelectorNeedles('data-face-mouth-animation="pulsate"');
    const flickerRule = ruleForSelectorNeedles('data-face-mouth-animation="flicker"');
    const wobbleRule = ruleForSelectorNeedles('data-face-mouth-animation="wobble"');
    const spinGeometryRule = ruleForSelectorNeedlesWithBody(
      ['data-face-mouth-animation="spin"'],
      "inline-size: max-content",
    );
    const spinTalkingRule = ruleForSelectorNeedlesWithBody(
      ['data-talking="true"', 'data-face-mouth-animation="spin"'],
      "botFaceCustomMouthSpin",
    );
    assert.match(pulsateRule, /--bot-face-mouth-pulse-scale-x/);
    assert.match(flickerRule, /--bot-face-mouth-speech-opacity/);
    assert.doesNotMatch(flickerRule, /scale[XY]\(/);
    assert.match(wobbleRule, /--bot-face-mouth-speech-wobble/);
    assert.doesNotMatch(wobbleRule, /scale[XY]\(/);
    assert.match(spinTalkingRule, /botFaceCustomMouthSpin/);
    assert.match(spinTalkingRule, /--bot-face-mouth-spin-turn-duration,\s*480ms/);
    assert.doesNotMatch(spinTalkingRule, /scale[XY]\(/);
    assert.match(spinGeometryRule, /display:\s*inline-block\s*;/);
    assert.match(spinGeometryRule, /inline-size:\s*max-content\s*;/);
    assert.match(spinGeometryRule, /min-inline-size:\s*0\s*;/);
    assert.match(
      spinGeometryRule,
      /block-size:\s*calc\(\s*1em\s*\+\s*var\(--crt-glyph-paint-bleed\)\s*\+\s*var\(--crt-glyph-paint-bleed\)\s*\)\s*;/,
    );
    assert.match(spinGeometryRule, /padding-inline:\s*0\s*;/);
    assert.match(spinGeometryRule, /margin-inline:\s*0\s*;/);
    assert.match(
      spinGeometryRule,
      /transform-origin:\s*var\(--bot-face-mouth-spin-origin-x,\s*50%\)\s*var\(--bot-face-mouth-spin-origin-y,\s*50%\)\s*;/,
    );
    assert.match(coffeeSeatPlateEmojiSource, /function updateCustomMouthSpinOrigin/);
    assert.match(coffeeSeatPlateEmojiSource, /context\.measureText\(glyph\)/);
    assert.match(coffeeSeatPlateEmojiSource, /metrics\.actualBoundingBoxLeft/);
    assert.match(coffeeSeatPlateEmojiSource, /metrics\.actualBoundingBoxAscent/);
    assert.match(coffeeSeatPlateEmojiSource, /document\.fonts\?\.ready\.then\(measure\)/);
    assert.match(coffeeSeatPlateEmojiSource, /customMouthGlyphRef/);
    assert.match(css, /--bot-face-mouth-speech-scale-x/);
    assert.match(css, /--bot-face-mouth-speech-wobble/);
    assert.match(css, /@keyframes botFaceCustomMouthSpin/);
    assert.match(css, /1turn/);
    assert.match(
      coffeeSeatPlateEmojiSource,
      /ZEN_LIVE_MOUTH_PHASE_MS \* CUSTOM_MOUTH_SPIN_PHASES_PER_TURN/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /\["--bot-face-mouth-spin-turn-duration" as string\]: `\$\{CUSTOM_MOUTH_SPIN_TURN_MS\}ms`/,
    );
    assert.match(
      css,
      /\[data-talking="true"\]\s*\{\s*--bot-face-mouth-speech-scale-x:\s*1\s*;/,
    );
    assert.doesNotMatch(
      css,
      /\[data-talking="true"\][^{]*\[data-coffee-plate-emoji-part="mouth"\][^{]*\{[^}]*--bot-face-mouth-speech-scale-x:/,
    );
    assert.doesNotMatch(
      css,
      /data-face-mouth-animation="(?:pulsate|flicker|wobble)"[^{}]*\{[^}]*animation\s*:/,
    );

    const blinkRule = ruleForSelectorNeedlesWithBody(
      [
        ":is(.coffeeSeatPlateEmoji",
        'data-coffee-plate-emoji-blink-glyph="true"',
        'data-crt-glyph-layer="true"',
      ],
      "animation: none"
    );
    assert.match(blinkRule, /--crt-glyph-core-red-rgb:\s*255 255 255\s*;/);
    assert.match(blinkRule, /--crt-glyph-core-green-rgb:\s*255 255 255\s*;/);
    assert.match(blinkRule, /--crt-glyph-core-blue-rgb:\s*255 255 255\s*;/);
    assert.match(blinkRule, /--crt-glyph-phosphor-midtone-strength:\s*0\.24\s*;/);
    assert.match(blinkRule, /--crt-glyph-phosphor-bright-strength:\s*0\.09\s*;/);
    assert.match(blinkRule, /--bot-face-custom-glyph-base-rotation:\s*0deg\s*;/);
    assert.match(blinkRule, /animation:\s*none\s*;/);
    assert.match(blinkRule, /transform:\s*rotate\(0deg\)\s*;/);

    const closedEyeRule = ruleForSelectorNeedlesWithBody(
      [
        '.zenLiveBotPresenceFaceGlyph[data-coffee-plate-emoji-eyes-open="false"]',
        '[data-coffee-plate-emoji-part="eyes"]',
      ],
      "opacity: 1"
    );
    assert.match(closedEyeRule, /opacity:\s*1\s*;/);
  });

  it("removes the Prism ambient aura from Zen mode", () => {
    const prismRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"]'
    );
    assert.match(prismRule, /--coffee-bot-color:\s*#f7fbff\s*;/);
    assert.match(prismRule, /--zen-live-bot-face-crt-border-color:\s*#ffffff\s*;/);
    assert.match(prismRule, /--bot-face-frame-tint-background:\s*[\s\S]*conic-gradient/);
    assert.match(prismRule, /--bot-face-frame-tint-opacity:\s*0\.64\s*;/);
    assert.match(prismRule, /--bot-face-metal-light-opacity:\s*0\.3\s*;/);
    assert.doesNotMatch(prismRule, /--bot-face-frame-glow-filter/);
    assert.doesNotMatch(prismRule, /--zen-prism-ambient/);
    assert.match(prismRule, /--zen-presence-face-bg:\s*[\s\S]*rgba\(255,\s*255,\s*255,\s*0\.032\)/);
    assert.match(prismRule, /--zen-presence-face-border:\s*color-mix\(in srgb,\s*#ff3f6f 12%,\s*#ffb62e 8%\)\s*;/);
    assert.match(prismRule, /--zen-presence-face-ring:\s*transparent\s*;/);
    assert.doesNotMatch(prismRule, /#ffffff 3%/);

    const privatePrismRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-private-mode="true"]'
    );
    assert.match(
      privatePrismRule,
      /--zen-live-bot-face-crt-border-color:\s*#e8eee8\s*;/
    );
    assert.match(privatePrismRule, /--bot-face-frame-tint-background:\s*currentColor\s*;/);
    assert.match(privatePrismRule, /--bot-face-frame-tint-opacity:\s*0\.52\s*;/);
    assert.doesNotMatch(privatePrismRule, /--bot-face-frame-glow-filter/);
    assert.doesNotMatch(privatePrismRule, /--zen-prism-ambient/);

    const prismFaceRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"] .zenLiveBotPresenceFace'
    );
    assert.match(prismFaceRule, /--bot-face-ambient-glow-opacity:\s*0\.74\s*;/);

    const privatePrismFaceRule = ruleForExactSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-private-mode="true"] .zenLiveBotPresenceFace'
    );
    assert.match(privatePrismFaceRule, /--bot-face-ambient-glow-opacity:\s*0\.36\s*;/);

    assert.doesNotMatch(css, /--zen-prism-ambient/);
    assert.doesNotMatch(css, /zenLivePrismRainbowAura/);
    assert.doesNotMatch(css, /zenLivePrismRainbowAura/);

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
    assert.doesNotMatch(css, /zenLivePrismRainbowAura/);

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

    const prismFacePartRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"] .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part]'
    );
    assert.match(prismFacePartRule, /--crt-face-glow-blend-mode:\s*screen\s*;/);
    assert.match(
      prismFacePartRule,
      /--crt-prism-face-glow-strength-scale:\s*var\(--bot-face-weight-glow-strength-scale,\s*1\)\s*;/
    );
    assert.match(
      prismFacePartRule,
      /--crt-prism-face-rim-strength-scale:\s*calc\(\s*var\(--crt-prism-face-glow-strength-scale,\s*1\) \* 0\.52\s*\)\s*;/
    );
    assert.match(
      prismFacePartRule,
      /--crt-prism-face-halo-strength-scale:\s*calc\(\s*var\(--crt-prism-face-glow-strength-scale,\s*1\) \* 0\.34\s*\)\s*;/
    );
    assert.match(prismFacePartRule, /--crt-face-edge-color:\s*#ffffff\s*;/);
    assert.doesNotMatch(prismFacePartRule, /--bot-face-glow-font-weight/);
    assert.match(
      prismFacePartRule,
      /--bot-face-glow-stroke:\s*calc\(var\(--bot-face-weight-glow-stroke,\s*0\.006em\) \* 0\.72\)\s*;/
    );
    assert.match(
      prismFacePartRule,
      /--bot-face-glow-strength-scale:\s*var\(--crt-prism-face-glow-strength-scale\)\s*;/
    );
    assert.match(prismFacePartRule, /--zen-live-bot-idle-face-glow-filter:/);
    assert.match(prismFacePartRule, /--zen-live-bot-idle-face-glow-filter-high:/);
    assert.match(prismFacePartRule, /#ff3f6f calc\(30% \* var\(--crt-prism-face-rim-strength-scale,\s*1\)\)/);
    assert.match(prismFacePartRule, /#ffb62e calc\(22% \* var\(--crt-prism-face-rim-strength-scale,\s*1\)\)/);
    assert.match(prismFacePartRule, /#31d7ff calc\(28% \* var\(--crt-prism-face-rim-strength-scale,\s*1\)\)/);
    assert.match(prismFacePartRule, /#8b7cff calc\(24% \* var\(--crt-prism-face-rim-strength-scale,\s*1\)\)/);
    assert.match(prismFacePartRule, /#31d7ff calc\(12% \* var\(--crt-prism-face-halo-strength-scale,\s*1\)\)/);
    assert.match(prismFacePartRule, /#8b7cff calc\(9% \* var\(--crt-prism-face-halo-strength-scale,\s*1\)\)/);
    assert.match(prismFacePartRule, /calc\(0\.58em \* var\(--crt-face-glow-radius-scale,\s*1\)\)/);
    assert.match(prismFacePartRule, /--crt-face-glow-filter:\s*var\(--zen-live-bot-idle-face-glow-filter-high\)\s*;/);
    assert.match(prismFacePartRule, /--crt-bloom-narrow-radius:\s*1\.35px\s*;/);
    assert.match(prismFacePartRule, /--crt-bloom-wide-radius:\s*8px\s*;/);
    assert.match(prismFacePartRule, /--crt-chromatic-offset:\s*0\.78px\s*;/);
    assert.match(prismFacePartRule, /--crt-chromatic-opacity:\s*0\.105\s*;/);

    const prismIdleFaceGlowRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"]:not([data-talking="true"]):not([data-transitioning="true"]) .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part] [data-crt-glyph-layer="true"]::before'
    );
    assert.match(prismIdleFaceGlowRule, /animation:\s*none\s*;/);
    assert.doesNotMatch(prismIdleFaceGlowRule, /zenLiveBotIdleLightBreath/);

    const talkingFacePartRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-talking="true"] .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part]'
    );
    assert.match(talkingFacePartRule, /--crt-bloom-opacity:\s*0\.16\s*;/);
    assert.match(talkingFacePartRule, /--crt-bloom-radius:\s*2\.05px\s*;/);
    assert.match(talkingFacePartRule, /--crt-chromatic-offset:\s*0\.9px\s*;/);
    assert.match(talkingFacePartRule, /--crt-chromatic-opacity:\s*0\.13\s*;/);
    assert.match(talkingFacePartRule, /--crt-face-glow-filter:\s*var\(--zen-live-bot-talking-face-glow-filter-high\)\s*;/);
    assert.match(
      talkingFacePartRule,
      /rgba\(255,\s*63,\s*111,\s*calc\(0\.34 \* var\(--crt-prism-face-rim-strength-scale,\s*1\)\)\)/
    );
    assert.match(talkingFacePartRule, /filter:\s*var\(--crt-face-glow-filter\)\s*;/);
    assert.doesNotMatch(talkingFacePartRule, /animation:/);
    const talkingFaceGlowRule = ruleForNormalizedSelector(
      '.zenLiveBotPresencePlate[data-prism-persona="true"][data-talking="true"] .zenLiveBotPresenceFaceGlyph [data-coffee-plate-emoji-part] [data-crt-glyph-layer="true"]::before'
    );
    assert.match(
      talkingFaceGlowRule,
      /animation:\s*zenLivePrismFaceGlowHueRotate 1\.7s linear infinite\s*;/
    );

    assert.match(
      css,
      /@keyframes zenLivePrismFaceGlowHueRotate\s*\{[\s\S]*calc\(0\.36 \* var\(--crt-prism-face-rim-strength-scale,\s*1\)\)[\s\S]*hue-rotate\(0deg\)[\s\S]*hue-rotate\(360deg\)/
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

  it("scrambles only the mirrored face while holder color, glyph, and body stay anchored", () => {
    const mirrorFaceRule = ruleForSelectorNeedles(
      'data-identity-mirror-transition="true"',
      ".zenLiveBotPresenceFaceEmissionMask",
    );
    assert.match(
      mirrorFaceRule,
      /animation:\s*identityMirrorFaceScramble 760ms steps\(8, end\) both\s*;/,
    );
    assert.match(css, /@keyframes identityMirrorFaceScramble/);
    assert.match(
      pageSource,
      /Date\.parse\(identityMirrorState\.occurredAt\) \+ BOT_IDENTITY_MIRROR_TRANSITION_MS \/ 2/,
    );
    assert.match(
      pageSource,
      /const seatFaceStyle = identityMirrorTargetFaceVisible \? identityMirrorState!\.targetFace : resolveBotFaceStyleForBot\(bot\)/,
    );
    assert.match(pageSource, /const seatGlyphName:[^;]+bot\.glyph[^;]+;/);
    assert.match(
      pageSource,
      /avatarDetails=\{resolveBotAvatarDetails\(bot\)\} avatarDetailsColor=\{normalizeAccentForTheme\( bot\.color/,
    );
    assert.match(
      pageSource,
      /const faceStyle = botSummary\.identityMirrorState && botSummary\.identityMirrorTargetFaceActive \? botSummary\.identityMirrorState\.targetFace : resolveBotFaceStyleForBot\(bot\)/,
    );
    assert.match(pageSource, /const glyph:[^;]+bot\.glyph[^;]+;/);
    assert.match(pageSource, /const color = normalizeAccentForTheme\( bot\.color/);
    assert.doesNotMatch(
      pageSource,
      /identityMirrorState\.target(?:Color|Glyph|Avatar|Body|Accessories)/,
    );
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
    assert.match(
      glyphRule,
      /left:\s*calc\(50%\s*\+\s*var\(--zen-live-bot-glyph-x-anchor,\s*0px\)\s*\+\s*1px\)/
    );
    assert.match(
      glyphRule,
      /top:\s*calc\(50%\s*\+\s*var\(--zen-live-bot-glyph-y-anchor,\s*70px\)\s*\+\s*1px\)/
    );
    const bodyRule = ruleForExactSelector(".zenLiveBotPresenceBody");
    assert.match(bodyRule, /--zen-live-bot-body-glyph-min-size:\s*18px\s*;/);
    assert.match(bodyRule, /--zen-live-bot-body-glyph-ratio:\s*0\.145\s*;/);
    assert.match(bodyRule, /--zen-live-bot-body-glyph-max-size:\s*48px\s*;/);
    assert.match(
      glyphRule,
      /--zen-live-bot-body-glyph-render-size:\s*calc\(\s*var\(\s*--zen-live-bot-body-glyph-size,\s*clamp\(\s*var\(--zen-live-bot-body-glyph-min-size\),\s*calc\(var\(--zen-live-bot-body-frame-size\)\s*\*\s*var\(--zen-live-bot-body-glyph-ratio\)\),\s*var\(--zen-live-bot-body-glyph-max-size\)\s*\)\s*\)\s*-\s*2px\s*\)/
    );
    assert.match(glyphRule, /width:\s*var\(--zen-live-bot-body-glyph-render-size\)\s*;/);
    assert.match(
      glyphRule,
      /height:\s*var\(--zen-live-bot-body-glyph-render-size\)\s*;/
    );
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
      /--zen-live-bot-glyph-crt-border-color:\s*var\(--zen-live-bot-glyph-glow-color\)\s*;/
    );
    assert.match(
      glyphRule,
      /color:\s*var\(\s*--zen-live-bot-glyph-ink,\s*var\(--zen-live-bot-face-phosphor-ink,\s*var\(--zen-live-bot-face-ink,\s*#ffffff\)\)\s*\)\s*;/
    );
    assert.match(
      glyphRule,
      /filter:\s*[\s\S]*drop-shadow\(0 0 0\.72px var\(--zen-live-bot-glyph-crt-border-color\)\)[\s\S]*drop-shadow\(0 0 1\.5px var\(--zen-live-bot-glyph-crt-border-color\)\)[\s\S]*drop-shadow\(\s*0 0 21px\s*color-mix\(in srgb,\s*var\(--zen-live-bot-glyph-crt-border-color\)\s*22%,\s*transparent\)\s*\)/
    );
    assert.doesNotMatch(glyphRule, /zen-live-bot-glyph-phosphor-glow-color/);
    assert.doesNotMatch(glyphRule, /#ffffff 72%,\s*currentColor 28%/);
    assert.doesNotMatch(glyphRule, /box-shadow:/);
    assert.doesNotMatch(glyphRule, /radial-gradient/);
  });

  it("lets the pull-quote action text drift away from the fixed body", () => {
    assert.match(pageSource, /type ZenLiveBotActionCopyPlacement = "top" \| "bottom";/);
    assert.match(pageSource, /type ZenLiveBotActionCopyAnchor = \{/);
    assert.match(pageSource, /resolveZenLiveBotActionCopyPlacement\(/);
    assert.match(pageSource, /resolveZenLiveBotActionCopyAnchor\(/);
    assert.match(pageSource, /function resolveZenLiveBotActionCopyCenterX\(/);
    assert.match(pageSource, /\[data-zen-live-bot-action-copy-measure='true'\]/);
    assert.match(pageSource, /getPropertyValue\("--zen-live-bot-body-x"\)/);
    assert.match(pageSource, /getPropertyValue\("--zen-live-bot-copy-center-anchor"\)/);
    assert.match(pageSource, /setActionCopyAnchor\(\{ key, \.\.\.anchor \}\);/);
    assert.match(
      pageSource,
      /data-copy-placement=\{\s*actionCopyAnchorForRender\?\.placement\s*\?\?\s*avatarCopyPlacement\s*\}/
    );
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
    assert.notEqual(verticalFitDecision, -1);
    assert.match(placementSource, /const verticalNeed = copyHeight \+ bodyGap;/);
    assert.match(placementSource, /return bodyCenterY > safeCenterY \? "top" : "bottom";/);
    assert.match(placementSource, /return spaceAbove > spaceBelow \? "top" : "bottom";/);
    assert.doesNotMatch(placementSource, /return "right"/);
    assert.doesNotMatch(placementSource, /return "left"/);

    const centerXStart = pageSource.indexOf("function resolveZenLiveBotActionCopyCenterX");
    assert.notEqual(centerXStart, -1);
    const centerXEnd = pageSource.indexOf("function resolveZenLiveBotActionCopyAnchor", centerXStart);
    assert.notEqual(centerXEnd, -1);
    const centerXSource = pageSource.slice(centerXStart, centerXEnd);
    assert.match(centerXSource, /collectZenLiveBotProseHillRect\(/);
    assert.match(centerXSource, /const proseGap = Math\.max\(16,\s*ZEN_LIVE_BOT_PROSE_HILL_CLEARANCE_PX \* 0\.65\);/);
    assert.match(centerXSource, /const copyLeft = viewportClampedCenter - copyWidth \/ 2;/);
    assert.match(centerXSource, /const copyRight = viewportClampedCenter \+ copyWidth \/ 2;/);
    assert.match(centerXSource, /const preferRight = bodyCenterX >= proseCenterX;/);
    assert.match(centerXSource, /rightMinCenter/);
    assert.match(centerXSource, /leftMaxCenter/);
    assert.match(centerXSource, /return viewportClampedCenter;/);

    const anchorStart = pageSource.indexOf("function resolveZenLiveBotActionCopyAnchor");
    assert.notEqual(anchorStart, -1);
    const anchorEnd = pageSource.indexOf("function zenLiveBotAvatarPositionLimits", anchorStart);
    assert.notEqual(anchorEnd, -1);
    const anchorSource = pageSource.slice(anchorStart, anchorEnd);
    assert.match(anchorSource, /const anchoredCenterX = resolveZenLiveBotActionCopyCenterX\(/);
    assert.match(anchorSource, /x:\s*anchoredCenterX/);
    assert.doesNotMatch(anchorSource, /placement === "right"/);
    assert.doesNotMatch(anchorSource, /placement === "left"/);

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

    const textRule = ruleForExactSelector(".zenLiveBotPresenceText");
    assert.match(textRule, /font-size:\s*clamp\(1rem,\s*1\.05vw,\s*1\.2rem\)/);
    assert.match(textRule, /font-style:\s*italic\s*;/);
    assert.match(textRule, /line-clamp:\s*2\s*;/);
  });

  it("keeps Light Mode action text on the contrast-safe theme ink across states", () => {
    assert.match(
      pageSource,
      /const ink = ensureContrast\(accent, THEME_SURFACE_BG\[resolvedTheme\], 4\.5\);/
    );
    assert.match(pageSource, /\["--bot-ink" as string\]: ink/);
    assert.match(
      pageSource,
      /const botAccent = botAccentStyle\(\s*bot\?\.color \?\? PRISM_DEFAULT_ACCENT,\s*resolvedTheme,\s*\);/
    );
    assert.match(
      pageSource,
      /const actionCopyStyle = actionCopyAnchorForRender \? \(\{ \.\.\.botAccent,/
    );
    assert.match(
      pageSource,
      /data-zen-live-bot-action-copy="true"[\s\S]*?data-theme=\{resolvedTheme\}/
    );

    const copyRule = ruleForExactSelector(".zenLiveBotPresenceCopy");
    assert.match(
      copyRule,
      /--zen-action-text-rest-ink:\s*color-mix\(\s*in srgb,\s*var\(--coffee-bot-color\) 68%,\s*#ffffff 32%\s*\)\s*;/
    );
    assert.match(
      copyRule,
      /--zen-action-text-active-ink:\s*var\(--zen-action-text-rest-ink\)\s*;/
    );
    assert.match(
      copyRule,
      /--zen-action-text-muted-ink:\s*var\(--zen-action-text-rest-ink\)\s*;/
    );
    assert.match(
      copyRule,
      /--zen-action-text-state-ink:\s*var\(--zen-action-text-rest-ink\)\s*;/
    );
    assert.match(copyRule, /--zen-action-text-intro-opacity:\s*0\.95\s*;/);
    assert.match(copyRule, /--zen-action-text-rest-opacity:\s*0\.9\s*;/);
    assert.match(copyRule, /--zen-action-text-verbose-opacity:\s*0\.92\s*;/);
    assert.match(copyRule, /--zen-action-text-loading-opacity:\s*0\.86\s*;/);
    assert.match(
      copyRule,
      /--zen-action-text-reduced-motion-opacity:\s*0\.86\s*;/
    );

    const lightRule = ruleForExactSelector(
      '.zenLiveBotPresenceCopy[data-theme="light"]'
    );
    assert.match(
      lightRule,
      /--zen-action-text-rest-ink:\s*var\(\s*--bot-ink,\s*var\(--zen-presence-pill-ink\)\s*\)\s*;/
    );
    assert.match(lightRule, /--zen-action-text-intro-opacity:\s*1\s*;/);
    assert.match(lightRule, /--zen-action-text-rest-opacity:\s*1\s*;/);
    assert.match(lightRule, /--zen-action-text-verbose-opacity:\s*1\s*;/);
    assert.match(lightRule, /--zen-action-text-loading-opacity:\s*1\s*;/);
    assert.match(
      lightRule,
      /--zen-action-text-reduced-motion-opacity:\s*1\s*;/
    );

    const activeStateRule = ruleForSelectorNeedles(
      ":hover",
      ":focus-visible",
      '[data-loading="true"]',
      '[data-talking="true"]',
      '[data-thinking="true"]'
    );
    assert.match(
      activeStateRule,
      /--zen-action-text-state-ink:\s*var\(--zen-action-text-active-ink\)\s*;/
    );
    const mutedStateRule = ruleForSelectorNeedles(
      '[aria-disabled="true"]',
      '[data-muted="true"]'
    );
    assert.match(
      mutedStateRule,
      /--zen-action-text-state-ink:\s*var\(--zen-action-text-muted-ink\)\s*;/
    );

    const textRule = ruleForExactSelector(".zenLiveBotPresenceText");
    assert.match(textRule, /color:\s*var\(--zen-action-text-state-ink\)\s*;/);
    assert.match(
      textRule,
      /opacity:\s*var\(--zen-action-text-rest-opacity\)\s*;/
    );
    assert.match(textRule, /font-style:\s*italic\s*;/);
    assert.match(textRule, /font-weight:\s*520\s*;/);
    assert.doesNotMatch(
      textRule,
      /color:\s*color-mix\([^;]*#ffffff/
    );
    const verboseTextRule = ruleForExactSelector(
      '.zenLiveBotPresenceCopy[data-action-verbose="true"] .zenLiveBotPresenceText'
    );
    assert.match(
      verboseTextRule,
      /opacity:\s*var\(--zen-action-text-verbose-opacity\)\s*;/
    );

    const loadingRule = ruleForExactSelector(
      '.zenLiveBotPresenceCopy[data-loading="true"][data-copy-anchored="true"]'
    );
    assert.match(
      loadingRule,
      /opacity:\s*var\(--zen-action-text-loading-opacity\)\s*;/
    );
    assert.match(loadingRule, /animation:\s*none\s*;/);
    assert.match(
      css,
      /@keyframes zenLiveBotActionQuoteDrift\s*\{[\s\S]*?9%\s*\{\s*opacity:\s*var\(--zen-action-text-intro-opacity\)\s*;[\s\S]*?34%\s*\{\s*opacity:\s*var\(--zen-action-text-rest-opacity\)\s*;/
    );
    const reducedMotionRule = ruleForSelectorNeedlesWithBody(
      ['.zenLiveBotPresenceCopy[data-copy-anchored="true"]'],
      "--zen-action-text-reduced-motion-opacity"
    );
    assert.match(
      reducedMotionRule,
      /opacity:\s*var\(--zen-action-text-reduced-motion-opacity\)\s*;/
    );
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
      /speed < ZEN_LIVE_BOT_AVATAR_FLING_MIN_SPEED[\s\S]*const hillMotion = resolveZenLiveBotAvatarProseHillMotion\([\s\S]*const restingMotion = chromeMotion\.affected \? chromeMotion : hillMotion;[\s\S]*initialVelocity = restingMotion\.velocity;/
    );
    assert.match(
      pageSource,
      /const hillMotion = resolveZenLiveBotAvatarProseHillMotion\(\s*current\s*,\s*avatarVelocityRef\.current\s*,[\s\S]*dt\s*,?\s*\);/
    );
    assert.match(
      pageSource,
      /let nextVx = chromeMotion\.velocity\.x;\s+let nextVy = chromeMotion\.velocity\.y;\s+let nextX = current\.x \+ nextVx \* dt;/
    );
    assert.match(
      pageSource,
      /const hillRolling =\s+hillMotion\.affected \|\| chromeMotion\.affected \|\| avatarProseHillRollingRef\.current;/
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
      /data-zen-live-prose-target=\{\s*chatLikeSurface\s*\?\s*"true"\s*:\s*undefined\s*\}/
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
      /const faceSpinnerVisible =\s+!botFaceThinkingSpinnerDisabled\(faceStyle\.thinkingFrames\) &&\s+\(showThinkingSpinner \|\| transitioning\);/
    );
    assert.match(
      mannequinSource,
      /const thinkingSpinnerActive =\s+showThinkingSpinner &&\s+!botFaceThinkingSpinnerDisabled\(faceStyle\.thinkingFrames\);/
    );
    assert.match(mannequinSource, /className=\{styles\.zenLiveBotPresenceThinkingGlyphAnchor\}/);
    assert.match(mannequinSource, /showThinkingSpinner\s+baseText=\{displayPlateFace\.text\}/);
    assert.match(mannequinSource, /className=\{styles\.zenLiveBotPresenceFaceEmissionMask\}/);
    assert.match(mannequinSource, /\{thinkingSpinnerActive \? \(/);
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
    assert.match(spinnerFrameRule, /--crt-glyph-core-paint-bleed:\s*0\.16em\s*;/);
    assert.match(spinnerFrameRule, /var\(--coffee-face-single-glyph-paint-pad-inline,\s*0em\)/);
    assert.match(spinnerFrameRule, /var\(--coffee-face-single-glyph-paint-pad-block,\s*0em\)/);
    assert.match(spinnerFrameRule, /margin-inline:\s*calc\(var\(--coffee-face-single-glyph-paint-pad-inline,\s*0em\) \* -1\)\s*;/);
    assert.match(spinnerFrameRule, /margin-block:\s*calc\(var\(--coffee-face-single-glyph-paint-pad-block,\s*0em\) \* -1\)\s*;/);
    assert.match(spinnerFrameRule, /overflow:\s*visible\s*;/);
    assert.match(
      spinnerFrameRule,
      /color-mix\(in srgb,\s*var\(--crt-face-edge-color,\s*currentColor\) 76%,\s*transparent\)/,
    );
    assert.doesNotMatch(
      spinnerFrameRule,
      /color-mix\(in srgb,\s*currentColor 76%,\s*transparent\)/,
    );

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
      /color:\s*var\(--zen-live-bot-face-phosphor-ink,\s*#ffffff\)\s*;/
    );
    assert.match(zenSpinnerGlyphRule, /var\(--coffee-bot-color\)/);
    assert.match(
      zenSpinnerGlyphRule,
      /--crt-face-edge-color:\s*var\(--zen-live-bot-spinner-glow-color\)\s*;/
    );
    assert.match(
      zenSpinnerGlyphRule,
      /--crt-face-glow-filter:[\s\S]*drop-shadow\(0 0 0\.72px var\(--zen-live-bot-spinner-glow-color\)\)[\s\S]*drop-shadow\(0 0 1\.5px var\(--zen-live-bot-spinner-glow-color\)\)[\s\S]*0 0 3px[\s\S]*0 0 6px[\s\S]*0 0 9px/
    );
    assert.doesNotMatch(
      css,
      /\.zenLiveBotPresenceThinkingGlyph\s+\[data-coffee-plate-thinking-frame\]\s*\{[^}]*filter:/
    );
    assert.match(
      zenSpinnerGlyphRule,
      /font-size:\s*var\(\s*--zen-live-bot-avatar-thinking-glyph-size,\s*clamp\(2\.35rem,\s*calc\(var\(--zen-live-bot-body-frame-size,\s*190px\) \* 0\.275\),\s*5\.25rem\)\s*\)/
    );
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
      pageSource,
      /const zenLiveAskQuestionMarkerVisible = pendingAskQuestionInteractiveKey !== null;/
    );
    assert.doesNotMatch(pageSource, /assistantMessageEndsWithVisibleQuestion/);
    assert.doesNotMatch(pageSource, /zenLiveNaturalQuestionMarkerVisible/);
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
      /font-size:\s*var\(\s*--zen-live-bot-avatar-question-glyph-size,\s*clamp\(2\.35rem,\s*calc\(var\(--zen-live-bot-body-frame-size,\s*190px\) \* 0\.275\),\s*5\.25rem\)\s*\)\s*;/
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
    assert.match(moodFaceSource, /faceThinkingFrames=\{props\.faceStyle\?\.thinkingFrames\}/);
    assert.match(moodFaceSource, /faceMouthRotationDeg=\{props\.faceStyle\?\.mouthRotationDeg\}/);
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

  it("renders named bot picker cards with the original compact icon styling", () => {
    assert.doesNotMatch(pageSource, /chatBotTileCrtSurface/);
    assert.doesNotMatch(pageSource, /chatBotTileCrtGlass/);
    assert.doesNotMatch(css, /--bot-card-crt-core/);

    const namedTileRule = ruleForSelectorNeedlesWithBody(
      [".chatBotTileWithName"],
      "grid-template-rows"
    );
    assert.match(namedTileRule, /grid-template-rows:\s*minmax\(0,\s*1fr\) auto\s*;/);
    assert.match(namedTileRule, /row-gap:\s*clamp\(4px,/);
    assert.match(namedTileRule, /radial-gradient\(\s*circle at 50% 36%/);
    assert.match(namedTileRule, /linear-gradient\(\s*180deg/);

    const darkGlyphRule = ruleForSelectorNeedlesWithBody(
      [".themeDark .chatBotTileWithName .chatBotTileBotGlyph"],
      "color-mix"
    );
    assert.match(darkGlyphRule, /color:\s*color-mix\(in srgb,\s*var\(--bot-color/);
    assert.match(darkGlyphRule, /opacity:\s*0\.92\s*;/);

    const lightGlyphRule = ruleForSelectorNeedlesWithBody(
      [".themeLight .chatBotTileWithName .chatBotTileBotGlyph"],
      "var(--tile-rest-contrast-color)"
    );
    assert.match(lightGlyphRule, /color:\s*var\(--tile-rest-contrast-color\)\s*;/);
    assert.match(lightGlyphRule, /opacity:\s*0\.94\s*;/);

    const glyphRule = ruleForSelectorNeedlesWithBody(
      [".chatBotTileBotGlyph"],
      "place-items: center"
    );
    assert.match(glyphRule, /display:\s*grid\s*;/);
    assert.match(glyphRule, /place-items:\s*center\s*;/);
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
      /if \(\s*!node\s*\|\|\s*!zenLiveBotAvatarPointerCanStartGrab\(node, clientX, clientY, options\)\s*\) \{\s*return false;\s*\}/
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
      /const panelInsets = collectDevPanelSafeAreaInsets\(\s*viewportWidth\s*,\s*viewportHeight\s*,?\s*\);/
    );
    assert.match(
      pageSource,
      /const insets = \{\s+\.\.\.panelInsets,\s+left: 0,\s+right: 0,\s+\};/
    );
    assert.match(pageSource, /safeAreaInsets\.top/);
    assert.match(pageSource, /safeAreaInsets\.bottom/);
  });

  it("slides the resting live bot away from marked chrome", () => {
    assert.match(pageSource, /const ZEN_LIVE_BOT_CHROME_AVOIDANCE_SELECTOR = \[/);
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_CHROME_AVOIDANCE_ACCELERATION_PX_PER_SEC = 980;/
    );
    assert.match(pageSource, /const ZEN_LIVE_BOT_CHROME_AVOIDANCE_MAX_SPEED = 620;/);
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_CHROME_AVOIDANCE_MIN_LARGE_AVATAR_SPEED = 280;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_CHROME_AVOIDANCE_INERTIA_DAMPING_PER_FRAME = 0\.9;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_CHROME_AVOIDANCE_PERPENDICULAR_DAMPING_PER_FRAME = 0\.62;/
    );
    assert.match(
      pageSource,
      /const ZEN_LIVE_BOT_CHROME_AVOIDANCE_LARGE_AVATAR_SOFTENING = 0\.48;/
    );
    assert.match(pageSource, /function collectZenLiveBotChromeAvoidanceRects\(/);
    assert.match(pageSource, /function resolveZenLiveBotAvatarChromeAvoidanceMotion\(/);
    assert.match(pageSource, /const avatarSize = Math\.max\(bounds\.width, bounds\.height\);/);
    assert.match(pageSource, /const largeAvatarProgress = Math\.max\(/);
    assert.match(
      pageSource,
      /largeAvatarProgress \* ZEN_LIVE_BOT_CHROME_AVOIDANCE_LARGE_AVATAR_SOFTENING/
    );
    assert.match(pageSource, /bounds\.width \* 1\.35/);
    assert.match(
      pageSource,
      /const avoidanceStrength = Math\.max\(0\.16,\s*distanceRatio\) \* largeAvatarSoftening;/
    );
    assert.match(
      pageSource,
      /const maxAvoidanceSpeed = Math\.max\(\s*ZEN_LIVE_BOT_CHROME_AVOIDANCE_MIN_LARGE_AVATAR_SPEED,\s*ZEN_LIVE_BOT_CHROME_AVOIDANCE_MAX_SPEED \* largeAvatarSoftening/
    );
    assert.match(pageSource, /-maxAvoidanceSpeed \* 0\.18/);
    assert.match(pageSource, /data-zen-live-bot-chrome-avoid="true"/);
    assert.match(
      pageSource,
      /data-zen-live-bot-chrome-avoid=\{variant === "chat" \? "true" : undefined\}/
    );
    assert.match(
      pageSource,
      /setAvatarPositionClamped\(\s*current\s*,\s*persist\s*,\s*avatarDragRef\.current === null\s*,?\s*\);/
    );
    assert.match(pageSource, /const chromeMotion = resolveZenLiveBotAvatarChromeAvoidanceMotion\(/);
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

  it("shows live presence once a new Zen opener begins revealing", () => {
    assert.match(
      pageSource,
      /const zenNewSessionPresenceDeferred =\s*chatLikeSurface &&\s*\(activeConversationIsEmpty \|\|\s*showConversationSurfaceLoading \|\|\s*zenInitialThinkingActive\);/
    );
    assert.doesNotMatch(
      pageSource.slice(
        pageSource.indexOf("const zenNewSessionPresenceDeferred"),
        pageSource.indexOf("const showMessagesFrameStateLoadingOverlay")
      ),
      /zenInitialReplyRevealActive/
    );
    assert.match(
      pageSource,
      /const zenDefaultPrismPresenceVisible =\s*chatLikeSurface &&\s*!zenNewSessionPresenceDeferred &&\s*zenPersonaBotId === null &&\s*zenPersonaPresence\.visibleBotId === null;/
    );
    assert.match(
      pageSource,
      /const zenLivePresenceRailVisible =\s*!zenNewSessionPresenceDeferred &&\s*\(zenDefaultPrismPresenceVisible \|\|/
    );
  });

  it("uses the wordmark as the reversible Zen zoom toggle", () => {
    assert.match(
      pageSource,
      /const \[zenZoomedOutConversationId, setZenZoomedOutConversationId\]\s*=\s*useState<\s*string \| null\s*>\(null\);/
    );
    assert.match(
      pageSource,
      /if \(view === "chat" && conversationForDisplay\.mode === "zen"\) \{\s*setZenZoomedOutConversationId\(null\);/
    );

    const zoomOutStart = pageSource.indexOf("function zoomOutFromActiveZenConversation()");
    const zoomInStart = pageSource.indexOf("async function zoomIntoActiveZenConversation()");
    assert.notEqual(zoomOutStart, -1);
    assert.notEqual(zoomInStart, -1);
    const zoomOutSource = pageSource.slice(zoomOutStart, zoomInStart);
    const zoomInSource = pageSource.slice(
      zoomInStart,
      pageSource.indexOf("function handleChatHeaderWordmarkClick", zoomInStart)
    );
    assert.match(zoomOutSource, /setZenZoomedOutConversationId\(activeZenConversationId\);/);
    assert.match(zoomOutSource, /performShowAllBotsView\(null, \{ suppressChatAutoRestore: true \}\);/);
    assert.match(zoomInSource, /setForceNewConversationOnNextSend\(false\);/);
    assert.match(zoomInSource, /await refreshConversation\(returnConversationId\);/);
    assert.match(zoomInSource, /setChatAutoRestoreSuppressed\(true\);/);

    const wordmarkStart = pageSource.indexOf("function handleChatHeaderWordmarkClick");
    const wordmarkSource = pageSource.slice(
      wordmarkStart,
      pageSource.indexOf("function handleSandboxHeaderWordmarkClick", wordmarkStart)
    );
    assert.match(
      wordmarkSource,
      /if \(zenCanZoomIntoActiveConversation\) \{\s*void zoomIntoActiveZenConversation\(\);\s*return;\s*\}/
    );
    assert.match(
      wordmarkSource,
      /if \(zenCanZoomOutToAllBots\) \{\s*zoomOutFromActiveZenConversation\(\);\s*return;\s*\}/
    );
    assert.match(
      pageSource,
      /const zenWordmarkActionLabel = relationshipDepthReturnBlockedByReply/
    );
    assert.match(
      pageSource,
      /relationshipDepthReturnDepth > 0[\s\S]{0,180}zenCanZoomOutToAllBots/
    );
    assert.match(pageSource, /aria-label=\{zenWordmarkActionLabel\}/);
    assert.doesNotMatch(pageSource, /function renderZenZoomNavigationButton\(\)/);
    assert.doesNotMatch(pageSource, /function renderZenZoomReturnButton\(\)/);
    assert.doesNotMatch(css, /\.zenZoomNavigationButton\b/);
    assert.doesNotMatch(css, /\.zenZoomReturnButton\b/);
  });

  it("keeps fresh Zen hero model and privacy controls inside the hero", () => {
    assert.match(
      pageSource,
      /const renderZenSplashControls = \(\) =>\s*zenCanvasModelPickerActive \? \(\s*<div\s*className=\{styles\.zenSplashControls\}/
    );
    assert.match(
      pageSource,
      /renderHeaderModelPicker\(\{\s*modelMenuClassName: styles\.zenSplashModelMenu,\s*modelMenuWidthPx: 220,\s*showBotPicker: false,\s*showVoiceSelector: false,\s*\}\)/
    );
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.privateChatButton\} \$\{styles\.zenSplashPrivateButton\}`\}/
    );
    assert.match(pageSource, /aria-pressed=\{appWidePrivateMode\}/);
    assert.equal(pageSource.match(/\{renderZenSplashControls\(\)\}/g)?.length, 2);
    assert.match(css, /\.zenSplashControls\b/);
    assert.match(css, /\.zenSplashPrivateButton\b/);
  });

  it("keeps sparse Zen transcripts natively scrollable", () => {
    const sparseTranscriptRule = ruleForSelectorNeedles(
      '.messages[data-chat-ephemeral="true"] > article.message:first-of-type',
      '.messages[data-chat-ephemeral="true"] > article.message:last-of-type'
    );
    assert.match(sparseTranscriptRule, /margin-block:\s*0\s*;/);
    assert.doesNotMatch(
      css,
      />\s*article\.message:first-of-type\s*\{[\s\S]*?margin-block-start:\s*auto/
    );
    assert.doesNotMatch(
      css,
      />\s*article\.message:last-of-type\s*\{[\s\S]*?margin-block-end:\s*auto/
    );
  });

  it("keeps selected persona hero headings structured for unusual names", () => {
    assert.match(
      pageSource,
      /const titleSubjectLongestWordLength = titleSubject\s*\.split\(\/\\s\+\/u\)\s*\.reduce/
    );
    assert.match(
      pageSource,
      /const renderZenHeroTitle = \(\s*options: \{ inlineHero\?: boolean \} = \{\}\s*,?\s*\) =>/
    );
    assert.match(
      pageSource,
      /const titleSubjectVisualCapRem = heroBot\s*\?\s*Math\.min\(titleSubjectFontCapRem, 3\.2\)/
    );
    assert.match(pageSource, /data-zen-title-long=\{/);
    assert.match(pageSource, /data-selected-bot-hero="true"/);
    assert.match(
      pageSource,
      /className=\{styles\.emptyStateSelectedHeroIdentity\}/
    );
    assert.match(
      pageSource,
      /className=\{styles\.emptyStateSelectedHeroCopy\}/
    );
    assert.match(pageSource, /className=\{styles\.emptyStateTitlePhrase\}/);
    assert.match(pageSource, /className=\{styles\.emptyStateTitleSubject\}/);
    assert.match(
      pageSource,
      /<span className=\{styles\.emptyStateTitleLead\}>Chat<\/span>[\s\S]*?<span className=\{styles\.emptyStateTitleLead\}>with<\/span>/
    );
    assert.doesNotMatch(
      pageSource,
      /<span className=\{styles\.emptyStateTitleLead\}>Zen<\/span>[\s\S]*?<span className=\{styles\.emptyStateTitleLead\}>with<\/span>/
    );
    assert.doesNotMatch(
      pageSource,
      /<div className=\{styles\.emptyStateTitle\}>\s*\{`Zen with \$\{titleSubject\}`\}\s*<\/div>/
    );
    assert.match(css, /text-wrap:\s*balance\s*;/);
    assert.match(css, /overflow-wrap:\s*anywhere\s*;/);
    assert.match(css, /\.emptyStateTitle\[data-zen-title-long="true"\]/);
    assert.match(css, /\.emptyStateSelectedHeroIdentity\b/);
    assert.match(css, /\.emptyStateSelectedHeroCopy\b/);
    assert.match(
      css,
      /\.emptyStateInfoBand\[data-selected-bot-hero="true"\][\s\S]*\.emptyStateInfoBandRow/
    );
    assert.match(
      css,
      /\.emptyStateInfoBand\[data-selected-bot-hero="true"\][\s\S]*\.emptyStateTitleSubject[\s\S]*hyphens:\s*manual\s*;/
    );
    assert.match(
      css,
      /\.emptyStateInfoBand[\s\S]*\.emptyStateTitle\[data-zen-title-with-hero="true"\]/
    );
  });

  it("moves refresh to the permanent recycle navbar button", () => {
    assert.match(pageSource, /Recycle,/);
    assert.match(pageSource, /onClick=\{\(\) => runAction\(refreshPrismFromNavbar\)\}/);
    assert.match(pageSource, /aria-label="Refresh Prism"/);
    assert.match(
      pageSource,
      /function refreshPrismFromNavbar\(\): void \{ reloadPrismPage\(typeof window === "undefined" \? null : window\.location\); \}/
    );
    assert.doesNotMatch(pageSource, /createBuiltInRefreshCommand/);
    assert.doesNotMatch(pageSource, /id:\s*"builtin:\/refresh"/);
    assert.doesNotMatch(pageSource, /renderNavbarRefreshSplash/);
    assert.doesNotMatch(pageSource, /navbarRefreshSplashVisible/);
    assert.match(
      pageSource,
      /showLocalCommandToast\(\s*"Refresh moved"\s*,\s*"Use the recycle icon in the navbar\."\s*,?\s*\)/
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
