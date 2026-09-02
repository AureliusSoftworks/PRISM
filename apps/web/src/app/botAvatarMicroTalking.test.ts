import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(here, "BotAvatarMicro.tsx"), "utf8");
const pageSource = readFileSync(join(here, "page.tsx"), "utf8");
const cssSource = readFileSync(join(here, "page.module.css"), "utf8");

test("Micro speech treatment uses normalized identity colors in light and dark", () => {
  assert.match(componentSource, /talking\?: boolean/u);
  assert.match(
    componentSource,
    /data-talking=\{props\.talking === true \? "true" : undefined\}/u,
  );
  assert.match(
    componentSource,
    /--bot-avatar-micro-identity-color-dark[\s\S]{0,180}identityColorDark/u,
  );
  assert.match(
    componentSource,
    /--bot-avatar-micro-identity-color-light[\s\S]{0,180}identityColorLight/u,
  );
  assert.match(
    cssSource,
    /\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[\s\S]{0,320}--bot-avatar-micro-identity-color-dark[\s\S]{0,440}border:\s*1px solid var\(--bot-avatar-micro-identity-color\)/u,
  );
  assert.match(
    cssSource,
    /\.themeLight\s+\.messageMoodBadge\[data-face="coffee"\]\[data-variant="micro"\]\s*\{[\s\S]{0,220}--bot-avatar-micro-identity-color-light[\s\S]{0,700}border-color:\s*var\(--bot-avatar-micro-identity-color\)/u,
  );
  assert.match(
    cssSource,
    /--bot-avatar-micro-talking-color:\s*color-mix\([\s\S]{0,160}#ffffff 34%/u,
  );
});

test("talking treatment follows the Micro, Atomic, and pixel LOD contract", () => {
  assert.match(
    cssSource,
    /data-talking="true"\]\[data-avatar-micro-presentation="glyph"\][^{]*\{\s*animation:\s*botAvatarMicroTalkingRing/u,
  );
  assert.match(
    cssSource,
    /data-avatar-micro-presentation="atomic"\][\s\S]{0,100}\.botAvatarMicroGlyph\s*\{\s*animation:\s*botAvatarAtomicTalkingGlyph/u,
  );
  assert.match(
    cssSource,
    /data-talking="true"\]:is\([\s\S]{0,180}data-avatar-micro-presentation="block"[\s\S]{0,180}data-avatar-micro-presentation="pixel"[\s\S]{0,180}botAvatarPixelTalkingIdentity/u,
  );
  assert.match(
    cssSource,
    /@keyframes botAvatarAtomicTalkingGlyph[\s\S]{0,180}opacity:\s*0\.78/u,
  );
  assert.match(
    cssSource,
    /@keyframes botAvatarPixelTalkingIdentity[\s\S]{0,300}--bot-avatar-micro-talking-color/u,
  );
  assert.match(
    cssSource,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,1500}animation:\s*none !important[\s\S]{0,1500}--bot-avatar-micro-talking-color/u,
  );
});

test("live Micro consumers forward their real talking state", () => {
  assert.match(
    pageSource,
    /function BotAvatarMicroRenderer[\s\S]{0,700}talking=\{props\.talking\}/u,
  );
  assert.match(
    pageSource,
    /const BotGroupWaitingRoomPresenceAvatar[\s\S]{0,1800}<BotAvatarMicro[\s\S]{0,260}talking=\{talking\}/u,
  );
  assert.match(
    pageSource,
    /if \(microFallbackActive\)[\s\S]{0,800}<BotAvatarMicroRenderer[\s\S]{0,280}talking=\{isTalking\}/u,
  );
  assert.match(
    pageSource,
    /avatarRenderMode === "micro"[\s\S]{0,1000}<BotAvatarMicroRenderer[\s\S]{0,500}talking=\{handlingVisualEmissionActive\}/u,
  );
  assert.match(
    pageSource,
    /compactPreviewIsMicro[\s\S]{0,500}<BotAvatarMicroRenderer[\s\S]{0,260}talking=\{previewTalking\}/u,
  );
});
