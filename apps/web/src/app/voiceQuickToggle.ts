import type { VoiceMode } from "@localai/shared";

export function voiceModeAfterQuickToggle(
  current: VoiceMode
): VoiceMode {
  if (current === "english") return "bottish";
  if (current === "bottish") return "mute";
  return "english";
}

export function voiceModeDisplayName(mode: VoiceMode): string {
  if (mode === "bottish") return "Bottish";
  if (mode === "english") return "English";
  return "Muted";
}
