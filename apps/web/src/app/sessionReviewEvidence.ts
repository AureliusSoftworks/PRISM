import type {
  ReplayDirectionEventV2,
  ReplayRecordingV1,
  ReplaySurfaceV1,
  ReplayVoiceTakeRecordV1,
} from "@localai/shared";
import {
  replayRecordingDetail,
  replayRecordingForSource,
} from "./replayClient.ts";

export const SESSION_REVIEW_FORMAT_VERSION = 2 as const;
const SESSION_REVIEW_DURATION_ALIGNMENT_TOLERANCE_MS = 500;

export type SessionReviewRecordingEvidence =
  | { state: "unavailable" }
  | { state: "missing" }
  | {
      state: "recorded";
      recordingId: string;
      availability: string;
      status: string;
      manifestVersion: 1 | 2 | null;
      audioDurationMs: number | null;
      timelineDurationMs: number | null;
      direction: ReplayDirectionEventV2[];
      voiceLineage?: Array<{
        sourceMessageId: string | null;
        speakerId: string;
        channel: string;
        requestedEngine: string | null;
        resolvedEngine: string | null;
        profileFingerprint: string;
        fallbackReason: string | null;
        status: string;
      }>;
      warningPresent: boolean;
      warningDetail: string | null;
      errorPresent: boolean;
      errorDetail: string | null;
    };

const PRIVATE_REVIEW_KEY =
  /(?:apiKey|providerKey|encryptionKey|url|uri|path|prompt|secret|credential|token|diagnostics|audioBytes|encodedChunks)$/iu;

/** One-line, length-capped rendering of a recording warning or error. */
function reviewSafeText(value: unknown): string | null {
  if (typeof value === "string") {
    const collapsed = value.replace(/\s+/gu, " ").trim();
    return collapsed ? collapsed.slice(0, 300) : null;
  }
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return reviewSafeText(message);
  }
  return null;
}

function safeReviewValue(
  value: unknown,
  seen: WeakSet<object>,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeReviewValue(item, seen));
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined || PRIVATE_REVIEW_KEY.test(key)) continue;
    output[key] = safeReviewValue(item, seen);
  }
  seen.delete(value);
  return output;
}

