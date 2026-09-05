import type { VoiceMode } from "@localai/shared";

import type { PrismSurfaceView } from "./viewRouting";

export const CHAT_AND_ZEN_SHARED_VOICE_REASON =
  "Chat and Zen share the selected Speech Type.";

/** @deprecated Chat no longer forces speech to Mute. */
export const CHAT_FORCED_MUTE_REASON = CHAT_AND_ZEN_SHARED_VOICE_REASON;

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
  void view;
  void sidebarOpen;
  return false;
}

export function effectiveVoiceModeForPresentation(
  _view: PrismSurfaceView,
  _sidebarOpen: boolean,
  configuredMode: VoiceMode,
): VoiceMode {
  return configuredMode;
}

export function zenPresentationIsVoiceMuted(
  view: PrismSurfaceView,
  sidebarOpen: boolean,
  configuredMode: VoiceMode,
): boolean {
  return (
    chatPresentationForSurface(view, sidebarOpen) !== null &&
    configuredMode === "mute"
  );
}
