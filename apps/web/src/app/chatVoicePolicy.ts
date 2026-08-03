import type { VoiceMode } from "@localai/shared";

import type { PrismSurfaceView } from "./viewRouting";

export const CHAT_FORCED_MUTE_REASON =
  "Chat is always silent. Your saved Voice preference resumes in other modes.";

export function chatViewForcesVoiceMute(view: PrismSurfaceView): boolean {
  return view === "chat";
}

export function effectiveVoiceModeForView(
  view: PrismSurfaceView,
  configuredMode: VoiceMode,
): VoiceMode {
  return chatViewForcesVoiceMute(view) ? "mute" : configuredMode;
}
