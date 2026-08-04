import type {
  DebateEventV1,
  DebateEvidenceItemV1,
  DebateEvidencePacketV1,
  DebateEvidenceSourceV1,
  DebateSessionV1,
  DebateTurnTimingV1,
} from "@localai/shared";
import { debateEstimatedSpeechDurationMs } from "@localai/shared";

import type { SpeechCharacterAlignment } from "./speechRevealTimeline";

export const DEBATE_SOURCE_LINK_PREFIX = "prism-debate-source:";
export const DEBATE_EVIDENCE_LINK_PREFIX = "prism-debate-evidence:";

const EVIDENCE_MARKER =
  /\[\[(source|exhibit):([a-z0-9][a-z0-9_-]{0,47})\]\]/giu;

export function debateRevealDurationMs(spokenText: string): number {
  return debateEstimatedSpeechDurationMs(spokenText);
}

export function debateActiveDurationLabel(activeDurationMs: number): string {
  const minutes = Math.max(1, Math.round(activeDurationMs / 60_000));
  return `~${minutes} min active`;
}

/** Canonical final-text duration used when no live voice clock is available. */
export function debateEventSpokenLineDurationMs(
  event: Pick<
    DebateEventV1,
    "content" | "kind" | "speakerKind" | "gavelReason"
  >,
): number | null {
  if (
    event.speakerKind === "system" ||
    event.kind === "silence" ||
    (event.kind === "judge_gavel" && event.gavelReason === "intervention")
  ) {
    return null;
  }
  const durationMs = debateRevealDurationMs(event.content);
  return durationMs > 0 ? durationMs : null;
}

