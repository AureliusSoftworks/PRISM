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
      /\.lowerScreenContent\s*\{[\s\S]*?transform:\s*translate\([\s\S]*?\)\s*scaleX\(var\(--chat-mini-bot-lower-screen-facing-scale-x, 1\)\)/,
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
    assert.doesNotMatch(componentSource, /directionIndependentFace|props\.thinking/);
    assert.match(
      pageSource,
      /\[avatarFacing, setAvatarFacing\] = useState<ZenLiveAvatarFacing>\(\s*zenLiveBotFacingForCanvasSide\(avatarCanvasSide\)/,
    );
    assert.match(pageSource, /<EmptyStateHeroMiniBot[\s\S]{0,900}?facing=\{avatarFacing\}/);
    assert.match(pageSource, /<ZenLiveBotMannequin[\s\S]{0,240}?facing=\{avatarFacing\}/);
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
      /\.emptyStateHeroMiniGlyph\s*\{[^}]*width:\s*calc\([^}]*var\(--chat-mini-bot-glyph-size[^}]*height:\s*calc\([^}]*var\(--chat-mini-bot-glyph-size/,
    );
    assert.match(
      cssSource,
      /\.root\s*\{[^}]*--chat-mini-bot-lower-screen-nudge-x:\s*1px[^}]*--chat-mini-bot-lower-screen-nudge-y:\s*0px/,
    );
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniArt\s*\{[^}]*transform:\s*translateY\(-2px\)/,
    );
    assert.match(
      cssSource,
      /\.lowerScreenContent\s*\{[^}]*transform:\s*translate\([^}]*--chat-mini-bot-lower-screen-nudge-x[^}]*--chat-mini-bot-lower-screen-nudge-y[^}]*\)\s*scaleX\(var\(--chat-mini-bot-lower-screen-facing-scale-x, 1\)\)/,
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

  it("keeps alloy identity while removing compact glow, phosphor, and breathing", () => {
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
    assert.doesNotMatch(componentSource, /talking\?: boolean|data-talking|talkingGlow/);
    assert.doesNotMatch(cssSource, /talkingGlow|data-talking/);
    assert.doesNotMatch(componentSource, /data-tint-ready/);
    assert.match(componentSource, /size\?: "badge" \| "room" \| "hero"/);
    assert.match(componentSource, /renderSize\?: number/);
    assert.match(componentSource, /clampChatMiniBotAvatarRenderSize/);
    assert.match(componentSource, /data-render-size=\{renderSize \?\? undefined\}/);
    assert.match(
      cssSource,
      /width:\s*var\(--chat-mini-bot-render-size\)[^}]*height:\s*var\(--chat-mini-bot-render-size\)/,
    );
    assert.doesNotMatch(componentSource, /lightMode|frameLight/);
    assert.doesNotMatch(cssSource, /frameLight|data-light-mode|Breath|Ignite/);
    assert.doesNotMatch(cssSource, /\.root\[data-size="hero"\]::before/);
    assert.match(cssSource, /\.root\[data-size="hero"\]::after/);
    assert.match(
      cssSource,
      /--chat-mini-bot-render-size:\s*clamp\(160px, 12\.5vw, 184px\)/,
    );
    assert.match(cssSource, /--chat-mini-bot-render-size:\s*140px/);
    assert.doesNotMatch(cssSource, /bot-frame-tint-mask|bot-frame-led/);
    assert.doesNotMatch(cssSource, /chat-mini-buckle-crt|repeating-linear-gradient/);
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
      /<EmptyStateHeroMiniBot\s+bot=\{bot\}\s+resolvedTheme=\{resolvedTheme\}\s+leadershipGroupCount=\{leadershipGroupCount\}\s*\/>/,
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
      assert.match(miniFaceCall, /\bhardPixels\b/);
      assert.match(miniFaceCall, /motionMode="mini-led"/);
      assert.doesNotMatch(miniFaceCall, /showThinkingSpinner|showQuestionMark/);
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
      /\.emptyStateHeroMiniGlyph\s*\{[^}]*width:\s*calc\([^}]*var\(--chat-mini-bot-glyph-size[^}]*height:\s*calc\([^}]*var\(--chat-mini-bot-glyph-size/,
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

  it("keeps mini Ink static and visible across non-face runtime states", () => {
    assert.doesNotMatch(componentSource, /thinking: boolean|props\.thinking/);
    assert.match(componentSource, /behindFace\?: ReactNode/);
    assert.match(componentSource, /aboveFace\?: ReactNode/);
    assert.match(componentSource, /\{props\.behindFace\}/);
    assert.match(componentSource, /\{props\.aboveFace\}/);
    assert.match(pageSource, /talking=\{false\}/);
    assert.match(pageSource, /speechMotionActive=\{false\}/);
    assert.match(
      pageSource,
      /behindFace=\{renderAvatarDetailsInk\("behind-face"\)\}/,
    );
    assert.match(
      pageSource,
      /aboveFace=\{renderAvatarDetailsInk\("above-face"\)\}/,
    );
    assert.match(pageSource, /\{renderMiniAvatarDetailsInk\("behind-face"\)\}/);
    assert.match(pageSource, /\{renderMiniAvatarDetailsInk\("above-face"\)\}/);
    assert.match(pageSource, /\{renderGalleryAvatarDetails\("behind-face"\)\}/);
    assert.match(pageSource, /\{renderGalleryAvatarDetails\("above-face"\)\}/);
  });

  it("uses one correctly oriented static micro renderer with flat pixels and Ink", () => {
    assert.match(pageSource, /function BotAvatarMicroRenderer\(/);
    const microFaceFn = pageSource.slice(
      pageSource.indexOf("function BotAvatarMicroRenderer("),
      pageSource.indexOf("function MessageMoodFace("),
    );
    assert.match(microFaceFn, /<BotAvatarMicro/);
    assert.match(microFaceFn, /avatarDetails=\{props\.avatarDetails\}/);
    assert.match(microFaceFn, /renderSizePx=\{props\.renderSizePx\}/);
    assert.match(microFaceFn, /scheduleKey=\{props\.scheduleKey\}/);
    assert.match(microComponentSource, /avatarDetails\?: BotAvatarDetailsV1 \| null/);
    assert.match(microComponentSource, /<AvatarDetailsMask/);
    assert.match(microComponentSource, /detailLevel="audience"/);
    assert.match(microComponentSource, /coreColor="ink"/);
    assert.match(
      microComponentSource,
      /color=\{BOT_AVATAR_MICRO_PHOSPHOR_COLOR\}/,
      "Micro Ink must remain white phosphor instead of borrowing the orb accent",
    );
    assert.match(
      microComponentSource,
      /--bot-avatar-micro-face-phosphor-color[\s\S]{0,100}BOT_AVATAR_MICRO_PHOSPHOR_COLOR/,
      "Micro face glyphs must share the white-only phosphor contract",
    );
    assert.match(
      microComponentSource,
      /`\$\{styles\.messageMoodCoffeeFace\} \$\{styles\.messageMoodMicroFace\}`/,
    );
    assert.match(microComponentSource, /faceEyeMovement="still"/);
    assert.match(microComponentSource, /showQuestionMark=\{false\}/);
    assert.match(microComponentSource, /motionMode="static"/);
    assert.match(microComponentSource, /enabled=\{false\}/);
    assert.match(microComponentSource, /hardPixels/);
    assert.match(microComponentSource, /forceBlinkPhase="open"/);
    assert.match(microComponentSource, /coffeeSeatPlateGlyph\([\s\S]*?"closed"/);
    assert.match(microComponentSource, /talking=\{false\}/);
    assert.match(microComponentSource, /mouthShape="closed"/);
    assert.match(
      microComponentSource,
      /\["--coffee-plate-emoji-face-scale-y" as string\]:\s*BOT_AVATAR_CANONICAL_FACE_SCALE_Y/,
    );
    assert.match(microComponentSource, /data-avatar-render-tier="micro"/);
    assert.match(
      microComponentSource,
      /props\.renderSizePx! <= BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX/,
    );
    assert.match(
      microComponentSource,
      /data-avatar-micro-presentation=\{glyphOnly \? "glyph" : "face"\}/,
    );
    assert.match(
      microComponentSource,
      /glyphOnly \? \(\s*<span className=\{styles\.botAvatarMicroGlyph\}>\{props\.glyph\}<\/span>/,
      "40px Micro avatars should replace face and Ink with the identity glyph",
    );
    assert.match(microComponentSource, /data-bot-avatar-micro-screen="true"/);
    assert.match(microComponentSource, /styles\.botAvatarMicroScreenContent/);
    assert.match(microComponentSource, /styles\.botAvatarMicroFaceRig/);
    assert.doesNotMatch(microComponentSource, /data-talking|botAvatarMicroTalkingGlow/);
    assert.match(pageCssSource, /\[data-variant="micro"\]/);
    assert.match(
      pageCssSource,
      /\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[^}]*border:\s*1px solid/,
    );
    assert.match(pageCssSource, /\.messageMoodMicroFace\s*\{[^}]*font-size:\s*12px/);
    assert.match(
      pageCssSource,
      /\.messageMoodMicroFace\s*\{[^}]*color:\s*var\(--bot-avatar-micro-face-phosphor-color, #ffffff\)/,
    );
    assert.match(
      pageCssSource,
      /\.themeLight \.messageMoodMicroFace\s*\{[^}]*color:\s*var\(--bot-avatar-micro-face-phosphor-color, #ffffff\)/,
    );
    assert.match(pageCssSource, /\.botAvatarMicroInk\s*\{[^}]*position:\s*absolute/);
    assert.match(
      pageCssSource,
      /\.botAvatarMicroGlyph\s*\{[^}]*place-items:\s*center;[^}]*color:\s*var\(--bot-avatar-micro-face-phosphor-color, #ffffff\)/,
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
      pageCssSource,
      /\.messageMoodMicroFace \[data-crt-glyph-layer="true"\]::before\s*\{[^}]*display:\s*none/,
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
    assert.match(messageMoodFn, /glyph=\{<BotGlyph name=\{props\.glyph\} size=\{16\} \/>\}/);
    assert.match(
      batchSlotFn,
      /renderSizePx=\{40\}/,
      "batch-foundry micro slots should pass an explicit render size",
    );
    assert.match(batchSlotFn, /glyph=\{<BotGlyph name=\{glyph\} size=\{16\} \/>\}/);
  });
});
