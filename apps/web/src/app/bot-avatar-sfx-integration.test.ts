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

test("new bot paths attempt unique thinking loops while preserving the fallback", () => {
  const automaticGenerationCalls = pageSource.match(
    /generateBotThinkingSfxProfile\(/gu,
  );
  assert.ok(
    (automaticGenerationCalls?.length ?? 0) >= 4,
    "manual creation, generated drafts, Marketplace installs, and Marketplace updates should each request a loop",
  );
  assert.match(pageSource, /settings\.elevenLabsApiKeySource !== "none"/u);
  assert.match(pageSource, /a PRISM fallback is active/u);
  assert.match(pageSource, /generateThinkingSfx: true/u);
  assert.match(pageSource, /onThinkingSfxError:/u);
  assert.match(pageSource, /thinkingSfxGenerated/u);
});

test("Avatar Studio presents the built-in fallback without pretending it was uploaded", () => {
  assert.match(pageSource, /PRISM Computer Calculating/u);
  assert.match(pageSource, /Built-in fallback · no uploaded file · thinking only/u);
  assert.match(pageSource, /aria-label="Avatar sound mode"/u);
  assert.match(pageSource, />\s*Mute\s*<\/button>/u);
  assert.match(pageSource, /Use PRISM default avatar sound/u);
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
  assert.match(coffeeSource, /seatThinkingVisualActive/);

  const signalSource = sourceBefore(
    "scheduleKey={`botcast-${avatarState.role}-${botSummary.id}`}",
    3_000,
  );
  assert.match(
    signalSource,
    /avatarSfx=\{[\s\S]{0,80}avatarState\.sfxEnabled[\s\S]{0,180}botAvatarSfxForSignalMix\([\s\S]{0,120}botAvatarSfxForBot\(bot\)/u,
  );
  assert.match(
    signalSource,
    /replayVisual\?\.avatarSfx \?\?[\s\S]{0,60}botAvatarSfxForBot\(bot\)/u,
  );
  assert.match(signalSource, /avatarState\.talking/);
  assert.match(signalSource, /avatarState\.thinking/);
});

test("Signal keeps dashboard avatars quiet and respects Persona SFX triggers on stage", () => {
  const botcastSource = readFileSync(
    new URL("./BotcastExperience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    botcastSource,
    /surface: "dashboard" \| "stage" \| "alignment";/u,
  );
  const liveStageAvatarSource = botcastSource.slice(
    botcastSource.indexOf("const renderedAvatar = renderAvatar?.(bot, {"),
    botcastSource.indexOf(
      "if (renderedAvatar !== null",
      botcastSource.indexOf("const renderedAvatar = renderAvatar?.(bot, {"),
    ),
  );
  assert.match(liveStageAvatarSource, /surface: "stage"/u);
  assert.match(liveStageAvatarSource, /signalAvatarSfxShouldPlay\(\{/u);
  assert.match(
    liveStageAvatarSource,
    /introActive: episodePreRoll !== null/u,
  );
  assert.match(
    liveStageAvatarSource,
    /episodeOutroSfxMutedId === args\.currentEpisode\.id/u,
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
    /botAvatarSfxForSignalMix\([\s\S]{0,180}avatarState\.sfxMixGain/u,
  );
  const signalMixSource = pageSource.slice(
    pageSource.indexOf("function botAvatarSfxForSignalMix"),
    pageSource.indexOf("function marketplacePreviewBotFromArchive"),
  );
  assert.doesNotMatch(signalMixSource, /forcePreview/u);
  assert.doesNotMatch(signalMixSource, /playWhileIdle: true/u);
  assert.doesNotMatch(signalMixSource, /playWhileTalking: true/u);
  assert.doesNotMatch(signalMixSource, /playWhileThinking: true/u);

  const producerSource = sourceBefore(
    'scheduleKey="botcast-producer-prism"',
    3_000,
  );
  assert.match(
    producerSource,
    /avatarSfx=\{[\s\S]{0,80}avatarState\.sfxEnabled[\s\S]{0,180}botAvatarSfxForProfile\([\s\S]{0,360}: null/u,
  );
});