export function formatDebateSpokenDuration(durationMs: number): string {
  const totalTenths = Math.max(0, Math.round(durationMs / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

type DebateElapsedSession = Pick<
  DebateSessionV1,
  | "completedAt"
  | "createdAt"
  | "events"
  | "pausedAt"
  | "pausedDurationMs"
  | "status"
  | "updatedAt"
>;

/**
 * Wall-clock Debate runtime with explicit recesses removed. Generation and
 * player-wait time remain part of the live proceeding's overall elapsed time.
 */
export function debateLiveElapsedDurationMs(
  session: DebateElapsedSession,
  nowMs: number,
): number {
  const eventTimes = [...session.events]
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => ({ event, timeMs: Date.parse(event.createdAt) }))
    .filter(({ timeMs }) => Number.isFinite(timeMs));
  const createdAtMs = Date.parse(session.createdAt);
  const startedAtMs = Number.isFinite(createdAtMs)
    ? createdAtMs
    : (eventTimes[0]?.timeMs ?? nowMs);
  const terminalAtMs = Date.parse(
    session.completedAt ?? session.updatedAt,
  );
  const endAtMs =
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
      ? Number.isFinite(terminalAtMs)
        ? terminalAtMs
        : nowMs
      : nowMs;

  const hasSilentLifecycleTiming =
    typeof session.pausedDurationMs === "number" ||
    typeof session.pausedAt === "string";
  let recessDurationMs = Math.max(0, session.pausedDurationMs ?? 0);
  if (hasSilentLifecycleTiming) {
    const pausedAtMs = Date.parse(session.pausedAt ?? "");
    if (Number.isFinite(pausedAtMs)) {
      recessDurationMs += Math.max(0, endAtMs - pausedAtMs);
    }
  } else {
    // Backward compatibility for archived sessions that stored lifecycle
    // events before pause and resume became silent session metadata.
    let recessStartedAtMs: number | null = null;
    for (const { event, timeMs } of eventTimes) {
      if (timeMs < startedAtMs || timeMs > endAtMs) continue;
      if (event.stepKey === "pause" && recessStartedAtMs === null) {
        recessStartedAtMs = timeMs;
      } else if (event.stepKey === "resume" && recessStartedAtMs !== null) {
        recessDurationMs += Math.max(0, timeMs - recessStartedAtMs);
        recessStartedAtMs = null;
      }
    }
    if (recessStartedAtMs !== null) {
      recessDurationMs += Math.max(0, endAtMs - recessStartedAtMs);
    }
  }
  return Math.max(0, endAtMs - startedAtMs - recessDurationMs);
}

export function formatDebateElapsedDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface DebateTurnClockState {
  elapsedMs: number;
  limitMs: number;
  progress: number;
  remainingMs: number;
  status: "running" | "overtime";
  timing: DebateTurnTimingV1;
}

export function debateTurnClockState(
  event: DebateEventV1 | null,
  speechTiming: { elapsedMs: number; durationMs: number } | null,
): DebateTurnClockState | null {
  if (!event?.timing) return null;
  // Advance from the presentation clock itself. Scaling the authored duration
  // estimate across a shorter clip made displayed seconds pass too quickly.
  const elapsedMs = speechTiming
    ? Math.max(
        0,
        Math.min(
          Math.max(0, speechTiming.durationMs),
          speechTiming.elapsedMs,
        ),
      )
    : 0;
  const remainingMs = event.timing.limitMs - elapsedMs;
  return {
    elapsedMs,
    limitMs: event.timing.limitMs,
    progress: Math.max(0, Math.min(1, elapsedMs / event.timing.limitMs)),
    remainingMs,
    status: remainingMs < 0 ? "overtime" : "running",
    timing: event.timing,
  };
}

/** Late-clock threshold: last ~20% of the turn budget or already overtime. */
export const DEBATE_UTTERANCE_PACE_LATE_PROGRESS = 0.8;
/** Temporary pace delta applied to advocate voice when short on time (−1…1). */
export const DEBATE_UTTERANCE_PACE_BOOST = 0.35;

/**
 * Returns a temporary voice-profile pace boost for Forum advocate turns when
 * the turn clock is already overtime or the expected fill of the limit is late.
 * Omit speechProgress to use estimatedDurationMs / limitMs at utterance start.
 */
export function debateUtterancePaceBoost(
  timing: DebateTurnTimingV1 | null | undefined,
  speechProgress?: number | null,
): number {
  if (!timing || !(timing.limitMs > 0)) return 0;
  const progress =
    speechProgress != null && Number.isFinite(speechProgress)
      ? Math.max(0, Math.min(1, speechProgress))
      : Math.max(0, timing.estimatedDurationMs / timing.limitMs);
  const late =
    timing.status === "overtime" ||
    timing.overtimeMs > 0 ||
    progress >= DEBATE_UTTERANCE_PACE_LATE_PROGRESS;
  return late ? DEBATE_UTTERANCE_PACE_BOOST : 0;
}

export function debateAudioEnabled(args: {
  voiceMode: string;
  voiceVolume: number;
}): boolean {
  return args.voiceMode !== "mute" && args.voiceVolume > 0;
}

/** Procedural gavel Foley remains audible when speech is explicitly muted. */
export function debateGavelAudioEnabled(voiceVolume: number): boolean {
  return Number.isFinite(voiceVolume) && voiceVolume > 0;
}

export function debateVisibleContentAtProgress(
  content: string,
  progress: number,
): string {
  if (!content) return "";
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return "";
  if (clamped >= 1) return content;

  const target = Math.max(1, Math.floor(content.length * clamped));
  let end = target;

  const markerStart = content.lastIndexOf("[[", target);
  if (markerStart >= 0) {
    const markerEnd = content.indexOf("]]", markerStart);
    const marker = content.slice(markerStart, markerEnd + 2);
    if (
      markerEnd >= target &&
      /^\[\[(?:source|exhibit):[^\]]+\]\]$/iu.test(marker)
    ) {
      end = markerStart;
    }
  }

  const candidate = content.slice(0, end);
  const safeBoundary = Math.max(
    candidate.lastIndexOf(" "),
    candidate.lastIndexOf("\n"),
    candidate.lastIndexOf("."),
    candidate.lastIndexOf(","),
    candidate.lastIndexOf(";"),
    candidate.lastIndexOf(":"),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
  );
  if (safeBoundary >= Math.max(0, end - 22)) {
    end = safeBoundary + 1;
  }

  return content.slice(0, Math.max(0, end));
}

function debateAlignedSpokenProgress(args: {
  spokenText: string;
  elapsedMs: number;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
}): number {
  const durationMs = Math.max(1, args.durationMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, args.elapsedMs));
  if (elapsedMs >= durationMs) return 1;

  const spokenCharacters = Array.from(args.spokenText);
  const alignment = args.alignment;
  const alignedCount = alignment?.characters.length ?? 0;
  if (
    !alignment ||
    alignedCount === 0 ||
    alignedCount !== alignment.characterStartTimesSeconds.length ||
    alignedCount !== alignment.characterEndTimesSeconds.length
  ) {
    return elapsedMs / durationMs;
  }

  const elapsedSeconds = elapsedMs / 1_000;
  let completedAlignedCharacters = 0;
  for (let index = 0; index < alignedCount; index += 1) {
    const start = alignment.characterStartTimesSeconds[index];
    const end = alignment.characterEndTimesSeconds[index];
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start
    ) {
      return elapsedMs / durationMs;
    }
    if (end <= elapsedSeconds) completedAlignedCharacters = index + 1;
  }

  const exactAlignment = alignment.characters.join("") === args.spokenText;
  const completedSpokenCharacters = exactAlignment
    ? completedAlignedCharacters
    : Math.round(
        (completedAlignedCharacters / alignedCount) * spokenCharacters.length,
      );
  return Math.max(
    0,
    Math.min(
      1,
      completedSpokenCharacters / Math.max(1, spokenCharacters.length),
    ),
  );
}

