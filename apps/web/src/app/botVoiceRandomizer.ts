import {
  BOT_AUDIO_VOICE_IDS,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type EnglishVoiceEngine,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";

function choose<T>(values: readonly T[], random: () => number): T {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))]!;
}

function randomControl(random: () => number): number {
  return Number((Math.round((random() * 1.4 - 0.7) * 20) / 20).toFixed(2));
}

export function randomizeBotAudioVoiceProfile(
  profile: BotAudioVoiceProfileV1,
  engine: EnglishVoiceEngine,
  availableVoiceIds: readonly string[],
  random: () => number = Math.random
): NormalizedBotAudioVoiceProfileV1 {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  const identity = availableVoiceIds.length > 0 ? choose(availableVoiceIds, random) : null;
  return normalizeBotAudioVoiceProfileV1({
    ...normalized,
    enabled: true,
    baseVoiceId: choose(BOT_AUDIO_VOICE_IDS, random),
    pitch: randomControl(random),
    lilt: randomControl(random),
    bottishTone: randomControl(random),
    texture: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1.texture,
    ...(engine === "builtin"
      ? { systemVoiceName: identity }
      : { elevenLabsVoiceId: identity }),
  });
}

export function fillMissingBotAudioVoiceIdentities(
  profile: BotAudioVoiceProfileV1,
  systemVoiceNames: readonly string[],
  elevenLabsVoiceIds: readonly string[],
  random: () => number = Math.random
): NormalizedBotAudioVoiceProfileV1 {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return normalizeBotAudioVoiceProfileV1({
    ...normalized,
    ...(!normalized.systemVoiceName && systemVoiceNames.length > 0
      ? { systemVoiceName: choose(systemVoiceNames, random) }
      : {}),
    ...(!normalized.elevenLabsVoiceId && elevenLabsVoiceIds.length > 0
      ? { elevenLabsVoiceId: choose(elevenLabsVoiceIds, random) }
      : {}),
  });
}
