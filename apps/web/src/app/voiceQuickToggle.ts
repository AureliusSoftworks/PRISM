import type { EnglishVoiceEngine, VoiceMode } from "@localai/shared";

export type VoicePlaybackChoice =
  | "mute"
  | "english"
  | "premium"
  | "babble"
  | "bottish";

export const VOICE_PLAYBACK_CHOICES: readonly VoicePlaybackChoice[] = [
  "mute",
  "english",
  "premium",
  "babble",
  "bottish",
];

export function voicePlaybackChoice(
  voiceMode: VoiceMode,
  englishVoiceEngine: EnglishVoiceEngine,
): VoicePlaybackChoice {
  if (voiceMode === "english" && englishVoiceEngine === "elevenlabs") {
    return "premium";
  }
  return voiceMode;
}

export function voiceSettingsForPlaybackChoice(
  choice: VoicePlaybackChoice,
  currentEnglishVoiceEngine: EnglishVoiceEngine,
): { voiceMode: VoiceMode; englishVoiceEngine: EnglishVoiceEngine } {
  if (choice === "premium") {
    return { voiceMode: "english", englishVoiceEngine: "elevenlabs" };
  }
  if (choice === "english") {
    return { voiceMode: "english", englishVoiceEngine: "builtin" };
  }
  return {
    voiceMode: choice,
    englishVoiceEngine: currentEnglishVoiceEngine,
  };
}

export function voiceModeDisplayName(
  choice: VoicePlaybackChoice,
  options: { localPremiumFallback?: boolean } = {},
): string {
  if (choice === "bottish") return "Bottish";
  if (choice === "babble") return "Babble";
  if (choice === "premium") {
    return options.localPremiumFallback ? "English · LOCAL" : "Premium";
  }
  if (choice === "english") return "English";
  return "Mute";
}

export function conversationEnglishVoiceEngine(
  requestedEngine: EnglishVoiceEngine,
  persistedMessageProvider?: string | null,
): EnglishVoiceEngine {
  return persistedMessageProvider === "local" ? "builtin" : requestedEngine;
}

/**
 * Player-facing copy when Premium is selected but the reply stayed on-device
 * (LOCAL / AUTO with a local model). Keeps the privacy invariant obvious.
 */
export const PREMIUM_LOCAL_FALLBACK_NOTICE =
  "Premium waits for ONLINE replies — this turn used the local voice pack.";

export function premiumLocalFallbackNotice(args: {
  requestedEngine: EnglishVoiceEngine;
  effectiveEngine: EnglishVoiceEngine;
  engineUsedHeader?: string | null;
  messageProvider?: string | null;
}): string | null {
  if (args.requestedEngine !== "elevenlabs") return null;
  if (
    args.engineUsedHeader === "builtin-local-fallback" ||
    (args.effectiveEngine === "builtin" && args.messageProvider === "local")
  ) {
    return PREMIUM_LOCAL_FALLBACK_NOTICE;
  }
  return null;
}

export function effectiveVoicePlaybackChoice(
  configuredChoice: VoicePlaybackChoice,
  localResponse: boolean,
): VoicePlaybackChoice {
  return configuredChoice === "premium" && localResponse
    ? "english"
    : configuredChoice;
}

/** Every audible speech mode owns its reveal clock; Mute alone is visual. */
export function voiceModeDrivesCanvasReveal(mode: VoiceMode): boolean {
  return mode !== "mute";
}
