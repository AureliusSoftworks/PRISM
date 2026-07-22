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

test("Zen, Coffee, and live Signal resolve each visible bot's SFX and live state", () => {
  const zenSource = sourceBefore(
    "scheduleKey={`zen-live-${bot?.id ?? \"prism\"}-${moodHint}`}",
  );
  assert.match(zenSource, /avatarSfx=\{botAvatarSfxForBot\(bot\)\}/);
  assert.match(zenSource, /showThinkingSpinner \|\| transitioning/);

  const coffeeSource = sourceBefore("scheduleKey={`coffee-live-${bot.id}`}");
  assert.match(coffeeSource, /avatarSfx=\{botAvatarSfxForBot\(bot\)\}/);
  assert.match(coffeeSource, /seatIsThinkingThisSeat/);

  const signalSource = sourceBefore(
    "scheduleKey={`botcast-${avatarState.role}-${botSummary.id}`}",
    3_000,
  );
  assert.match(
    signalSource,
    /avatarSfx=\{[\s\S]{0,80}avatarState\.sfxEnabled[\s\S]{0,180}botAvatarSfxForSignalMix\([\s\S]{0,120}botAvatarSfxForBot\(bot\)/u,
  );
  assert.match(signalSource, /avatarState\.talking/);
  assert.match(signalSource, /avatarState\.thinking/);
});

test("Signal keeps dashboard avatars quiet while preserving live-stage and alignment Persona SFX", () => {
  const botcastSource = readFileSync(
    new URL("./BotcastExperience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    botcastSource,
    /surface: "dashboard" \| "stage" \| "alignment";/u,
  );
  assert.match(
    botcastSource,
    /const renderedAvatar = renderAvatar\?\.\(bot, \{[\s\S]{0,180}surface: "stage"[\s\S]{0,220}sfxEnabled: signalAvatarSfxShouldPlay\(\{[\s\S]{0,180}introActive: episodePreRoll !== null,[\s\S]{0,180}episodeOutroSfxMutedId === args\.currentEpisode\.id[\s\S]{0,100}episodeOutro !== null/u,
  );
  assert.equal(
    botcastSource.match(/surface: "dashboard",/gu)?.length,
    2,
    "Every non-live Signal avatar surface should be marked as dashboard UI",
  );
  assert.match(
    botcastSource,
    /surface: "alignment",[\s\S]{0,140}sfxEnabled: sfxMixGain > 0,[\s\S]{0,80}sfxMixGain/u,
  );
  assert.match(botcastSource, /sessionAtmosphereBusVolume\(\{/u);
  assert.match(
    pageSource,
    /botAvatarSfxForSignalMix\([\s\S]{0,180}avatarState\.sfxMixGain,[\s\S]{0,100}avatarState\.surface === "alignment"/u,
  );
  assert.match(
    pageSource,
    /forcePreview[\s\S]{0,260}playWhileIdle: true,[\s\S]{0,80}playWhileTalking: true,[\s\S]{0,80}playWhileThinking: true/u,
  );

  const producerSource = sourceBefore(
    'scheduleKey="botcast-producer-prism"',
    3_000,
  );
  assert.match(
    producerSource,
    /avatarSfx=\{[\s\S]{0,80}avatarState\.sfxEnabled[\s\S]{0,180}botAvatarSfxForProfile\([\s\S]{0,360}: null/u,
  );
});
