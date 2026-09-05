import { tokenizeChatRevealText } from "./chatRevealTiming.ts";
import type { SpeechRevealTimeline } from "./speechRevealTimeline.ts";

export interface AudibleSpeechSourceClock {
  sourceText: string;
  elapsedMs: number;
  segment: {
    sourceStart: number;
    sourceEnd: number;
    startMs: number;
    endMs: number;
    heard: boolean;
  };
}

function appendInterruptionDash(value: string): string {
  const trimmed = value.replace(/\s+$/u, "");
  if (!trimmed) return "";
  return /—$/u.test(trimmed) ? trimmed : `${trimmed}—`;
}

function sourceClockSnippet(clock: AudibleSpeechSourceClock): string {
  const { segment } = clock;
  const sourceLength = clock.sourceText.length;
  const start = Math.max(0, Math.min(sourceLength, segment.sourceStart));
  const end = Math.max(start, Math.min(sourceLength, segment.sourceEnd));
  if (!segment.heard || end <= start) {
    return clock.sourceText.slice(0, start);
  }
  const durationMs = Math.max(1, segment.endMs - segment.startMs);
  const progress = Math.max(
    0,
    Math.min(1, (clock.elapsedMs - segment.startMs) / durationMs),
  );
  const cursor = Math.max(
    start,
    Math.min(end, start + Math.floor((end - start) * progress)),
  );
  return clock.sourceText.slice(0, cursor);
}

function alignedSnippet(
  timeline: SpeechRevealTimeline,
): string | null {
  const alignment = timeline.alignment;
  if (!alignment || alignment.characters.length === 0) return null;
  if (
    alignment.characters.length !==
      alignment.characterStartTimesSeconds.length ||
    alignment.characters.length !== alignment.characterEndTimesSeconds.length
  ) {
    return null;
  }
  const alignedDurationSeconds = Math.max(
    0.001,
    alignment.characterEndTimesSeconds.at(-1) ?? 0,
  );
  const alignedElapsedSeconds =
    (Math.max(0, Math.min(timeline.durationMs, timeline.elapsedMs)) /
      Math.max(1, timeline.durationMs)) *
    alignedDurationSeconds;
  let audibleCharacterCount = 0;
  for (
    let index = 0;
    index < alignment.characterStartTimesSeconds.length;
    index += 1
  ) {
    if (
      (alignment.characterStartTimesSeconds[index] ?? Number.POSITIVE_INFINITY) >
      alignedElapsedSeconds
    ) {
      break;
    }
    audibleCharacterCount = index + 1;
  }
  return alignment.characters.slice(0, audibleCharacterCount).join("");
}

/**
 * Returns only speech that had reached the audible clock when Shh was pressed.
 * An empty string means audio had not begun and therefore no cutoff should be
 * persisted or reacted to.
 */
export function interruptedAssistantAudibleSnippet(args: {
  displayText: string;
  visibleTokenCount: number;
  timeline?: SpeechRevealTimeline | null;
  sourceClock?: AudibleSpeechSourceClock | null;
}): string {
  const sourceClockText = args.sourceClock
    ? sourceClockSnippet(args.sourceClock)
    : null;
  if (sourceClockText !== null) {
    return appendInterruptionDash(sourceClockText);
  }

  if (
    args.timeline &&
    (args.timeline.phase === "preparing" || args.timeline.elapsedMs <= 0)
  ) {
    const prefixTokenCount = Math.max(
      0,
      args.timeline.visiblePrefixTokenCount ?? 0,
    );
    const audiblePrefix = tokenizeChatRevealText(args.displayText)
      .slice(0, prefixTokenCount)
      .join("");
    return appendInterruptionDash(audiblePrefix);
  }

  const alignedText = args.timeline ? alignedSnippet(args.timeline) : null;
  if (alignedText !== null) {
    const prefixTokenCount = Math.max(
      0,
      args.timeline?.visiblePrefixTokenCount ?? 0,
    );
    const prefix = tokenizeChatRevealText(args.displayText)
      .slice(0, prefixTokenCount)
      .join("");
    return appendInterruptionDash(`${prefix}${alignedText}`);
  }

  const tokens = tokenizeChatRevealText(args.displayText);
  const visible = tokens
    .slice(
      0,
      Math.max(
        0,
        Math.min(tokens.length, Math.floor(args.visibleTokenCount)),
      ),
    )
    .join("");
  return appendInterruptionDash(visible);
}
