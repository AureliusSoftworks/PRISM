import {
  BOT_VOICE_TEXTURE_RECIPES,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV2,
  type EnglishVoiceEngine,
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

export function playerVoiceSelectionValue(
  profile: BotAudioVoiceProfileV1 | null | undefined,
  offlineValue: (profile: BotAudioVoiceProfileV1) => string,
): string {
  const clean = cleanPlayerVoiceProfile(profile);
  const premiumId = clean.elevenLabsVoiceIdOverride ?? clean.elevenLabsVoiceId;
  return premiumId ? `premium:${premiumId}` : offlineValue(clean);
}

