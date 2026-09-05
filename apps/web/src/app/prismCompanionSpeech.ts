import { tokenizeChatRevealText } from "./chatRevealTiming.ts";
import {
  finishSpeechRevealTimeline,
  prepareSpeechRevealTimeline,
  speechRevealVisibleTokenCount,
  startAlignedSpeechRevealTimeline,
  startSpeechRevealTimeline,
  updateSpeechRevealTimeline,
  type SpeechCharacterAlignment,
  type SpeechRevealTimeline,
} from "./speechRevealTimeline.ts";

export interface PrismCompanionSpeechReveal {
  messageId: string;
  tokens: string[];
  timeline: SpeechRevealTimeline;
}

export function preparePrismCompanionSpeechReveal(
  messageId: string,
  content: string,
): PrismCompanionSpeechReveal {
  return {
    messageId,
    tokens: tokenizeChatRevealText(content),
    timeline: prepareSpeechRevealTimeline(content),
  };
}

export function startPrismCompanionSpeechReveal(
  reveal: PrismCompanionSpeechReveal,
  durationMs: number,
  alignment?: SpeechCharacterAlignment | null,
): PrismCompanionSpeechReveal {
  return {
    ...reveal,
    timeline: alignment
      ? startAlignedSpeechRevealTimeline(
          reveal.tokens,
          reveal.timeline.tokenSignature,
          durationMs,
          alignment,
        )
      : startSpeechRevealTimeline(
          reveal.tokens,
          reveal.timeline.tokenSignature,
          durationMs,
        ),
  };
}

export function progressPrismCompanionSpeechReveal(
  reveal: PrismCompanionSpeechReveal,
  elapsedMs: number,
): PrismCompanionSpeechReveal {
  return {
    ...reveal,
    timeline: updateSpeechRevealTimeline(reveal.timeline, elapsedMs),
  };
}

export function finishPrismCompanionSpeechReveal(
  reveal: PrismCompanionSpeechReveal,
): PrismCompanionSpeechReveal {
  if (reveal.timeline.phase === "preparing") return reveal;
  return {
    ...reveal,
    timeline: finishSpeechRevealTimeline(reveal.timeline),
  };
}

export function prismCompanionSpeechVisibleContent(
  reveal: PrismCompanionSpeechReveal | null,
  messageId: string,
  fullContent: string,
): string {
  if (!reveal || reveal.messageId !== messageId) return fullContent;
  const visibleTokenCount = speechRevealVisibleTokenCount(reveal.timeline);
  return reveal.tokens.slice(0, visibleTokenCount).join("");
}

