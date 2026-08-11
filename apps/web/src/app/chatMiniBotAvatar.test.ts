import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
      /lightMode=\{size === "hero" \? "breathing" : "off"\}/,
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
    assert.match(pageSource, /BOT_AVATAR_FACE_GLYPH_FRAME_RATIO/);
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
      /renderAvatarDetailsInk\("behind-face"\)[\s\S]*?<CoffeeSeatPlateEmoji[\s\S]*?renderAvatarDetailsInk\("above-face"\)/,
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

  it("keeps classic Chat message mood badges as coffee faces, not mini chassis", () => {
    assert.match(pageSource, /variant="mini"/);
    assert.match(pageSource, /function MessageMoodFace\(/);
    // Mood badge still exists, but ChatMiniBotAvatar is no longer nested inside it.
    const moodFaceFn = pageSource.slice(
      pageSource.indexOf("function MessageMoodFace("),
      pageSource.indexOf("function neutralRowColor("),
    );
    assert.doesNotMatch(moodFaceFn, /ChatMiniBotAvatar/);
    assert.match(moodFaceFn, /messageMoodMiniFace|messageMoodCoffeeFace/);
    assert.match(pageCssSource, /\[data-variant="mini"\]/);
    assert.match(
      pageCssSource,
      /\.messageMoodBadge\[data-face="coffee"\]\[data-variant="mini"\]\s*\{[^}]*border:\s*1px solid/,
    );
  });
});
