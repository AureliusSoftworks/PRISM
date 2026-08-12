import {
  BOT_VOICE_TEXTURE_RECIPES,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV2,
  type EnglishVoiceEngine,
  type VoiceMode,
} from "@localai/shared";

/**
 * Player speech carries identity only. Bot performance effects, authored
 * delivery controls, and avatar loops must never leak onto the player's voice.
 */
export function cleanPlayerVoiceProfile(
  profile: BotAudioVoiceProfileV1 | null | undefined,
): BotAudioVoiceProfileV2 {
  const identity = normalizeBotAudioVoiceProfileV1(profile);
  return normalizeBotAudioVoiceProfileV1({
    ...identity,
    enabled: true,
    elevenLabsEffect: "clean",
    voiceEffectExplicit: true,
    elevenLabsDirection: null,
    pitch: 0,
    warmth: 0,
    pace: 0,
    lilt: 0,
    bottishTone: 0,
    eqTilt: 0,
    gainDb: 0,
    volume: 1,
    texture: BOT_VOICE_TEXTURE_RECIPES.clean,
    avatarSfx: null,
    avatarSfxMuted: true,
  });
}

export function playerVoiceEngine(
  profile: BotAudioVoiceProfileV1 | null | undefined,
): EnglishVoiceEngine {
  const clean = cleanPlayerVoiceProfile(profile);
  return clean.elevenLabsVoiceIdOverride || clean.elevenLabsVoiceId
    ? "elevenlabs"
    : "builtin";
}

export function playerPremiumVoiceId(
  profile: BotAudioVoiceProfileV1 | null | undefined,
): string | null {
  const clean = cleanPlayerVoiceProfile(profile);
  return clean.elevenLabsVoiceIdOverride ?? clean.elevenLabsVoiceId ?? null;
}

export function selectPlayerPremiumVoice(
  profile: BotAudioVoiceProfileV1 | null | undefined,
  voiceId: string | null,
  nativeAccentHint: string | null = null,
): BotAudioVoiceProfileV2 {
  return cleanPlayerVoiceProfile({
    ...cleanPlayerVoiceProfile(profile),
    elevenLabsVoiceId: voiceId?.trim() || null,
    elevenLabsVoiceIdOverride: null,
    elevenLabsVoiceInitialized: true,
    elevenLabsNativeAccentHint: voiceId?.trim() ? nativeAccentHint : null,
  });
}

export function playerLocalVoiceProfile(
  profile: BotAudioVoiceProfileV1 | null | undefined,
): BotAudioVoiceProfileV2 {
  return cleanPlayerVoiceProfile({
    ...cleanPlayerVoiceProfile(profile),
    elevenLabsVoiceId: null,
    elevenLabsVoiceIdOverride: null,
    elevenLabsNativeAccentHint: null,
  });
}

export function resolvePlayerVoicePlayback(args: {
  profile: BotAudioVoiceProfileV1 | null | undefined;
  voiceMode: VoiceMode;
  englishVoiceEngine: EnglishVoiceEngine;
  localOnly: boolean;
}): { profile: BotAudioVoiceProfileV2; engine: EnglishVoiceEngine } {
  const clean = cleanPlayerVoiceProfile(args.profile);
  const premiumSelected =
    !args.localOnly &&
    args.voiceMode === "english" &&
    args.englishVoiceEngine === "elevenlabs" &&
    playerPremiumVoiceId(clean) !== null;
  return premiumSelected
    ? { profile: clean, engine: "elevenlabs" }
    : { profile: playerLocalVoiceProfile(clean), engine: "builtin" };
}
