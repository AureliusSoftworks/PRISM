import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { botAvatarScreenFacingScaleX } from "./bot-avatar-render-geometry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "../../public");
const componentSource = readFileSync(
  join(here, "chatMiniBotAvatar.tsx"),
  "utf8",
);
const microComponentSource = readFileSync(
  join(here, "BotAvatarMicro.tsx"),
  "utf8",
);
const miniInkComponentSource = readFileSync(
  join(here, "MiniAvatarDetailsInk.tsx"),
  "utf8",
);
const cssSource = readFileSync(
  join(here, "chatMiniBotAvatar.module.css"),
  "utf8",
);
const pageSource = readFileSync(join(here, "page.tsx"), "utf8");
const pageCssSource = readFileSync(join(here, "page.module.css"), "utf8");

function pngHeader(fileName: string): {
  bytes: number;
  width: number;
  height: number;
  colorType: number;
} {
  const data = readFileSync(join(publicDir, "bot-frame", fileName));
  assert.equal(data.subarray(1, 4).toString("ascii"), "PNG");
  return {
    bytes: data.length,
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
  };
}

describe("chatMiniBotAvatar", () => {
  it("owns the shared Mini band through 299 rendered pixels", () => {
    assert.match(
      componentSource,
      /CHAT_MINI_BOT_AVATAR_MAX_RENDER_SIZE =\s*BOT_AVATAR_COMPACT_ENTER_MAX_PX - 1/u,
    );
    assert.match(
      componentSource,
      /import \{ BOT_AVATAR_COMPACT_ENTER_MAX_PX \} from "\.\/avatarRenderedSizeQuality"/u,
    );
  });

  it("uses the shared left/right screen contract for every mini screen layer", () => {
    assert.match(componentSource, /facing\?: BotAvatarFacing/);
    assert.match(componentSource, /data-avatar-facing=\{facing\}/);
    assert.match(componentSource, /botAvatarScreenFacingScaleX\(facing\)/);
    assert.match(componentSource, /styles\.upperScreenContent/);
    assert.match(componentSource, /styles\.lowerScreenContent/);
    assert.equal(botAvatarScreenFacingScaleX("right"), "1");
    assert.equal(botAvatarScreenFacingScaleX("left"), "-1");
    assert.match(
      cssSource,
      /\.upperScreenContent\s*\{[\s\S]*?transform:\s*translateY\(var\(--chat-mini-bot-upper-screen-nudge-y, 0px\)\)\s*scaleX\(var\(--chat-mini-bot-upper-screen-facing-scale-x, 1\)\)/,
    );
    assert.match(
      cssSource,
      /\.lowerScreenContent\s*\{[\s\S]*?transform:\s*translate\([\s\S]*?\)\s*scaleX\(var\(--chat-mini-bot-lower-screen-facing-scale-x, 1\)\)\s*scale\(var\(--chat-mini-bot-identity-glyph-scale, 0\.92\)\)/,
    );
    assert.match(
      componentSource,
      /\["--avatar-details-facing-scale-x" as string\]: "1"/,
      "the outer mini rig must be the only horizontal mirror for custom Ink",
    );
    assert.match(
      componentSource,
      /\["--chat-mini-bot-upper-screen-facing-scale-x" as string\]:\s*screenFacingScaleX/,
      "upper screen mirroring remains driven by explicit upper facing",
    );
    assert.match(
      componentSource,
      /\["--chat-mini-bot-lower-screen-facing-scale-x" as string\]:\s*"var\(--bot-avatar-external-facing-scale-x, 1\)"/,
      "lower identity glyph stays upright and can counter an external chassis mirror",
    );
    assert.doesNotMatch(
      componentSource,
      /\["--chat-mini-bot-lower-screen-facing-scale-x" as string\]:\s*screenFacingScaleX/,
      "lower glyph must not mirror with body facing",
    );
    assert.match(
      pageSource,
      /\["--coffee-plate-emoji-face-scale-y" as string\]:\s*BOT_AVATAR_CANONICAL_FACE_SCALE_Y/,
      "the inner punctuation face must remain canonical to avoid a double flip",
    );
    assert.doesNotMatch(
      componentSource,
      /directionIndependentFace|props\.thinking/,
    );
    assert.match(
      pageSource,
      /\[avatarFacing, setAvatarFacing\] = useState<ZenLiveAvatarFacing>\(\s*zenLiveBotFacingForCanvasSide\(avatarCanvasSide\)/,
    );
    assert.match(
      pageSource,
      /<EmptyStateHeroMiniBot[\s\S]{0,900}?facing=\{avatarFacing\}/,
    );
    assert.match(
      pageSource,
      /<ZenLiveBotMannequin[\s\S]{0,240}?facing=\{avatarFacing\}/,
    );
    assert.match(
      pageSource,
      /facing=\{\s*ambientFacing \?\? BOT_AVATAR_CANONICAL_FACING\s*\}/,
    );
    assert.doesNotMatch(componentSource, /key=\{?facing/);
    assert.doesNotMatch(pageSource, /key=\{[^}]*avatarFacing/);
  });

  it("keeps every mini buckle and authored Ink on one shared registration", () => {
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniGlyph\s*\{[^}]*width:\s*var\(--chat-mini-bot-glyph-size[^}]*height:\s*var\(--chat-mini-bot-glyph-size/,
    );
    assert.match(
      cssSource,
      /\.root\s*\{[^}]*--chat-mini-bot-lower-screen-anchor-x:\s*50%[^}]*--chat-mini-bot-lower-screen-anchor-y:\s*75\.4%[^}]*--chat-mini-bot-lower-screen-nudge-x:\s*1px[^}]*--chat-mini-bot-lower-screen-nudge-y:\s*1px/,
      "the lower glyph must use one chassis-relative center anchor at every Mini scale",
    );
    assert.doesNotMatch(
      cssSource,
      /--chat-mini-bot-lower-screen-nudge-[xy]:[^;]*(?:clamp|chat-mini-bot-render-size)/,
      "the buckle anchor must not drift through size-dependent pixel nudges",
    );
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniArt\s*\{[^}]*transform:\s*translateY\(-2px\)/,
    );
    assert.match(
      cssSource,
      /\.lowerScreenContent\s*\{[^}]*transform:\s*translate\([^}]*--chat-mini-bot-lower-screen-nudge-x[^}]*--chat-mini-bot-lower-screen-nudge-y[^}]*\)\s*scaleX\(var\(--chat-mini-bot-lower-screen-facing-scale-x, 1\)\)\s*scale\(var\(--chat-mini-bot-identity-glyph-scale, 0\.92\)\)/,
    );
    assert.match(
      cssSource,
      /\.root\s*\{[^}]*--chat-mini-bot-identity-glyph-scale:\s*0\.92/,
      "every Mini consumer must inherit the slightly reduced identity-glyph scale",
    );
  });

  it("moves Mini mouths up one screen pixel without moving eyes or Full faces", () => {
    assert.match(cssSource, /--chat-mini-bot-mouth-nudge-y:\s*-1px;/);
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji:is\(\.coffeeSeatMiniAvatarFace, \.emptyStateHeroMiniFace\)\s*\[data-coffee-plate-emoji-part="mouth"\]\s*\{[^}]*translate:\s*calc\(\s*var\(--chat-mini-bot-mouth-nudge-y, 0px\)\s*\/\s*var\(--zen-live-bot-face-scale, 1\)\s*\/\s*var\(--coffee-seat-emotion-face-scale, 1\)\s*\)\s*0;/,
    );
    for (const scale of [1, 1.68, 2]) {
      for (const moodScale of [0.9, 1, 1.1]) {
        const localX = -1 / scale / moodScale;
        // All Mini face glyphs rotate 90deg, mapping local X to screen Y.
        assert.ok(Math.abs(localX * scale * moodScale + 1) < 1e-12);
      }
    }
  });

  it("keeps the buckle nudge screen-right even in an externally mirrored Mini", () => {
    assert.match(
      cssSource,
      /calc\(var\(--chat-mini-bot-lower-screen-nudge-x, 0px\) \* var\(--chat-mini-bot-lower-screen-facing-scale-x, 1\)\)/,
    );
    for (const facing of [-1, 1]) {
      assert.equal(1 * facing * facing, 1);
    }
  });

  it("uses keyed solid identity color with only the face and glyph overlaid", () => {
    assert.match(
      cssSource,
      /\.root\s*\{[^}]*--chat-mini-bot-upper-screen-nudge-y:\s*clamp\(\s*1px,\s*calc\(var\(--chat-mini-bot-render-size\) \* 0\.02\),\s*2px\s*\)/,
      "Dark Minis must retain their approved face registration",
    );
    assert.match(
      cssSource,
      /--chat-mini-bot-eye-nudge-y:\s*clamp\(\s*0px,\s*calc\(var\(--chat-mini-bot-render-size\) \* 0\.006\),\s*1\.5px\s*\)/,
      "Mini eyes receive one proportional optical drop without moving the mouth or Ink",
    );
    assert.match(
      pageCssSource,
      /--bot-face-eye-shift-y:\s*calc\([^;]*var\(--chat-mini-bot-eye-nudge-y, 0px\)/,
      "the shared eye transform consumes the Mini-only optical nudge",
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji:is\(\.coffeeSeatMiniAvatarFace, \.emptyStateHeroMiniFace\)\s*\[data-crt-glyph-layer="true"\]\s*\{[^}]*color:\s*var\(\s*--chat-mini-bot-screen-ink,[^}]*background:\s*none[^}]*-webkit-text-fill-color:\s*currentColor/,
      "every compact face source must consume the shared Mini screen ink",
    );
    assert.match(
      componentSource,
      /botAvatarScreenPaletteVariables\(screenPalette\)/,
      "Mini face and Ink must retain the canonical theme-aware glyph token",
    );
    assert.match(
      componentSource,
      /normalizeAccentForTheme\(\s*normalizeBotIdentityColor\(color\) \?\? "#7c6cff",\s*theme,\s*\)/,
      "both Mini themes must key the sprite with their normalized identity color",
    );
    assert.match(
      cssSource,
      /\.root\[data-theme="light"\]\s*\{[^}]*--chat-mini-bot-screen-ink:\s*var\(--bot-avatar-screen-glyph, #fbfdff\)[^}]*--chat-mini-bot-lower-screen-ink:\s*var\(\s*--chat-mini-bot-normalized-color,[^}]*--chat-mini-bot-upper-screen-nudge-y:\s*clamp\(\s*2px,\s*calc\(var\(--chat-mini-bot-render-size\) \* 0\.025\),\s*3px\s*\)/,
      "Light Minis must receive the lower optical registration without moving Dark",
    );
    assert.match(
      cssSource,
      /\.frameIdentityColor\s*\{[^}]*background:\s*var\(\s*--chat-mini-bot-normalized-color,[^}]*bot-frame-mini-dark-color-key-mask\.png/,
      "the Dark source must restore only its keyed LEDs with one solid identity color",
    );
    assert.match(
      cssSource,
      /\.root\[data-theme="light"\] \.frameIdentityColor\s*\{[^}]*bot-frame-mini-light-color-key-mask\.png/,
      "the Light source must restore its keyed face field and LEDs with the same solid identity color",
    );
    assert.doesNotMatch(
      cssSource,
      /\.root\[data-theme="(?:light|dark)"\] \.upperScreen\s*\{[^}]*gradient/,
      "neither Mini theme may paint a procedural screen gradient",
    );
    assert.match(
      cssSource,
      /\.root\[data-theme="light"\] \.lowerScreen\s*\{[^}]*color:\s*var\(--chat-mini-bot-lower-screen-ink\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/,
      "the Mini lower identity must have no receiving-disc material",
    );
    assert.match(
      cssSource,
      /\.root\s*\{[^}]*--chat-mini-bot-lower-screen-anchor-x:\s*50%[^}]*--chat-mini-bot-lower-screen-anchor-y:\s*75\.4%[^}]*--chat-mini-bot-lower-screen-width:\s*13\.5%[^}]*--chat-mini-bot-lower-screen-height:\s*14%/,
      "Light and Dark must share one chassis-relative lower-glyph geometry",
    );
    assert.doesNotMatch(
      cssSource,
      /\.root\[data-theme="light"\]\s*\{[^}]*--chat-mini-bot-lower-screen-(?:anchor|left|top|width|height)/,
      "Light must not override the shared lower-glyph registration",
    );
    assert.match(
      miniInkComponentSource,
      /deriveBotAvatarScreenPalette\(color\?\.trim\(\) \?\? "", theme\)\?\.glyph \?\? color/,
      "Light Mini Ink must rasterize with the same canonical white glyph token",
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatMiniAvatarGlyph\s*\{[^}]*color:\s*var\(\s*--chat-mini-bot-lower-screen-ink,/,
    );
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniGlyph\s*\{[^}]*color:\s*var\(\s*--chat-mini-bot-lower-screen-ink,/,
      "every Mini lower glyph must consume the normalized identity ink",
    );
  });

  it("switches between dedicated low-resolution dark and light pixel chassis", () => {
    assert.match(
      componentSource,
      /\/bot-frame\/bot-frame-mini-dark-clean\.png/,
    );
    assert.match(
      componentSource,
      /\/bot-frame\/bot-frame-mini-light-clean\.png/,
    );
    assert.doesNotMatch(componentSource, /\/bot-frame\/bot-frame-base\.png/);
    assert.doesNotMatch(
      componentSource,
      /\/bot-frame\/bot-frame-light-base\.png/,
    );
    const darkMini = pngHeader("bot-frame-mini-dark.png");
    const lightMini = pngHeader("bot-frame-mini-light.png");
    const darkMiniClean = pngHeader("bot-frame-mini-dark-clean.png");
    const lightMiniClean = pngHeader("bot-frame-mini-light-clean.png");
    const darkMiniColorKeyMask = pngHeader(
      "bot-frame-mini-dark-color-key-mask.png",
    );
    const lightMiniColorKeyMask = pngHeader(
      "bot-frame-mini-light-color-key-mask.png",
    );
    const darkCanonical = pngHeader("bot-frame-base.png");
    const lightCanonical = pngHeader("bot-frame-light-base.png");
    assert.deepEqual(
      {
        width: darkMini.width,
        height: darkMini.height,
        colorType: darkMini.colorType,
      },
      { width: 96, height: 96, colorType: 6 },
    );
    for (const derivedMiniAsset of [
      darkMiniClean,
      lightMiniClean,
      darkMiniColorKeyMask,
      lightMiniColorKeyMask,
    ]) {
      assert.deepEqual(
        {
          width: derivedMiniAsset.width,
          height: derivedMiniAsset.height,
          colorType: derivedMiniAsset.colorType,
        },
        { width: 96, height: 96, colorType: 6 },
      );
    }
    assert.deepEqual(
      {
        width: lightMini.width,
        height: lightMini.height,
        colorType: lightMini.colorType,
      },
      { width: 96, height: 96, colorType: 6 },
    );
    assert.ok(darkMini.bytes < darkCanonical.bytes / 10);
    assert.ok(lightMini.bytes < lightCanonical.bytes / 10);
    assert.match(
      pageCssSource,
      /--bot-face-frame-base-image:\s*url\("\/bot-frame\/bot-frame-base\.png/,
    );
    assert.match(
      pageCssSource,
      /--bot-face-frame-base-image:\s*url\("\/bot-frame\/bot-frame-light-base\.png/,
    );
    assert.match(componentSource, /theme\?: "light" \| "dark"/);
    assert.match(componentSource, /theme === "light"/);
    assert.match(componentSource, /data-theme=\{theme\}/);
    assert.match(
      componentSource,
      /data-avatar-canonical-screen-size=\{\s*CHAT_MINI_BOT_AVATAR_CANONICAL_SCREEN_SIZE\s*\}/,
    );
    assert.match(
      componentSource,
      /data-avatar-face-coordinate-source="studio"/,
    );
    assert.match(pageSource, /theme=\{resolvedTheme\}/);
    assert.doesNotMatch(componentSource, /avatar-small-off\.png/);
    assert.doesNotMatch(componentSource, /avatar-small-on\.png/);
    assert.doesNotMatch(componentSource, /magentaTintedRasterUrl/);
  });

  it("keeps alloy identity while removing compact glow, phosphor, and breathing", () => {
    assert.match(cssSource, /\.frameBase/);
    assert.match(cssSource, /\.frameIdentityColor/);
    assert.match(cssSource, /\.frameAlloy/);
    assert.match(
      cssSource,
      /\.frameIdentityColor\s*\{[^}]*z-index:\s*4/,
      "solid keyed pixels must sit above the overlapping alloy mask so every authored LED stays on",
    );
    assert.match(cssSource, /\.frameAlloy\s*\{[^}]*z-index:\s*3/);
    assert.match(cssSource, /bot-frame-mini-metal-mask\.png/);
    assert.doesNotMatch(cssSource, /bot-frame-metal-mask\.png/);
    const miniMetalMask = pngHeader("bot-frame-mini-metal-mask.png");
    assert.deepEqual(
      {
        width: miniMetalMask.width,
        height: miniMetalMask.height,
        colorType: miniMetalMask.colorType,
      },
      { width: 96, height: 96, colorType: 6 },
    );
    assert.ok(
      miniMetalMask.bytes < pngHeader("bot-frame-metal-mask.png").bytes / 10,
    );
    assert.match(cssSource, /image-rendering:\s*pixelated/);
    assert.match(cssSource, /mix-blend-mode:\s*color/);
    assert.match(cssSource, /\.frameAlloy\s*\{[^}]*opacity:\s*1/);
    assert.match(componentSource, /alloyColor\?: string \| null/);
    assert.match(componentSource, /--chat-mini-bot-alloy-color/);
    assert.match(pageSource, /botFrameMetalAlloyColor\(voicePreset/);
    assert.match(pageSource, /alloyColor=\{alloyColor\}/);
    assert.match(cssSource, /\.upperScreen/);
    assert.match(cssSource, /\.lowerScreen/);
    assert.match(cssSource, /\.upperScreen\s*\{[^}]*z-index:\s*7/);
    assert.match(cssSource, /\.frameBase\s*\{[^}]*z-index:\s*2/);
    assert.match(
      cssSource,
      /\.upperScreen\s*\{[^}]*left:\s*var\(--chat-mini-bot-frame-left\)[^}]*top:\s*var\(--chat-mini-bot-frame-top\)[^}]*width:\s*var\(--chat-mini-bot-frame-width\)[^}]*height:\s*var\(--chat-mini-bot-frame-height\)/,
    );
    assert.match(cssSource, /container-type:\s*inline-size/);
    assert.match(
      cssSource,
      /--chat-mini-bot-frame-width:\s*78\.90625%[^}]*--chat-mini-bot-frame-height:\s*78\.90625%/,
    );
    assert.match(
      cssSource,
      /clip-path:\s*ellipse\(34\.2% 33\.4% at 50% 46\.1%\)/,
    );
    assert.match(cssSource, /\.sizeHero/);
    assert.match(
      cssSource,
      /\.sizeHero\s*\{[^}]*--chat-mini-bot-glyph-size:\s*clamp\(20px, 1\.9vw, 24px\)/,
    );
    assert.match(
      cssSource,
      /\.sizeRoom\s*\{[^}]*--chat-mini-bot-glyph-size:\s*11px/,
    );
    assert.match(cssSource, /\.sizeBadge/);
    assert.doesNotMatch(cssSource, /\.frameOff|\.frameOn/);
    assert.doesNotMatch(
      componentSource,
      /talking\?: boolean|data-talking|talkingGlow/,
    );
    assert.doesNotMatch(cssSource, /talkingGlow|data-talking/);
    assert.doesNotMatch(componentSource, /data-tint-ready/);
    assert.match(componentSource, /size\?: "badge" \| "room" \| "hero"/);
    assert.match(componentSource, /renderSize\?: number/);
    assert.match(componentSource, /CHAT_MINI_BOT_AVATAR_MIN_RENDER_SIZE = 1/);
    assert.match(componentSource, /clampChatMiniBotAvatarRenderSize/);
    assert.match(
      componentSource,
      /data-render-size=\{renderSize \?\? undefined\}/,
    );
    assert.match(
      cssSource,
      /width:\s*var\(--chat-mini-bot-render-size\)[^}]*height:\s*var\(--chat-mini-bot-render-size\)/,
    );
    assert.doesNotMatch(componentSource, /lightMode|frameLight/);
    assert.doesNotMatch(cssSource, /frameLight|data-light-mode|Breath|Ignite/);
    assert.doesNotMatch(
      pageCssSource,
      /data-chat-mini-frame-light/,
      "Mini LEDs must come only from the keyed sprite pixels, never a separate light overlay",
    );
    assert.doesNotMatch(cssSource, /\.root\[data-size="hero"\]::before/);
    assert.match(cssSource, /\.root\[data-size="hero"\]::after/);
    assert.match(
      cssSource,
      /--chat-mini-bot-render-size:\s*clamp\(160px, 12\.5vw, 184px\)/,
    );
    assert.match(cssSource, /--chat-mini-bot-render-size:\s*140px/);
    assert.doesNotMatch(cssSource, /bot-frame-tint-mask|bot-frame-led/);
    assert.doesNotMatch(
      cssSource,
      /chat-mini-buckle-crt|repeating-linear-gradient/,
    );
    assert.match(
      cssSource,
      /\/\* Light and Dark share this exact bare-glyph registration\.[\s\S]*?\.lowerScreen\s*\{[^}]*overflow:\s*visible/,
      "the bare Mini glyph must not be clipped while moving toward the HD registration",
    );
    assert.match(
      cssSource,
      /\.lowerScreen\s*\{[^}]*left:\s*var\(--chat-mini-bot-lower-screen-anchor-x\)[^}]*top:\s*var\(--chat-mini-bot-lower-screen-anchor-y\)[^}]*transform:\s*translate\(-50%, -50%\)/,
      "the glyph box must be centered on the shared anchor instead of positioned from a drifting corner",
    );
    assert.match(
      cssSource,
      /\.upperScreen,\s*\.lowerScreen\s*\{[^}]*overflow:\s*hidden/,
      "shared screen defaults may clip, but the later bare-glyph rule must override them",
    );
    assert.doesNotMatch(
      cssSource,
      /\.root\[data-size="badge"\][^{]*\.lowerScreen::before/,
    );
  });

  it("mounts the mini avatar in the empty Chat/Zen selected-bot hero", () => {
    assert.match(pageSource, /function EmptyStateHeroMiniBot\(/);
    assert.match(
      pageSource,
      /<EmptyStateHeroMiniBot\s+bot=\{bot\}\s+resolvedTheme=\{resolvedTheme\}\s+leadershipGroupCount=\{leadershipGroupCount\}\s+isTalking=\{isTalking\}\s+mouthShape=\{mouthShape\}\s*\/>/,
    );
    assert.match(pageSource, /size = "hero"/);
    assert.match(pageSource, /<ChatMiniBotAvatar\s+size=\{size\}/);
    assert.doesNotMatch(componentSource, /data-talking|data-light-mode/);
    assert.match(pageSource, /SELECT THE BOT TO START THE CHAT/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniBot\b/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniFace\b/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniFaceRig\b/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniGlyph\b/);
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.coffeeSeatPlateEmoji\} \$\{styles\.emptyStateHeroMiniFace\}`\}/,
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /className=\{`\$\{styles\.coffeeSeatPlateEmoji\} \$\{styles\.emptyStateHeroMiniFace\}`\}/g,
        ),
      ].length,
      4,
      "Batch Foundry, Chat/Zen, Debate, and Avatar Studio mini portraits must share Avatar Studio's face paint-box geometry",
    );
    const miniFaceCalls = [
      ...pageSource.matchAll(
        /<CoffeeSeatPlateEmoji(?:(?!<CoffeeSeatPlateEmoji)[\s\S])*?className=\{`\$\{styles\.coffeeSeatPlateEmoji\} \$\{styles\.emptyStateHeroMiniFace\}`\}(?:(?!<CoffeeSeatPlateEmoji)[\s\S])*?\/>/g,
      ),
    ];
    assert.equal(miniFaceCalls.length, 4);
    for (const [index, [miniFaceCall]] of miniFaceCalls.entries()) {
      assert.match(
        miniFaceCall,
        /faceEyeMovement="still"/,
        "mini faces keep their authored eye geometry stationary while ordinary blinking remains live",
      );
      assert.match(
        miniFaceCall,
        /\bpixelated\b/,
        "mini faces use pixel glyphs as part of the chassis charm",
      );
      assert.match(miniFaceCall, /\bhardPixels\b/);
      assert.match(miniFaceCall, /motionMode="mini-led"/);
      if (index < 3) {
        assert.doesNotMatch(
          miniFaceCall,
          /showThinkingSpinner|showQuestionMark/,
        );
      } else {
        assert.match(miniFaceCall, /showThinkingSpinner/);
      }
      assert.doesNotMatch(miniFaceCall, /zenLiveBotPresenceFaceGlyph/);
    }
    assert.doesNotMatch(pageSource, /miniAvatarBinaryMouthShape/);
    assert.match(
      pageSource,
      /const miniMouthShape = mouthShape \?\? \(isTalking \? "open-wide" : "closed"\)/,
      "shared Mini faces must retain the live viseme when one is available",
    );
    assert.match(pageSource, /style=\{miniFaceRegistrationStyle\}/);
    assert.match(pageSource, /botAvatarFaceRegistrationStyle\(hasAvatarArt\)/);
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace\s*\{[^}]*display:\s*inline-grid/,
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace\s*\{[^}]*color:\s*var\(\s*--chat-mini-bot-screen-ink,/,
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace[\s\S]*?\[data-crt-glyph-layer="true"\]::after\s*\{[^}]*background:\s*none[^}]*-webkit-text-fill-color:\s*currentColor/,
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace\s*\{[^}]*font-size:\s*var\(--zen-live-bot-avatar-face-glyph-size, 21\.7cqw\)/,
    );
    assert.doesNotMatch(
      pageCssSource,
      /\.emptyStateHeroMiniArt\s*\{[^}]*(?:--avatar-details-ink-aperture-scale|--avatar-details-offset-[xy])/,
    );
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniGlyph\s*\{[^}]*width:\s*var\(--chat-mini-bot-glyph-size[^}]*height:\s*var\(--chat-mini-bot-glyph-size/,
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace[\s\S]*?\[data-crt-glyph-layer="true"\]::before\s*\{[^}]*display:\s*none/,
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace[\s\S]*?\[data-crt-glyph-layer="true"\]::after\s*\{[^}]*text-shadow:\s*none/,
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\s+\[data-coffee-plate-emoji-part="mouth"\][\s\S]*?transform:\s*rotate\(var\(--bot-face-mouth-rotation, 0deg\)\)/,
    );
    assert.match(
      pageSource,
      /behindFace=\{renderAvatarDetailsInk\("behind-face"\)\}[\s\S]*?aboveFace=\{renderAvatarDetailsInk\("above-face"\)\}[\s\S]*?<CoffeeSeatPlateEmoji/,
    );
    assert.match(miniInkComponentSource, /coreColor="ink"/);
    assert.match(
      pageSource,
      /<MiniAvatarDetailsInk[\s\S]{0,260}color=\{normalizedBotColor\}/,
    );
    assert.match(pageSource, /faceEyeMovement="still"/);
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniArt\[data-avatar-details-depth="behind-face"\][\s\S]*?z-index:\s*1/,
    );
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniArt\[data-avatar-details-depth="above-face"\][\s\S]*?z-index:\s*3/,
    );
    assert.match(
      pageCssSource,
      /\.emptyStateIconButton:has\(\.emptyStateHeroMiniBot\)/,
    );
    assert.match(
      pageCssSource,
      /\.emptyStateInfoBand:not\(\[data-selected-bot-hero="true"\]\)[\s\S]*?\.emptyStateHeroMiniBot\s*\{[^}]*width:\s*104px/,
    );
  });

  it("keeps Mini Ink semantically synchronized to the displayed face", () => {
    assert.doesNotMatch(componentSource, /thinking: boolean|props\.thinking/);
    assert.match(componentSource, /behindFace\?: ReactNode/);
    assert.match(componentSource, /aboveFace\?: ReactNode/);
    assert.match(componentSource, /\{props\.behindFace\}/);
    assert.match(componentSource, /\{props\.aboveFace\}/);
    assert.match(
      pageSource,
      /import \{ MiniAvatarDetailsInk \} from "\.\/MiniAvatarDetailsInk"/,
    );
    assert.equal(
      [...pageSource.matchAll(/<MiniAvatarDetailsInk\b/g)].length,
      5,
      "every Mini face surface must share the semantic Ink wrapper",
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /<MiniAvatarDetailsInk\b(?:(?!>)[\s\S])*?\btheme=(?:"dark"|\{(?:resolvedTheme|theme|previewTheme)\})/g,
        ),
      ].length,
      5,
      "every Mini Ink surface must receive the same theme as its chassis",
    );
    assert.match(
      miniInkComponentSource,
      /onBlinkPhaseChange:\s*\(phase: CoffeeSeatBlinkPhase\) => void/,
      "the face reports its final displayed blink phase to Mini Ink",
    );
    assert.match(miniInkComponentSource, /blinkPhase=\{blinkPhase\}/);
    assert.match(miniInkComponentSource, /talking=\{talking\}/);
    assert.match(miniInkComponentSource, /speechMotionActive=\{false\}/);
    assert.match(
      miniInkComponentSource,
      /hasAvatarArt && !thinking/,
      "thinking owns the whole Mini screen and clears both Ink depths",
    );
    assert.match(
      miniInkComponentSource,
      /detailLevel="audience"[\s\S]*?coreColor="ink"/,
      "Mini keeps the shared semantic raster but never enters Full HD Ink motion",
    );
    assert.equal(
      [...pageSource.matchAll(/onBlinkPhaseChange=\{onBlinkPhaseChange\}/g)]
        .length,
      5,
      "each Mini face must feed its displayed blink phase back to Ink",
    );
    assert.match(
      pageSource,
      /talking=\{authoredMiniPortrait && galleryTalking\}/,
      "Debate Speech ink must follow the whole speaking interval, including closed visemes",
    );
    assert.doesNotMatch(
      pageSource,
      /talking=\{authoredMiniPortrait && debateMouthActive\}/,
    );
    assert.match(
      pageSource,
      /behindFace=\{renderAvatarDetailsInk\("behind-face"\)\}/,
    );
    assert.match(
      pageSource,
      /aboveFace=\{renderAvatarDetailsInk\("above-face"\)\}/,
    );
    assert.match(pageSource, /\{renderAvatarDetailsInk\("behind-face"\)\}/);
    assert.match(pageSource, /\{renderAvatarDetailsInk\("above-face"\)\}/);
  });

  it("uses one glyph-only micro renderer without facial art or Avatar Details Ink", () => {
    assert.match(pageSource, /function BotAvatarMicroRenderer\(/);
    const microFaceFn = pageSource.slice(
      pageSource.indexOf("function BotAvatarMicroRenderer("),
      pageSource.indexOf("function MessageMoodFace("),
    );
    assert.match(microFaceFn, /<BotAvatarMicro/);
    assert.match(microFaceFn, /renderSizePx=\{props\.renderSizePx\}/);
    assert.match(
      microComponentSource,
      /--bot-avatar-micro-glyph-color[\s\S]{0,100}BOT_AVATAR_MICRO_GLYPH_COLOR/,
      "Dark Micro glyphs retain the shared white-mark contract",
    );
    assert.match(
      microComponentSource,
      /data-avatar-render-tier=\{atomicAvatar \? "atomic" : "micro"\}/,
    );
    assert.match(
      microComponentSource,
      /botAvatarMicroPresentationForSize\(props\.renderSizePx\)/,
    );
    assert.match(
      microComponentSource,
      /data-avatar-micro-presentation=\{presentation\}/,
    );
    assert.match(
      microComponentSource,
      /<span className=\{styles\.botAvatarMicroGlyph\}>\{props\.glyph\}<\/span>/,
      "Every readable Micro presentation must use the identity glyph",
    );
    assert.match(microComponentSource, /showIdentityPixel \? \(/);
    assert.match(microComponentSource, /styles\.botAvatarMicroIdentityPixel/);
    assert.match(microComponentSource, /normalizeBotIdentityColor\(color\)/);
    assert.match(
      microComponentSource,
      /normalizeAccentForTheme\(identityColor, "dark"\)/,
    );
    assert.match(
      microComponentSource,
      /normalizeAccentForTheme\(identityColor, "light"\)/,
    );
    assert.match(microComponentSource, /data-bot-avatar-micro-screen="true"/);
    assert.doesNotMatch(
      microComponentSource,
      /AvatarDetailsMask|CoffeeSeatPlateEmoji|faceStyle|isTalking|mouthShape|scheduleKey|botAvatarMicroFaceRig|botAvatarMicroInk/,
    );
    assert.match(pageCssSource, /\[data-variant="micro"\]/);
    assert.match(
      pageCssSource,
      /\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[^}]*border:\s*1px solid/,
    );
    assert.match(
      pageCssSource,
      /\.botAvatarMicroGlyph\s*\{[^}]*place-items:\s*center;[^}]*color:\s*var\(--bot-avatar-micro-glyph-color, #ffffff\)/,
    );
    assert.match(
      pageCssSource,
      /\.themeLight \.botAvatarMicroGlyph\s*\{[^}]*color:\s*var\(--bot-avatar-micro-identity-color-light, #5f50d8\)/,
      "Light Micro glyphs must use the normalized identity color",
    );
    assert.match(
      pageCssSource,
      /\.themeLight\s+\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[^}]*--bot-avatar-micro-identity-color:[^}]*--bot-avatar-micro-identity-color-light[^}]*background:[^}]*circle at 32% 20%[^}]*#ffffff 0 58%[^}]*#dfe8ee 100%[^}]*border-color:\s*var\(--bot-avatar-micro-identity-color\);[^}]*box-shadow:[^}]*inset 0 -5px 8px rgba\(72, 89, 104, 0\.18\)/,
      "Light Micro must keep its white-glass material with a normalized identity rim",
    );
    assert.match(
      pageCssSource,
      /\.botAvatarMicroGlyph > svg\s*\{[^}]*width:\s*64%;[^}]*height:\s*64%/,
    );
    assert.match(
      pageCssSource,
      /data-avatar-micro-presentation="block"[^}]*width:\s*4px;[^}]*height:\s*4px/,
    );
    assert.match(
      pageCssSource,
      /data-avatar-micro-presentation="pixel"[^}]*width:\s*1px;[^}]*height:\s*1px/,
    );
    assert.match(
      pageCssSource,
      /data-avatar-micro-presentation="atomic"\]\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/,
      "Atomic avatars must be bare glyphs without an orb",
    );
    assert.match(
      pageCssSource,
      /data-avatar-micro-presentation="atomic"\]\s*\.botAvatarMicroGlyph\s*\{[^}]*--bot-avatar-micro-identity-color-dark/,
      "Atomic avatars must use the normalized identity color in Dark Mode",
    );
    assert.match(
      pageCssSource,
      /\.themeLight \.botAvatarMicroIdentityPixel\s*\{[^}]*background:\s*var\(--bot-avatar-micro-identity-color, #5f50d8\)/,
    );
    assert.match(
      pageCssSource,
      /\.botAvatarMicroScreen\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*overflow:\s*hidden;[^}]*border-radius:\s*inherit;/,
    );
    assert.doesNotMatch(pageCssSource, /botAvatarMicroTalkingGlow/);
    assert.match(
      pageCssSource,
      /\[data-variant="micro"\],\s*\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\] \*\s*\{[^}]*animation:\s*none !important;[^}]*transition:\s*none !important/,
    );
    assert.match(
      pageSource,
      /className=\{styles\.zenLiveBotPresenceBody\}[\s\S]{0,420}data-talking=\{isTalking \? "true" : undefined\}/,
      "full avatars must own the talking marker even when an applet wrapper does not",
    );
    assert.match(
      pageCssSource,
      /\.zenLiveBotPresenceBody\[data-talking="true"\] \.zenLiveBotPresenceFace\s*\{[^}]*--bot-face-ambient-glow-opacity:\s*0\.52/,
    );
  });

  it("passes explicit micro render sizes from runtime call sites", () => {
    const messageMoodFn = pageSource.slice(
      pageSource.indexOf("function MessageMoodFace("),
      pageSource.indexOf("function BotFoundryBatchSlotAvatar("),
    );
    const batchSlotFn = pageSource.slice(
      pageSource.indexOf("function BotFoundryBatchSlotAvatar("),
      pageSource.indexOf("const BotAvatarScreen ="),
    );
    assert.match(
      messageMoodFn,
      /renderSizePx=\{40\}/,
      "message header micro variants should pass an explicit render size",
    );
    assert.match(
      messageMoodFn,
      /glyph=\{<BotGlyph name=\{props\.glyph\} size=\{16\} \/>\}/,
    );
    assert.match(
      batchSlotFn,
      /renderSizePx=\{40\}/,
      "batch-foundry micro slots should pass an explicit render size",
    );
    assert.match(
      batchSlotFn,
      /glyph=\{<BotGlyph name=\{glyph\} size=\{16\} \/>\}/,
    );
  });
});
