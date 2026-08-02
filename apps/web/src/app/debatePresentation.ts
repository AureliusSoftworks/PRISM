import type {
  DebateEventV1,
  DebateEvidenceItemV1,
  DebateEvidencePacketV1,
  DebateEvidenceSourceV1,
  DebateTurnTimingV1,
} from "@localai/shared";
import { debateEstimatedSpeechDurationMs } from "@localai/shared";

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

export interface DebateSpokenLineClockState {
  elapsedMs: number;
  durationMs: number;
  progress: number;
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

export function debateSpokenLineClockState(
  event: Pick<
    DebateEventV1,
    "content" | "kind" | "speakerKind" | "gavelReason"
  >,
  speechTiming: { elapsedMs: number; durationMs: number } | null,
): DebateSpokenLineClockState | null {
  if (!speechTiming || debateEventSpokenLineDurationMs(event) === null) {
    return null;
  }
  const durationMs = Math.max(1, speechTiming.durationMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, speechTiming.elapsedMs));
  return {
    elapsedMs,
    durationMs,
    progress: elapsedMs / durationMs,
  };
}

export function formatDebateSpokenDuration(durationMs: number): string {
  const totalTenths = Math.max(0, Math.round(durationMs / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
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
  const playbackProgress = speechTiming
    ? Math.max(
        0,
        Math.min(
          1,
          speechTiming.elapsedMs / Math.max(1, speechTiming.durationMs),
        ),
      )
    : 0;
  const elapsedMs = event.timing.estimatedDurationMs * playbackProgress;
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
