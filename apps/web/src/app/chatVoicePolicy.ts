import type { VoiceMode } from "@localai/shared";

import type { PrismSurfaceView } from "./viewRouting";

export const CHAT_FORCED_MUTE_REASON =
  "Voice is temporarily unavailable while this surface is locked.";

export function chatPresentationForcesVoiceMute(
  _view: PrismSurfaceView,
  _sidebarOpen: boolean,
): boolean {
  // Chat and Zen share the `chat` route, but both honor the account Voice
  // choice. LOCAL privacy disables only Premium; it must not lock Mute,
  // English, Babble, or Bottish.
  return false;
}

export function effectiveVoiceModeForPresentation(
  view: PrismSurfaceView,
  sidebarOpen: boolean,
  configuredMode: VoiceMode,
): VoiceMode {
  return chatPresentationForcesVoiceMute(view, sidebarOpen)
    ? "mute"
    : configuredMode;
}

export function zenPresentationIsVoiceMuted(
  view: PrismSurfaceView,
  sidebarOpen: boolean,
  configuredMode: VoiceMode,
): boolean {
  return view === "chat" && !sidebarOpen && configuredMode === "mute";
}
