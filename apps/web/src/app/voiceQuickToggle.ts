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

export function effectiveVoicePlaybackChoice(
  configuredChoice: VoicePlaybackChoice,
  localResponse: boolean,
): VoicePlaybackChoice {
  return configuredChoice === "premium" && localResponse
    ? "english"
    : configuredChoice;
}

/** Generated speech owns text timing; procedural Bottish is already immediate. */
export function voiceModeDrivesCanvasReveal(mode: VoiceMode): boolean {
  return mode === "english" || mode === "babble";
}
