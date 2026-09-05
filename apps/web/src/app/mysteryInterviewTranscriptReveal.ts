import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";

/**
 * The newest suspect reply must be withheld during the render immediately
 * before the playback effect claims it. React effects run after paint, so
 * checking only streamingMessageId would expose the committed full reply once.
 */
export function mysteryInterviewTranscriptShouldWithhold(args: {
  messageId: string;
  role: "investigator" | "suspect";
  streamingMessageId: string | null;
  streamedReply: string;
  latestMessageId: string | null;
  claimedMessageId: string | null;
}): boolean {
  if (args.messageId === args.streamingMessageId && !args.streamedReply) return true;
  return args.role === "suspect" &&
    args.messageId === args.latestMessageId &&
    args.messageId !== args.claimedMessageId;
}

/**
 * Returns reply characters that have completed on the decoded playback clock.
 * Exact provider alignment wins when available. Engines without character
 * timing fall back to the same audible playback progress so interviews still
 * reveal continuously instead of dumping the full answer at playback end.
 */
export function mysteryInterviewTranscriptVisibleText(args: {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment | null | undefined;
}): string {
  const alignment = args.alignment;
  const characters = Array.from(args.text);
  const durationMs = Math.max(1, args.durationMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, args.elapsedMs));
  const estimatedVisibleText = (): string => {
    const visibleCount = Math.min(
      characters.length,
      Math.floor(characters.length * (elapsedMs / durationMs)),
    );
    return characters.slice(0, visibleCount).join("");
  };
  if (
    !alignment ||
    alignment.characters.length !== characters.length ||
    alignment.characters.join("") !== args.text ||
    alignment.characterStartTimesSeconds.length !== characters.length ||
    alignment.characterEndTimesSeconds.length !== characters.length
  ) {
    return estimatedVisibleText();
  }

  const alignmentDurationSeconds =
    alignment.characterEndTimesSeconds[characters.length - 1];
  if (
    typeof alignmentDurationSeconds !== "number" ||
    !Number.isFinite(alignmentDurationSeconds) ||
    alignmentDurationSeconds <= 0
  ) {
    return estimatedVisibleText();
  }

  const audioTimelineOffsetSeconds = alignment.audioTimelineOffsetSeconds;
  const usesDecodedAudioClock =
    typeof audioTimelineOffsetSeconds === "number" &&
    Number.isFinite(audioTimelineOffsetSeconds) &&
    audioTimelineOffsetSeconds >= 0;
  const scale = usesDecodedAudioClock
    ? 1
    : durationMs / (alignmentDurationSeconds * 1_000);
  const offsetMs = usesDecodedAudioClock
    ? audioTimelineOffsetSeconds * 1_000
    : 0;
  let visibleCount = 0;
  let previousStart = 0;
  let previousEnd = 0;

  for (let index = 0; index < characters.length; index += 1) {
    const start = alignment.characterStartTimesSeconds[index];
    const end = alignment.characterEndTimesSeconds[index];
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start < previousStart ||
      end < previousEnd
    ) {
      return estimatedVisibleText();
    }
    previousStart = start;
    previousEnd = end;
    // Round outward so IEEE-754 representation can only delay a glyph by a
    // fraction of a millisecond, never show it early.
    if (Math.ceil(end * 1_000 * scale + offsetMs) > elapsedMs) break;
    visibleCount = index + 1;
  }

  return characters.slice(0, visibleCount).join("");
}
