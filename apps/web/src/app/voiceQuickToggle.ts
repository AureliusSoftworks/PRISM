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

export function voiceModeDisplayName(choice: VoicePlaybackChoice): string {
  if (choice === "bottish") return "Bottish";
  if (choice === "babble") return "Babble";
  if (choice === "premium") return "Premium";
  if (choice === "english") return "English";
  return "Mute";
}

/** Robot voices follow the canvas reveal clock instead of owning transcript text. */
export function voiceModeDrivesCanvasReveal(mode: VoiceMode): boolean {
  return mode === "english";
}
