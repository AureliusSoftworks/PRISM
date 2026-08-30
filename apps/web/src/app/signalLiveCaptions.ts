import {
  botPowerMutePublicResponseAtElapsedV1,
  botPowerResponseIsSilentV1,
  socialSilenceMessageIsMarkedV1,
  type BotcastMessage,
} from "@localai/shared";
import {
  startBotcastSpeechReveal,
  updateBotcastSpeechReveal,
  botcastSpeechRevealVisibleText,
  type BotcastSpeechRevealState,
} from "./botcastSpeechReveal.ts";

/** Kept named so call sites stay explicit; 0 means captions share the speech clock. */
export const SIGNAL_LIVE_CAPTION_DELAY_MS = 0;
const SIGNAL_SILENT_CAPTION_WORD_MS = 400;
const SIGNAL_SILENT_CAPTION_MIN_MS = 2_000;
const SIGNAL_SILENT_CAPTION_MAX_MS = 20_000;
/** Spoken fallback pace when realtime duration is unknown (~150 wpm). */
const SIGNAL_VOICE_COMPLETION_WORD_MS = 400;
const SIGNAL_VOICE_COMPLETION_MIN_MS = 1_200;
const SIGNAL_VOICE_COMPLETION_CHAR_MS = 34;

/**
 * When configured voice playback fails, keep the live caption readable instead
 * of racing through it at UI-animation speed. 400ms per word is roughly 150
 * words per minute, close to a natural spoken delivery.
 */
export function signalSilentCaptionRevealDurationMs(
  text: string,
  options: { stageAction?: boolean } = {},
): number {
  const wordCount = Math.max(1, text.trim().split(/\s+/u).length);
  return Math.min(
    SIGNAL_SILENT_CAPTION_MAX_MS,
    Math.max(
      options.stageAction ? 1_800 : SIGNAL_SILENT_CAPTION_MIN_MS,
      wordCount * SIGNAL_SILENT_CAPTION_WORD_MS,
    ),
  );
}

/**
 * Watchdog floor for Signal utterance completion when `onStart` reports a null
 * duration (common for English/local media before `audio.duration` is ready).
 * Prefer the slower of char- and word-based estimates so long host questions are
 * not cut mid-sentence before `ended` can settle playback.
 */
export function signalVoiceCompletionFallbackDurationMs(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return SIGNAL_VOICE_COMPLETION_MIN_MS;
  const wordCount = Math.max(1, trimmed.split(/\s+/u).length);
  return Math.max(
    SIGNAL_VOICE_COMPLETION_MIN_MS,
    trimmed.length * SIGNAL_VOICE_COMPLETION_CHAR_MS,
    wordCount * SIGNAL_VOICE_COMPLETION_WORD_MS,
  );
}

/** Debate reuses Signal’s spoken-word completion floor so English duration null
 * never falls back to a bare character×34 stop that clips moderator lines. */
export const debateVoiceCompletionFallbackDurationMs =
  signalVoiceCompletionFallbackDurationMs;

/**
 * Mirrors only the fully spoken prefix of the active line on the speech clock
 * (no added caption lag). The empty result outside playback prevents captions
 * from affecting or surviving turn handoffs, interruptions, cuts, and completion.
 */
export function signalLiveCaptionText(
  reveal: BotcastSpeechRevealState | null | undefined,
  message?: Pick<BotcastMessage, "content" | "socialSilence" | "mutePerformance"> | null,
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
  if (message?.mutePerformance) {
    return botPowerMutePublicResponseAtElapsedV1(
      message.content,
      message.mutePerformance,
      reveal.elapsedMs,
    );
  }
  if (message && botPowerResponseIsSilentV1(message.content)) {
    return "";
  }
  return botcastSpeechRevealVisibleText(reveal).trim();
}

/** Reconstruct the public caption prefix from the archive's playback clock. */
export function signalReplayCaptionText(args: {
  text: string;
  message: Pick<
    BotcastMessage,
    "content" | "socialSilence" | "mutePerformance"
  >;
  elapsedMs: number;
  durationMs: number;
  playing: boolean;
}): string {
  if (!args.playing) return "";
  const reveal = updateBotcastSpeechReveal(
    startBotcastSpeechReveal({
      text: args.text,
      durationMs: args.durationMs,
    }),
    args.elapsedMs,
  );
  return signalLiveCaptionText(reveal, args.message);
}
