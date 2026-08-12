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
      /\.upperScreenContent\s*\{[\s\S]*?transform:\s*scaleX\(var\(--chat-mini-bot-upper-screen-facing-scale-x, 1\)\)/,
    );
    assert.match(
      cssSource,
      /\.lowerScreenContent\s*\{[\s\S]*?transform:\s*scaleX\(var\(--chat-mini-bot-lower-screen-facing-scale-x, 1\)\)/,
    );
    assert.match(
      componentSource,
      /\["--avatar-details-facing-scale-x" as string\]: "1"/,
      "the outer mini rig must be the only horizontal mirror for custom Ink",
    );
    assert.match(
      componentSource,
      /\["--chat-mini-bot-upper-screen-facing-scale-x" as string\]:\s*directionIndependentFace \? "1" : screenFacingScaleX/,
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
    assert.match(
      pageSource,
      /directionIndependentFace=\{\s*miniThinkingSpinnerActive \|\| showQuestionMark\s*\}/,
    );
    assert.match(
      componentSource,
      /const directionIndependentFace =\s*props\.thinking \|\| props\.directionIndependentFace === true/,
    );
    assert.match(
      componentSource,
      /directionIndependentFace \? "1" : screenFacingScaleX/,
    );
    assert.match(
      pageSource,
      /const avatarFacing = zenLiveBotFacingForCanvasSide\(avatarCanvasSide\)/,
    );
    assert.match(pageSource, /<EmptyStateHeroMiniBot[\s\S]{0,900}?facing=\{avatarFacing\}/);
    assert.match(pageSource, /<ZenLiveBotMannequin[\s\S]{0,240}?facing=\{avatarFacing\}/);
    assert.match(
      pageSource,
      /facing=\{ambientFacing \?\? BOT_AVATAR_CANONICAL_FACING\}/,
    );
    assert.doesNotMatch(componentSource, /key=\{?facing/);
    assert.doesNotMatch(pageSource, /key=\{[^}]*avatarFacing/);
  });

  it("keeps every mini buckle glyph two pixels inside its nominal size", () => {
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniGlyph\s*\{[^}]*width:\s*calc\([^}]*--chat-mini-bot-glyph-size[^}]*- 2px[^}]*height:\s*calc\([^}]*--chat-mini-bot-glyph-size[^}]*- 2px/,
    );
  });

  it("switches between dedicated low-resolution dark and light pixel chassis", () => {
    assert.match(componentSource, /\/bot-frame\/bot-frame-mini-dark\.png/);
    assert.match(componentSource, /\/bot-frame\/bot-frame-mini-light\.png/);
    assert.doesNotMatch(componentSource, /\/bot-frame\/bot-frame-base\.png/);
    assert.doesNotMatch(
      componentSource,
      /\/bot-frame\/bot-frame-light-base\.png/,
    );
    const darkMini = pngHeader("bot-frame-mini-dark.png");
    const lightMini = pngHeader("bot-frame-mini-light.png");
    const darkCanonical = pngHeader("bot-frame-base.png");
    const lightCanonical = pngHeader("bot-frame-light-base.png");
    assert.deepEqual(
      { width: darkMini.width, height: darkMini.height, colorType: darkMini.colorType },
      { width: 96, height: 96, colorType: 6 },
    );
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

  it("adds the communication-style alloy and keeps illumination opt-in", () => {
    assert.match(cssSource, /\.frameBase/);
    assert.match(cssSource, /\.frameAlloy/);
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
    assert.match(
      cssSource,
      /\.upperScreen\s*\{[^}]*z-index:\s*7/,
    );
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
    assert.doesNotMatch(componentSource, /data-talking/);
    assert.doesNotMatch(componentSource, /data-tint-ready/);
    assert.match(componentSource, /size\?: "badge" \| "room" \| "hero"/);
    assert.match(componentSource, /lightMode\?: "off" \| "breathing"/);
    assert.match(componentSource, /const lightMode = props\.lightMode \?\? "off"/);
    assert.match(componentSource, /data-light-mode=\{lightMode\}/);
    assert.match(componentSource, /lightMode === "breathing"/);
    assert.match(componentSource, /styles\.frameLightAura/);
    assert.match(componentSource, /styles\.frameLightEmitter/);
    assert.match(componentSource, /styles\.frameLightCore/);
    assert.match(cssSource, /\.root\[data-size="hero"\]::before/);
    assert.match(cssSource, /\.root\[data-size="hero"\]::after/);
    assert.match(cssSource, /width: clamp\(160px, 12\.5vw, 184px\)/);
    assert.match(cssSource, /width: 140px/);
    assert.match(cssSource, /bot-frame-tint-mask\.png\?v=1000/);
    assert.match(cssSource, /bot-frame-led\.png\?v=1000/);
    assert.match(
      cssSource,
      /\.root\[data-light-mode="breathing"\] \.frameLightAura/,
    );
    assert.match(cssSource, /chatMiniBotLightAuraBreath 6\.4s/);
    assert.match(cssSource, /chatMiniBotLightEmitterBreath 6\.4s/);
    assert.match(cssSource, /chatMiniBotLightCoreBreath 6\.4s/);
    assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(
      cssSource,
      /\.root:is\(\[data-size="hero"\], \[data-size="room"\]\) \.lowerScreen::before/,
    );
    assert.match(cssSource, /--chat-mini-buckle-crt-cell-pitch:\s*2px/);
    assert.match(cssSource, /--chat-mini-buckle-crt-cell-pitch:\s*1\.5px/);
    assert.match(cssSource, /repeating-linear-gradient\(\s*90deg/);
    assert.match(cssSource, /repeating-linear-gradient\(\s*0deg/);
    assert.match(cssSource, /\.lowerScreen\s*\{[^}]*overflow:\s*hidden/);
    assert.doesNotMatch(
      cssSource,
      /\.root\[data-size="badge"\][^{]*\.lowerScreen::before/,
    );
  });

  it("mounts the mini avatar in the empty Chat/Zen selected-bot hero", () => {
    assert.match(pageSource, /function EmptyStateHeroMiniBot\(/);
    assert.match(
      pageSource,
      /<EmptyStateHeroMiniBot\s+bot=\{bot\}\s+resolvedTheme=\{resolvedTheme\}\s*\/>/,
    );
    assert.match(pageSource, /size = "hero"/);
    assert.match(pageSource, /<ChatMiniBotAvatar\s+size=\{size\}/);
    assert.match(
      pageSource,
      /lightMode=\{lightMode \?\? \(size === "hero" \? "breathing" : "off"\)\}/,
    );
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
      3,
      "Chat/Zen, Debate, and Avatar Studio mini portraits must share Avatar Studio's face paint-box geometry",
    );
    const miniFaceCalls = [
      ...pageSource.matchAll(
        /<CoffeeSeatPlateEmoji(?:(?!<CoffeeSeatPlateEmoji)[\s\S])*?className=\{`\$\{styles\.coffeeSeatPlateEmoji\} \$\{styles\.emptyStateHeroMiniFace\}`\}(?:(?!<CoffeeSeatPlateEmoji)[\s\S])*?\/>/g,
      ),
    ];
    assert.equal(miniFaceCalls.length, 3);
    for (const [miniFaceCall] of miniFaceCalls) {
      assert.match(
        miniFaceCall,
        /faceEyeMovement="still"/,
        "mini faces must keep their authored geometry stationary inside the small CRT aperture",
      );
      assert.doesNotMatch(
        miniFaceCall,
        /faceEyeMovement=\{/,
        "mini faces must not inherit a bot's full-size eye-movement animation",
      );
      assert.match(
        miniFaceCall,
        /\bpixelated\b/,
        "mini faces use pixel glyphs as part of the chassis charm",
      );
      assert.doesNotMatch(miniFaceCall, /zenLiveBotPresenceFaceGlyph/);
    }
    assert.match(pageSource, /miniAvatarBinaryMouthShape/);
    assert.match(pageSource, /style=\{miniFaceRegistrationStyle\}/);
    assert.match(pageSource, /BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE/);
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace\s*\{[^}]*display:\s*inline-grid/,
    );
    assert.match(
      pageCssSource,
      /\.coffeeSeatPlateEmoji\.emptyStateHeroMiniFace\s*\{[^}]*color:\s*var\(--chat-mini-bot-color, var\(--accent\)\)/,
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
      /\.emptyStateHeroMiniGlyph\s*\{[^}]*width:\s*calc\([^}]*--chat-mini-bot-glyph-size[^}]*- 2px[^}]*height:\s*calc\([^}]*--chat-mini-bot-glyph-size[^}]*- 2px/,
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
    assert.match(pageSource, /coreColor="ink"/);
    assert.match(pageSource, /color=\{normalizedBotColor\}/);
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

  it("supports suppressing behind/above art slots while thinking", () => {
    assert.match(componentSource, /thinking: boolean/);
    assert.match(componentSource, /behindFace\?: ReactNode/);
    assert.match(componentSource, /aboveFace\?: ReactNode/);
    assert.match(
      componentSource,
      /props\.thinking \? null : props\.behindFace/,
    );
    assert.match(componentSource, /props\.thinking \? null : props\.aboveFace/);
    assert.match(pageSource, /thinking=\{miniThinkingSpinnerActive\}/);
    assert.match(pageSource, /thinking=\{previewThinkingSpinnerActive\}/);
    assert.match(pageSource, /thinking=\{false\}/);
    assert.match(
      pageSource,
      /behindFace=\{renderAvatarDetailsInk\("behind-face"\)\}/,
    );
    assert.match(
      pageSource,
      /aboveFace=\{renderAvatarDetailsInk\("above-face"\)\}/,
    );
    assert.match(
      pageSource,
      /behindFace=\{renderMiniAvatarDetailsInk\("behind-face"\)\}/,
    );
    assert.match(
      pageSource,
      /aboveFace=\{renderMiniAvatarDetailsInk\("above-face"\)\}/,
    );
    assert.match(
      pageSource,
      /behindFace=\{renderGalleryAvatarDetails\("behind-face"\)\}/,
    );
    assert.match(
      pageSource,
      /aboveFace=\{renderGalleryAvatarDetails\("above-face"\)\}/,
    );
  });

  it("keeps micro message avatars to an upright orb, eyes, and mouth", () => {
    assert.match(pageSource, /variant="micro"/);
    assert.match(pageSource, /function MessageMoodFace\(/);
    const microFaceFn = pageSource.slice(
      pageSource.indexOf("function MessageMoodFace("),
      pageSource.indexOf("function neutralRowColor("),
    );
    assert.doesNotMatch(microFaceFn, /ChatMiniBotAvatar|AvatarDetailsMask/);
    assert.doesNotMatch(microFaceFn, /glyph\?:|avatarDetails\?:/);
    assert.match(
      microFaceFn,
      /`\$\{styles\.messageMoodCoffeeFace\} \$\{styles\.messageMoodMicroFace\}`/,
    );
    assert.match(
      microFaceFn,
      /faceEyeMovement=\{showMicroFace \? "still" : undefined\}/,
    );
    assert.match(
      microFaceFn,
      /faceThinkingFrames=\{showMicroFace \? undefined : props\.faceStyle\?\.thinkingFrames\}/,
    );
    assert.match(
      microFaceFn,
      /faceThinkingScale=\{showMicroFace \? undefined : props\.faceStyle\?\.thinkingScale\}/,
    );
    assert.match(
      microFaceFn,
      /faceThinkingOffsetX=\{showMicroFace \? undefined : props\.faceStyle\?\.thinkingOffsetX\}/,
    );
    assert.match(
      microFaceFn,
      /faceThinkingOffsetY=\{showMicroFace \? undefined : props\.faceStyle\?\.thinkingOffsetY\}/,
    );
    assert.match(
      microFaceFn,
      /forceBlinkPhase=\{showMicroFace \? props\.forceBlinkPhase : undefined\}/,
    );
    assert.match(microFaceFn, /showQuestionMark=\{showMicroFace \? false : questionMarkActive\}/);
    assert.match(microFaceFn, /data-avatar-render-tier=\{showMicroFace \? "micro" : undefined\}/);
    assert.match(pageCssSource, /\[data-variant="micro"\]/);
    assert.match(
      pageCssSource,
      /\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[^}]*border:\s*1px solid/,
    );
    assert.match(pageCssSource, /\.messageMoodMicroFace\s*\{[^}]*font-size:\s*8\.5px/);
  });
});
