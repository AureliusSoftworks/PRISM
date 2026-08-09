import {
  isBotAudioVoiceId,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceId,
  type BotAudioVoiceProfileV1,
  type LocalVoicePresentation,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";

export const BUILTIN_VOICE_SELECTION_PREFIX = "builtin:";
export const OPERATING_SYSTEM_VOICE_SELECTION_PREFIX = "os:";

export type LocalVoicePresentationFilter =
  | "any"
  | LocalVoicePresentation;

export interface OfflineVoiceOption {
  value: string;
  label: string;
  detail?: string;
  kind: "builtin" | "os";
  locale: string;
  presentation?: LocalVoicePresentation;
  featured?: boolean;
}

export function canonicalEnglishVoiceLocale(value: unknown): string {
  if (typeof value !== "string") return "en-US";
  const normalized = value.trim().replace("_", "-");
  if (!/^en(?:-[a-z]{2,8})?$/iu.test(normalized)) return "en-US";
  const [, region] = normalized.split("-", 2);
  return region ? `en-${region.toUpperCase()}` : "en-US";
}

export function offlineVoiceOptionsForFilters(
  options: readonly OfflineVoiceOption[],
  filters: {
    presentation: LocalVoicePresentationFilter;
  },
): OfflineVoiceOption[] {
  return options.filter(
    (option) =>
      filters.presentation === "any"
        ? true
        : option.kind === "builtin" &&
          option.presentation === filters.presentation,
  );
}

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
      localVoiceSource: "portable",
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
      localVoiceSource: systemVoiceName ? "system" : "portable",
    });
  }
  return normalized;
}
