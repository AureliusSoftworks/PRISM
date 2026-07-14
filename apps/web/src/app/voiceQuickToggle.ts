import type { VoiceMode } from "@localai/shared";

export const VOICE_MODE_OPTIONS: readonly VoiceMode[] = [
  "mute",
  "english",
  "babble",
  "bottish",
];

export function voiceModeDisplayName(mode: VoiceMode): string {
  if (mode === "bottish") return "Bottish";
  if (mode === "babble") return "Babble";
  if (mode === "english") return "English";
  return "Mute";
}

/** Robot voices follow the canvas reveal clock instead of owning transcript text. */
export function voiceModeDrivesCanvasReveal(mode: VoiceMode): boolean {
  return mode === "english";
}
