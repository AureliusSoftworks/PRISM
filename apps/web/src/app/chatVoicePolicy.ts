import type { VoiceMode } from "@localai/shared";

import type { PrismSurfaceView } from "./viewRouting";

export const CHAT_FORCED_MUTE_REASON =
  "Voice is muted in Chat. Close Conversations to return to Zen and restore your voice choice.";

export type ChatPresentation = "chat" | "zen";

/**
 * Chat and Zen intentionally share the product `chat` route and conversation
 * data. The expanded Conversations panel is the authoritative presentation
 * boundary: open is transcript Chat; closed is immersive Zen.
 */
export function chatPresentationForSurface(
  view: PrismSurfaceView,
  sidebarOpen: boolean,
): ChatPresentation | null {
  if (view !== "chat") return null;
  return sidebarOpen ? "chat" : "zen";
}

export function chatPresentationForcesVoiceMute(
  view: PrismSurfaceView,
  sidebarOpen: boolean,
): boolean {
  return chatPresentationForSurface(view, sidebarOpen) === "chat";
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
  return (
    chatPresentationForSurface(view, sidebarOpen) === "zen" &&
    configuredMode === "mute"
  );
}
