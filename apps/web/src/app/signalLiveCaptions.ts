import {
  botPowerResponseIsSilentV1,
  socialSilenceMessageIsMarkedV1,
  type BotcastMessage,
} from "@localai/shared";
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
  message?: Pick<BotcastMessage, "content" | "socialSilence"> | null,
): string {
  if (
    !reveal ||
    reveal.phase !== "playing" ||
    reveal.elapsedMs < SIGNAL_LIVE_CAPTION_DELAY_MS
  ) {
    return "";
  }
  const markedSocialSilence =
    message &&
    socialSilenceMessageIsMarkedV1({
      content: message.content,
      marker: message.socialSilence,
      mode: "signal",
    });
  if (markedSocialSilence) return "...";
  if (message && botPowerResponseIsSilentV1(message.content)) {
    return "";
  }
  return botcastSpeechRevealVisibleText(reveal).trim();
}