export function sessionReviewStableJson(value: unknown): string {
  const safe = safeReviewValue(value, new WeakSet<object>());
  if (safe === null) return "null";
  if (Array.isArray(safe)) {
    return `[${safe.map((item) => sessionReviewStableJson(item)).join(",")}]`;
  }
  if (typeof safe === "object") {
    const entries = Object.entries(safe as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${sessionReviewStableJson(item)}`,
      )
      .join(",")}}`;
  }
  const serialized = JSON.stringify(safe);
  return serialized === undefined ? JSON.stringify(String(safe)) : serialized;
}

function sessionReviewFingerprint(value: unknown): string {
  const input = sessionReviewStableJson(value);
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `voice-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sessionReviewVoiceFallbackReason(
  requestedEngine: string | null,
  resolvedEngine: string | null,
): string | null {
  if (!requestedEngine) return null;
  if (!resolvedEngine) return "unresolved_or_not_heard";
  const requested = requestedEngine.toLowerCase();
  const resolved = resolvedEngine.toLowerCase();
  if (
    requested === resolved ||
    (requested === "builtin" && resolved.startsWith("builtin-"))
  ) {
    return null;
  }
  return "resolved_engine_differs_from_request";
}

export function formatSessionReviewDuration(
  durationMs: number | null | undefined,
): string {
  if (durationMs == null || !Number.isFinite(durationMs)) return "None";
  const totalMs = Math.max(0, Math.round(durationMs));
  const milliseconds = totalMs % 1_000;
  const totalSeconds = Math.floor(totalMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

export function sessionReviewRecordingEvidenceFromRecording(
  recording: ReplayRecordingV1 | null,
  takes: readonly ReplayVoiceTakeRecordV1[] = [],
): SessionReviewRecordingEvidence {
  if (!recording) return { state: "missing" };
  const manifest = recording.manifest;
  return {
    state: "recorded",
    recordingId: recording.id,
    availability: recording.availability ?? "legacy_or_unknown",
    status: recording.status,
    manifestVersion: manifest?.v ?? null,
    audioDurationMs: recording.audioDurationMs ?? null,
    timelineDurationMs: recording.timeline?.durationMs ?? null,
    direction:
      manifest?.v === 2
        ? [...manifest.direction].sort(
            (left, right) =>
              left.sequence - right.sequence || left.atMs - right.atMs,
          )
        : [],
    voiceLineage: takes.map((take) => ({
      sourceMessageId: take.snapshot.sourceMessageId,
      speakerId: take.snapshot.speakerId,
      channel: take.snapshot.channel,
      requestedEngine: take.snapshot.requestedEngine,
      resolvedEngine: take.snapshot.resolvedEngine,
      profileFingerprint: sessionReviewFingerprint({
        profile: take.snapshot.profile,
        pronunciation: take.snapshot.resolvedPronunciation ?? null,
        speechprint: take.snapshot.resolvedSpeechprint ?? null,
      }),
      fallbackReason: sessionReviewVoiceFallbackReason(
        take.snapshot.requestedEngine,
        take.snapshot.resolvedEngine,
      ),
      status: take.status,
    })),
    warningPresent: Boolean(recording.warning),
    // A bare "yes" cannot be diagnosed. Review 2253b390 froze the session and
    // degraded its recording, and the only evidence naming the cause was the
    // text this export was throwing away. Scrubbed like every other value here.
    warningDetail: reviewSafeText(recording.warning),
    errorPresent: Boolean(recording.error),
    errorDetail: reviewSafeText(recording.error),
  };
}

export async function loadSessionReviewRecordingEvidence(
  surface: ReplaySurfaceV1,
  sourceId: string,
): Promise<SessionReviewRecordingEvidence> {
  try {
    const recording = await replayRecordingForSource(surface, sourceId);
    if (!recording) return { state: "missing" };
    try {
      const detail = await replayRecordingDetail(recording.id);
      return sessionReviewRecordingEvidenceFromRecording(
        detail.recording,
        detail.takes,
      );
    } catch {
      return sessionReviewRecordingEvidenceFromRecording(recording);
    }
  } catch {
    return { state: "unavailable" };
  }
}

export function sessionReviewRecordingSummaryLines(
  evidence: SessionReviewRecordingEvidence | undefined,
): string[] {
  if (!evidence || evidence.state === "unavailable") {
    return ["- Recording diagnostics: unavailable"];
  }
  if (evidence.state === "missing") {
    return ["- Recording diagnostics: no recording found"];
  }
  const voiceLineage = evidence.voiceLineage ?? [];
  const durationAlignment = (() => {
    if (
      evidence.audioDurationMs == null ||
      evidence.timelineDurationMs == null ||
      !Number.isFinite(evidence.audioDurationMs) ||
      !Number.isFinite(evidence.timelineDurationMs)
    ) {
      return "unavailable";
    }
    const deltaMs = Math.round(
      evidence.timelineDurationMs - evidence.audioDurationMs,
    );
    if (Math.abs(deltaMs) <= SESSION_REVIEW_DURATION_ALIGNMENT_TOLERANCE_MS) {
      return `matched (delta ${formatSessionReviewDuration(Math.abs(deltaMs))})`;
    }
    return deltaMs > 0
      ? `warning — compiled timeline exceeds faithful audio by ${formatSessionReviewDuration(deltaMs)}`
      : `warning — faithful audio exceeds compiled timeline by ${formatSessionReviewDuration(Math.abs(deltaMs))}`;
  })();
  return [
    "- Recording diagnostics: recorded",
    `- Recording ID: ${evidence.recordingId}`,
    `- Replay availability: ${evidence.availability}`,
    `- Recording status: ${evidence.status}`,
    `- Manifest version: ${evidence.manifestVersion ?? "None"}`,
    `- Faithful audio duration: ${formatSessionReviewDuration(evidence.audioDurationMs)}`,
    `- Compiled timeline duration: ${formatSessionReviewDuration(evidence.timelineDurationMs)}`,
    `- Recording duration alignment: ${durationAlignment}`,
    `- Private direction events: ${evidence.direction.length}`,
    `- Voice take lineage: ${voiceLineage.length}`,
    ...voiceLineage.map(
      (take) =>
        `  - Message ${take.sourceMessageId ?? "None"} | speaker ${take.speakerId} | ${take.channel} | requested ${take.requestedEngine ?? "None"} | resolved ${take.resolvedEngine ?? "None"} | profile ${take.profileFingerprint} | fallback ${take.fallbackReason ?? "none"} | ${take.status}`,
    ),
    `- Recording warning present: ${evidence.warningPresent ? (evidence.warningDetail ?? "yes (no detail recorded)") : "no"}`,
    `- Recording error present: ${evidence.errorPresent ? (evidence.errorDetail ?? "yes (no detail recorded)") : "no"}`,
  ];
}

/**
 * Cross-checks the human-readable transcript against the recording's own
 * direction log. A review export is only trustworthy if it can say what it is
 * missing: a Coffee export once shipped with five opening turns present in the
 * recording and absent from every visible section, and nothing in the artifact
 * disclosed it. Any message the recording directed but the transcript never
 * printed is named here.
 */
export function sessionReviewTranscriptCoverageLines(args: {
  evidence: SessionReviewRecordingEvidence | undefined;
  presentMessageIds: ReadonlySet<string>;
}): string[] {
  const { evidence } = args;
  if (
    !evidence ||
    evidence.state !== "recorded" ||
    evidence.manifestVersion !== 2
  ) {
    return ["Transcript coverage: no V2 direction log to reconcile against."];
  }
  const directedMessageIds: string[] = [];
  for (const event of evidence.direction) {
    const sourceMessageId = event.sourceMessageId?.trim();
    if (!sourceMessageId) continue;
    if (directedMessageIds.includes(sourceMessageId)) continue;
    directedMessageIds.push(sourceMessageId);
  }
  if (directedMessageIds.length === 0) {
    return ["Transcript coverage: the direction log names no source messages."];
  }
  const missing = directedMessageIds.filter(
    (messageId) => !args.presentMessageIds.has(messageId),
  );
  if (missing.length === 0) {
    return [
      `Transcript coverage: complete — all ${directedMessageIds.length} directed messages appear in the transcript.`,
    ];
  }
  return [
    `Transcript coverage: INCOMPLETE — ${missing.length} of ${directedMessageIds.length} directed messages are missing from the transcript below.`,
    "These turns were recorded and directed but never printed; treat the transcript as partial.",
    ...missing.map((messageId) => `- Missing message: ${messageId}`),
  ];
}

export function sessionReviewDirectionLines(
  evidence: SessionReviewRecordingEvidence | undefined,
): string[] {
  if (!evidence || evidence.state === "unavailable") {
    return ["No V2 direction log was available for review."];
  }
  if (evidence.state === "missing") {
    return ["No replay recording was found for this session."];
  }
  if (evidence.manifestVersion !== 2) {
    return ["This recording uses a legacy manifest without a V2 direction log."];
  }
  if (evidence.direction.length === 0) {
    return ["The V2 manifest contains no direction events."];
  }
  return evidence.direction.map((event) => {
    const sourceMessageId = event.sourceMessageId?.trim() || "none";
    return `- #${String(event.sequence).padStart(4, "0")} | atMs=${Math.max(
      0,
      Math.round(event.atMs),
    )} | endMs=${
      event.endMs == null ? "none" : Math.max(0, Math.round(event.endMs))
    } | kind=${event.kind} | sourceMessageId=${sourceMessageId} | payload=${sessionReviewStableJson(
      event.payload,
    )}`;
  });
}
