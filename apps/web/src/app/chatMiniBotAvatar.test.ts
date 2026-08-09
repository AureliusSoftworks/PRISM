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

describe("chatMiniBotAvatar", () => {
  it("switches between canonical dark and light chassis rasters", () => {
    assert.match(componentSource, /\/bot-frame\/bot-frame-base\.png/);
    assert.match(componentSource, /\/bot-frame\/bot-frame-light-base\.png/);
    assert.ok(
      readFileSync(join(publicDir, "bot-frame/bot-frame-base.png")).length > 0,
    );
    assert.ok(
      readFileSync(join(publicDir, "bot-frame/bot-frame-light-base.png"))
        .length > 0,
    );
    assert.match(componentSource, /theme\?: "light" \| "dark"/);
    assert.match(componentSource, /theme === "light"/);
    assert.match(componentSource, /data-theme=\{theme\}/);
    assert.match(pageSource, /theme=\{resolvedTheme\}/);
    assert.doesNotMatch(componentSource, /avatar-small-off\.png/);
    assert.doesNotMatch(componentSource, /avatar-small-on\.png/);
    assert.doesNotMatch(componentSource, /magentaTintedRasterUrl/);
  });

  it("adds the communication-style alloy while remaining non-emissive", () => {
    assert.match(cssSource, /\.frameBase/);
    assert.match(cssSource, /\.frameAlloy/);
    assert.match(cssSource, /bot-frame-metal-mask\.png/);
    assert.match(cssSource, /mix-blend-mode:\s*color/);
    assert.match(componentSource, /alloyColor\?: string \| null/);
    assert.match(componentSource, /--chat-mini-bot-alloy-color/);
    assert.match(pageSource, /botFrameMetalAlloyColor\(voicePreset/);
    assert.match(pageSource, /alloyColor=\{alloyColor\}/);
    assert.match(cssSource, /\.upperScreen/);
    assert.match(cssSource, /\.lowerScreen/);
    assert.match(
      cssSource,
      /\.upperScreen\s*\{[^}]*height:\s*calc\(48\.4% \+ 8px\)/,
    );
    assert.match(cssSource, /\.sizeHero/);
    assert.match(
      cssSource,
      /\.sizeHero\s*\{[^}]*--chat-mini-bot-glyph-size:\s*clamp\(19px, 1\.8vw, 23px\)/,
    );
    assert.match(cssSource, /\.sizeBadge/);
    assert.doesNotMatch(cssSource, /\.frameOff|\.frameOn/);
    assert.doesNotMatch(componentSource, /data-talking/);
    assert.doesNotMatch(componentSource, /data-tint-ready/);
    assert.match(componentSource, /size\?: "badge" \| "hero"/);
    assert.match(cssSource, /\.root\[data-size="hero"\]::before/);
    assert.match(cssSource, /\.root\[data-size="hero"\]::after/);
    assert.match(cssSource, /width: clamp\(132px, 11vw, 154px\)/);
    assert.match(cssSource, /width: 116px/);
  });

  it("mounts the mini avatar in the empty Chat/Zen selected-bot hero", () => {
    assert.match(pageSource, /function EmptyStateHeroMiniBot\(/);
    assert.match(
      pageSource,
      /<EmptyStateHeroMiniBot\s+bot=\{bot\}\s+resolvedTheme=\{resolvedTheme\}\s*\/>/,
    );
    assert.match(pageSource, /size="hero"/);
    assert.match(pageSource, /SELECT THE BOT TO START THE CHAT/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniBot\b/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniFace\b/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniFaceRig\b/);
    assert.match(pageCssSource, /\.emptyStateHeroMiniGlyph\b/);
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.coffeeSeatPlateEmoji\} \$\{styles\.emptyStateHeroMiniFace\}`\}/,
    );
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
      /\.emptyStateHeroMiniArt\s*\{[^}]*--avatar-details-ink-aperture-scale:\s*1\.5/,
    );
    assert.match(
      pageCssSource,
      /\.emptyStateHeroMiniArt\s*\{[^}]*--avatar-details-offset-x:\s*1px[^}]*--avatar-details-offset-y:\s*7px/,
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
      pageSource.indexOf("// PRISM fallback for non-private Default"),
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
