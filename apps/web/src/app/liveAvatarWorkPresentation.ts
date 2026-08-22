export interface LiveAvatarWorkPresentationState {
  generating: boolean;
  synthesizing: boolean;
  speaking: boolean;
  /** Playing a saved performance must never manufacture live work state. */
  playbackRecording: boolean;
}

/** Shared applet rule for the face shown between a request and audible speech. */
export function liveAvatarShouldShowThinking(
  state: LiveAvatarWorkPresentationState,
): boolean {
  if (state.playbackRecording || state.speaking) return false;
  return state.generating || state.synthesizing;
}
