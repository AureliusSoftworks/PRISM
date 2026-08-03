import {
  isBotAudioVoiceId,
  normalizeBotAudioVoiceProfileV1,
  prismBuiltinEnglishVoice,
  PRISM_BUILTIN_ENGLISH_VOICES,
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
    locale: string;
    presentation: LocalVoicePresentationFilter;
  },
): OfflineVoiceOption[] {
  const locale = canonicalEnglishVoiceLocale(filters.locale);
  return options.filter(
    (option) =>
      canonicalEnglishVoiceLocale(option.locale) === locale &&
      (filters.presentation === "any"
        ? true
        : option.kind === "builtin" &&
          option.presentation === filters.presentation),
  );
}

function closestPortableCounterpart(
  currentVoiceId: BotAudioVoiceId,
  candidates: readonly OfflineVoiceOption[],
): OfflineVoiceOption | null {
  const portable = candidates.filter(
    (candidate) =>
      candidate.kind === "builtin" &&
      candidate.value.startsWith(BUILTIN_VOICE_SELECTION_PREFIX),
  );
  if (portable.length === 0) return null;
  const current = prismBuiltinEnglishVoice(currentVoiceId);
  const samePresentation = portable.filter(
    (candidate) => candidate.presentation === current.presentation,
  );
  const targets = samePresentation.length > 0 ? samePresentation : portable;
  const sourcePeers = PRISM_BUILTIN_ENGLISH_VOICES.filter(
    (voice) =>
      voice.locale === current.locale &&
      voice.presentation === current.presentation,
  );
  const sourceIndex = Math.max(
    0,
    sourcePeers.findIndex((voice) => voice.voiceId === currentVoiceId),
  );
  const sourceFraction =
    sourcePeers.length <= 1 ? 0 : sourceIndex / (sourcePeers.length - 1);
  return targets[Math.round(sourceFraction * (targets.length - 1))] ?? targets[0];
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
  options: readonly OfflineVoiceOption[] = [],
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
      accentLocale: isBotAudioVoiceId(voiceId)
        ? prismBuiltinEnglishVoice(voiceId).locale
        : normalized.accentLocale,
      accentMode: "prefer-genuine",
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
      accentLocale:
        options.find((option) => option.value === value)?.locale ??
        normalized.accentLocale,
      accentMode: "prefer-genuine",
    });
  }
  return normalized;
}

export function selectOfflineVoiceAccent(
  profile: BotAudioVoiceProfileV1,
  locale: string,
  options: readonly OfflineVoiceOption[],
  presentation: LocalVoicePresentationFilter = "any",
): NormalizedBotAudioVoiceProfileV1 {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  const candidates = offlineVoiceOptionsForFilters(options, {
    locale,
    presentation,
  });
  const counterpart = closestPortableCounterpart(
    normalized.baseVoiceId,
    candidates,
  );
  const selected = counterpart ?? candidates[0];
  if (!selected) {
    return normalizeBotAudioVoiceProfileV1({
      ...normalized,
      accentLocale: canonicalEnglishVoiceLocale(locale),
      accentMode: "prefer-genuine",
    });
  }
  return applyOfflineVoiceSelection(normalized, selected.value, options);
}

export function selectOfflineVoicePresentation(
  profile: BotAudioVoiceProfileV1,
  presentation: LocalVoicePresentationFilter,
  options: readonly OfflineVoiceOption[],
): NormalizedBotAudioVoiceProfileV1 {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  if (presentation === "any") return normalized;
  const candidates = offlineVoiceOptionsForFilters(options, {
    locale: normalized.accentLocale ?? "en-US",
    presentation,
  });
  const counterpart = closestPortableCounterpart(
    normalized.baseVoiceId,
    candidates,
  );
  return counterpart
    ? applyOfflineVoiceSelection(normalized, counterpart.value, options)
    : normalized;
}
