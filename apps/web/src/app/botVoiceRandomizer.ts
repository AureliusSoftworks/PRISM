import {
  BOT_AUDIO_VOICE_IDS,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  isBotAudioVoiceId,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type EnglishVoiceEngine,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  BUILTIN_VOICE_SELECTION_PREFIX,
  OPERATING_SYSTEM_VOICE_SELECTION_PREFIX,
} from "./offlineVoiceSelection.ts";

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
  const selectedBuiltinVoiceId = identity?.startsWith(
    BUILTIN_VOICE_SELECTION_PREFIX,
  )
    ? identity.slice(BUILTIN_VOICE_SELECTION_PREFIX.length)
    : null;
  const selectedSystemVoiceName = identity?.startsWith(
    OPERATING_SYSTEM_VOICE_SELECTION_PREFIX,
  )
    ? identity.slice(OPERATING_SYSTEM_VOICE_SELECTION_PREFIX.length)
    : engine === "builtin" && identity && !selectedBuiltinVoiceId
      ? identity
      : null;
  return normalizeBotAudioVoiceProfileV1({
    ...normalized,
    enabled: true,
    baseVoiceId:
      selectedBuiltinVoiceId && isBotAudioVoiceId(selectedBuiltinVoiceId)
        ? selectedBuiltinVoiceId
        : choose(BOT_AUDIO_VOICE_IDS, random),
    pitch: randomControl(random),
    lilt: randomControl(random),
    bottishTone: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1.bottishTone,
    texture: DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1.texture,
    ...(engine === "builtin"
      ? { systemVoiceName: selectedSystemVoiceName }
      : {
          elevenLabsVoiceId: identity,
          elevenLabsVoiceIdOverride: null,
          elevenLabsVoiceInitialized: true,
        }),
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
    ...(!normalized.elevenLabsVoiceInitialized &&
    !normalized.elevenLabsVoiceId &&
    !normalized.elevenLabsVoiceIdOverride &&
    elevenLabsVoiceIds.length > 0
      ? {
          elevenLabsVoiceId: choose(elevenLabsVoiceIds, random),
          elevenLabsVoiceInitialized: true,
        }
      : {}),
  });
}
