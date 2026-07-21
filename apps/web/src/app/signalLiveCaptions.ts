import {
  botcastSpeechRevealVisibleText,
  type BotcastSpeechRevealState,
} from "./botcastSpeechReveal.ts";

export const SIGNAL_LIVE_CAPTION_DELAY_MS = 500;

/**
 * Mirrors only the fully spoken prefix of the active line after a small initial
 * delay. The empty result outside playback prevents captions from affecting or
 * surviving turn handoffs, interruptions, cuts, and completion.
 */
export function signalLiveCaptionText(
  reveal: BotcastSpeechRevealState | null | undefined,
): string {
  if (
    !reveal ||
    reveal.phase !== "playing" ||
    reveal.elapsedMs < SIGNAL_LIVE_CAPTION_DELAY_MS
  ) {
    return "";
  }
  return botcastSpeechRevealVisibleText(reveal).trim();
}
