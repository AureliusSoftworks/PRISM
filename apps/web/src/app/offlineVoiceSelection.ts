import {
  isBotAudioVoiceId,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceId,
  type BotAudioVoiceProfileV1,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";

export const BUILTIN_VOICE_SELECTION_PREFIX = "builtin:";
export const OPERATING_SYSTEM_VOICE_SELECTION_PREFIX = "os:";

export function builtinVoiceSelectionValue(voiceId: BotAudioVoiceId): string {
  return `${BUILTIN_VOICE_SELECTION_PREFIX}${voiceId}`;
}

export function operatingSystemVoiceSelectionValue(name: string): string {
  return `${OPERATING_SYSTEM_VOICE_SELECTION_PREFIX}${name}`;
}

export function offlineVoiceSelectionValue(
  profile: BotAudioVoiceProfileV1,
): string {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return normalized.systemVoiceName
    ? operatingSystemVoiceSelectionValue(normalized.systemVoiceName)
    : builtinVoiceSelectionValue(normalized.baseVoiceId);
}

export function applyOfflineVoiceSelection(
  profile: BotAudioVoiceProfileV1,
  value: string,
): NormalizedBotAudioVoiceProfileV1 {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  if (value.startsWith(BUILTIN_VOICE_SELECTION_PREFIX)) {
    const voiceId = value.slice(BUILTIN_VOICE_SELECTION_PREFIX.length);
    return normalizeBotAudioVoiceProfileV1({
      ...normalized,
      baseVoiceId: isBotAudioVoiceId(voiceId)
        ? voiceId
        : normalized.baseVoiceId,
      systemVoiceName: null,
    });
  }
  if (value.startsWith(OPERATING_SYSTEM_VOICE_SELECTION_PREFIX)) {
    const systemVoiceName = value
      .slice(OPERATING_SYSTEM_VOICE_SELECTION_PREFIX.length)
      .trim()
      .slice(0, 200);
    return normalizeBotAudioVoiceProfileV1({
      ...normalized,
      systemVoiceName: systemVoiceName || null,
    });
  }
  return normalized;
}
