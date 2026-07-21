import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function sourceBefore(marker: string, length = 2_200): string {
  const markerIndex = pageSource.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing source marker: ${marker}`);
  return pageSource.slice(Math.max(0, markerIndex - length), markerIndex);
}

test("the shared full-avatar renderer owns the looping SFX lifecycle", () => {
  assert.match(pageSource, /syncBotAvatarSfxAudio\(/);
  assert.match(pageSource, /stopBotAvatarSfxAudio\(/);
  assert.match(pageSource, /data-bot-avatar-sfx-runtime="true"/);
});

test("Avatar Studio drives SFX from its idle, blink, talking, and thinking preview", () => {
  const previewSource = sourceBefore(
    "scheduleKey={`${scheduleKey}-${previewMode}-${previewMood}`}",
  );
  assert.match(previewSource, /avatarSfx=\{avatarSfx\}/);
  assert.match(previewSource, /avatarSfxState=\{previewMode\}/);
});

test("Zen, Coffee, and Signal resolve each visible bot's SFX and live state", () => {
  const zenSource = sourceBefore(
    "scheduleKey={`zen-live-${bot?.id ?? \"prism\"}-${moodHint}`}",
  );
  assert.match(zenSource, /avatarSfx=\{botAvatarSfxForBot\(bot\)\}/);
  assert.match(zenSource, /showThinkingSpinner \|\| transitioning/);

  const coffeeSource = sourceBefore("scheduleKey={`coffee-live-${bot.id}`}");
  assert.match(coffeeSource, /avatarSfx=\{botAvatarSfxForBot\(bot\)\}/);
  assert.match(coffeeSource, /seatIsThinkingThisSeat/);

  const signalSource = sourceBefore(
    "scheduleKey={`botcast-${avatarState.role}-${bot.id}`}",
  );
  assert.match(signalSource, /avatarSfx=\{botAvatarSfxForBot\(bot\)\}/);
  assert.match(signalSource, /avatarState\.talking/);
  assert.match(signalSource, /avatarState\.thinking/);
});
