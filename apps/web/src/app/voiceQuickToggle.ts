import type { VoiceMode } from "@localai/shared";

export type AudibleVoiceMode = Exclude<VoiceMode, "mute">;

export function normalizeAudibleVoiceMode(
  value: unknown,
  fallback: AudibleVoiceMode = "bottish"
): AudibleVoiceMode {
  return value === "bottish" || value === "english" ? value : fallback;
}

export function voiceModeAfterQuickToggle(
  current: VoiceMode,
  lastAudible: AudibleVoiceMode
): VoiceMode {
  return current === "mute" ? normalizeAudibleVoiceMode(lastAudible) : "mute";
}

export function voiceModeDisplayName(mode: VoiceMode): string {
  if (mode === "bottish") return "Bottish";
  if (mode === "english") return "English";
  return "Muted";
}
