import {
  botcastMessageIsAudibleToAudienceV1,
  botPowerResponseIsSilentV1,
  type BotcastMessage,
} from "@localai/shared";

import type { BotcastSpeechRevealState } from "./botcastSpeechReveal.ts";
import {
  crtSpeechMouthShapeAtAlignedElapsedMs,
  crtSpeechMouthShapeAtElapsedMs,
  type ZenLiveBotMouthShape,
} from "./zenLiveMouth.ts";
import { speechActivityAtMs } from "./speechActivity.ts";

/** The audible lifecycle owns the exact message; the episode snapshot may lag it. */
export type SignalLiveSpeechState = {
  messageId: string;
  message: BotcastMessage;
  audible: boolean;
  reveal: BotcastSpeechRevealState;
};

export type SignalLiveSpeechPlaybackClock = {
  messageId: string;
  elapsedMs: number;
  observedAtMs: number;
};

/**
 * Keep the visible Signal mouth on the audible clock when an engine stops
 * publishing progress frames between playback start and end. The lifecycle's
 * latest elapsed value remains authoritative; wall time only fills the gap
 * after that observation and is always bounded by the known clip duration.
 */
export function signalLiveSpeechProjectedElapsedMs(args: {
  liveSpeech: SignalLiveSpeechState | null;
  clock: SignalLiveSpeechPlaybackClock | null;
  nowMs: number;
}): number {
  const speech = args.liveSpeech;
  const clock = args.clock;
  if (
    !speech ||
    speech.reveal.phase !== "playing" ||
    !clock ||
    clock.messageId !== speech.messageId ||
    !Number.isFinite(args.nowMs)
  ) {
    return speech?.reveal.elapsedMs ?? 0;
  }
  const projected =
    clock.elapsedMs + Math.max(0, args.nowMs - clock.observedAtMs);
  return Math.min(
    speech.reveal.durationMs,
    Math.max(speech.reveal.elapsedMs, projected),
  );
}

export function signalLiveActiveMessage(args: {
  liveSpeech: SignalLiveSpeechState | null;
  speakingMessageId: string | null;
  episodeMessages: readonly BotcastMessage[];
}): BotcastMessage | null {
  if (args.liveSpeech) return args.liveSpeech.message;
  if (!args.speakingMessageId) return null;
  return (
    args.episodeMessages.find(
      (message) => message.id === args.speakingMessageId,
    ) ?? null
  );
}

/**
 * Resolve the mouth directly from the clock that owns the audible clip.
 *
 * Chunked English publishes one source-linked segment as each clause begins.
 * Its partial character alignment intentionally marks future characters as
 * pending, so feeding that alignment to the full-clip scaler makes the first
 * published segment look like a million-second utterance and closes the mouth
 * for the rest of the line. Resolve the currently audible segment locally;
 * explicit gaps/actions stay closed, while engines that never publish segment
 * timing retain the deterministic full-line cadence.
 */
export function signalLiveSpeechMouthShapeAtElapsedMs(args: {
  reveal: BotcastSpeechRevealState;
  elapsedMs: number;
}): ZenLiveBotMouthShape {
  const elapsedMs = Math.max(
    0,
    Number.isFinite(args.elapsedMs) ? args.elapsedMs : 0,
  );
  const { reveal } = args;
  if (reveal.segmentClock) {
    const segments = reveal.segmentTimings ?? [];
    const segment = segments.findLast(
      (candidate) =>
        Number.isFinite(candidate.startMs) &&
        Number.isFinite(candidate.endMs) &&
        candidate.endMs > candidate.startMs &&
        elapsedMs >= candidate.startMs &&
        elapsedMs < candidate.endMs,
    );
    if (segment) {
      if (
        segment.kind !== "speech" ||
        !segment.heard ||
        segment.sourceEnd <= segment.sourceStart
      ) {
        return "closed";
      }
      const sourceCharacters = Array.from(reveal.text);
      const sourceStart = Math.max(
        0,
        Math.min(sourceCharacters.length, Math.round(segment.sourceStart)),
      );
      const sourceEnd = Math.max(
        sourceStart,
        Math.min(sourceCharacters.length, Math.round(segment.sourceEnd)),
      );
      const segmentText = sourceCharacters
        .slice(sourceStart, sourceEnd)
        .join("");
      return crtSpeechMouthShapeAtElapsedMs({
        text: segmentText || reveal.text,
        elapsedMs: elapsedMs - segment.startMs,
        durationMs: segment.endMs - segment.startMs,
      });
    }
    if (segments.length > 0) {
      // Once the segment clock has spoken, uncovered time is a real clause gap
      // (or the boundary before the next on-start timing callback), not speech.
      return "closed";
    }
  }
  return crtSpeechMouthShapeAtAlignedElapsedMs({
    text: reveal.text,
    elapsedMs,
    durationMs: reveal.durationMs,
    alignment: reveal.alignment,
  });
}

export function signalLivePrimaryAvatarSpeech(args: {
  liveSpeech: SignalLiveSpeechState | null;
  role: "host" | "guest";
  elapsedMs?: number;
}): { talking: boolean; mouthShape: ZenLiveBotMouthShape } {
  const speech = args.liveSpeech;
  const message = speech?.message;
  if (
    !speech ||
    !message ||
    speech.messageId !== message.id ||
    speech.reveal.phase !== "playing" ||
    !speech.audible ||
    message.speakerRole !== args.role ||
    !botcastMessageIsAudibleToAudienceV1(message) ||
    botPowerResponseIsSilentV1(message.content)
  ) {
    return { talking: false, mouthShape: "closed" };
  }

  return {
    // Utterance-level talking remains true through a real phrase pause. The
    // aligned mouth shape below is still literally closed during that pause.
    talking: true,
    mouthShape: signalLiveSpeechMouthShapeAtElapsedMs({
      reveal: speech.reveal,
      elapsedMs:
        typeof args.elapsedMs === "number" && Number.isFinite(args.elapsedMs)
          ? args.elapsedMs
          : speech.reveal.elapsedMs,
    }),
  };
}

/**
 * Semantic Signal lights follow the same speech-activity envelope as the
 * audible mouth clock. This deliberately differs from a viseme check: a
 * short /m/, /b/, or /p/ closure remains inside its held activity window,
 * while a real clause gap settles the studio before the next onset.
 */
export function signalLiveSpeechIsActiveAtElapsedMs(args: {
  liveSpeech: SignalLiveSpeechState | null;
  role: "host" | "guest";
  elapsedMs?: number;
}): boolean {
  const speech = args.liveSpeech;
  const primary = signalLivePrimaryAvatarSpeech(args);
  if (!primary.talking || !speech) return false;
  const elapsedMs =
    typeof args.elapsedMs === "number" && Number.isFinite(args.elapsedMs)
      ? args.elapsedMs
      : speech.reveal.elapsedMs;
  // A missing window is legacy/no-timing fallback. An explicit empty segment
  // clock is intentionally silent until the engine reports audible speech.
  return speechActivityAtMs(speech.reveal.speechActivityWindows, elapsedMs) ?? true;
}
