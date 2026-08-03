import type { VoiceMode } from "@localai/shared";

import type { PrismSurfaceView } from "./viewRouting";

export const CHAT_FORCED_MUTE_REASON =
  "Chat is always silent. Your saved Voice preference resumes in other modes.";

export function chatPresentationForcesVoiceMute(
  view: PrismSurfaceView,
  sidebarOpen: boolean,
): boolean {
  // Chat and Zen share the `chat` route. The open conversation rail selects
  // the transcript-style Chat presentation; the rail-free canvas is Zen.
  return view === "chat" && sidebarOpen;
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
