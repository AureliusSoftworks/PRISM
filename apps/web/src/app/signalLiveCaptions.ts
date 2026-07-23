import {
  botcastSpeechRevealVisibleText,
  type BotcastSpeechRevealState,
} from "./botcastSpeechReveal.ts";

export const SIGNAL_LIVE_CAPTION_DELAY_MS = 500;

/**
 * Mirrors only the fully spoken prefix of the active line after a small initial
 * delay. Disabling the overlay or leaving playback returns an empty result so
 * captions cannot affect or survive turn handoffs, interruptions, cuts, and
 * completion.
 */
export function signalLiveCaptionText(
  reveal: BotcastSpeechRevealState | null | undefined,
  enabled = true,
): string {
  if (
    !enabled ||
    !reveal ||
    reveal.phase !== "playing" ||
    reveal.elapsedMs < SIGNAL_LIVE_CAPTION_DELAY_MS
  ) {
    return "";
  }
  return botcastSpeechRevealVisibleText(reveal).trim();
}