/** Public transcript prefix synchronized to the real voice playback clock. */
export function debateVisibleContentAtSpeechTime(args: {
  content: string;
  spokenText: string;
  elapsedMs: number;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
}): string {
  return debateVisibleContentAtProgress(
    args.content,
    debateAlignedSpokenProgress(args),
  );
}

export function debateTranscriptIsAtLive(
  metrics: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  thresholdPx = 2,
): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <=
    thresholdPx
  );
}

export function debateTurnOwnerBotId(args: {
  thinkingBotId: string | null;
  presenting: boolean;
  presentationSpeakerBotId: string | null;
}): string | null {
  return (
    args.thinkingBotId ??
    (args.presenting ? args.presentationSpeakerBotId : null)
  );
}

export function debateMarkdownSource(
  content: string,
  evidence: DebateEvidencePacketV1,
): string {
  const allowed = new Set([
    ...evidence.sources.map((source) => source.id),
    ...(evidence.exhibits ?? []).map((exhibit) => exhibit.id),
  ]);
  return content.replace(
    EVIDENCE_MARKER,
    (_marker, _kind: string, rawId: string) => {
      const id = rawId.toLowerCase();
      return allowed.has(id)
        ? `[${id}](${DEBATE_EVIDENCE_LINK_PREFIX}${id})`
        : "";
    },
  );
}

export function debateEvidenceFromMarkdownHref(
  href: string | undefined,
  evidence: DebateEvidencePacketV1,
): DebateEvidenceItemV1 | null {
  if (!href) return null;
  const prefix = href.startsWith(DEBATE_EVIDENCE_LINK_PREFIX)
    ? DEBATE_EVIDENCE_LINK_PREFIX
    : href.startsWith(DEBATE_SOURCE_LINK_PREFIX)
      ? DEBATE_SOURCE_LINK_PREFIX
      : null;
  if (!prefix) return null;
  const id = href.slice(prefix.length).toLowerCase();
  const source = evidence.sources.find((candidate) => candidate.id === id);
  if (source) return { kind: "source", value: source };
  const exhibit = (evidence.exhibits ?? []).find(
    (candidate) => candidate.id === id,
  );
  return exhibit ? { kind: "exhibit", value: exhibit } : null;
}

export function debateSourceFromMarkdownHref(
  href: string | undefined,
  evidence: DebateEvidencePacketV1,
): DebateEvidenceSourceV1 | null {
  const item = debateEvidenceFromMarkdownHref(href, evidence);
  return item?.kind === "source" ? item.value : null;
}

export type DebateGalleryReaction =
  "attentive" | "divided" | "evidence" | "question" | "concession";

export function debateGalleryReaction(content: string): DebateGalleryReaction {
  const normalized = content.toLowerCase();
  if (/\[\[(?:source|exhibit):[^\]]+\]\]/u.test(normalized)) {
    return "evidence";
  }
  if (
    /\b(?:i concede|we concede|fair point|grant that|acknowledge)\b/u.test(
      normalized,
    )
  ) {
    return "concession";
  }
  if (content.includes("?")) return "question";
  if (/\b(?:but|however|instead|yet|cannot|wrong|reject)\b/u.test(normalized)) {
    return "divided";
  }
  return "attentive";
}

export function debateGalleryReactingIndices(
  content: string,
  sequence: number,
  seatCount = 7,
): number[] {
  if (!content.trim() || seatCount <= 0) return [];
  const clauseCount = Math.max(
    1,
    content.split(/[.!?;:](?:\s|$)/u).filter((part) => part.trim()).length,
  );
  const first =
    Math.abs(sequence * 5 + clauseCount * 3 + content.length) % seatCount;
  const second =
    (first + 2 + (content.length % Math.max(2, seatCount - 1))) % seatCount;
  return first === second ? [first] : [first, second];
}
