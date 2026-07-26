import type {
  ReplayDirectionEventV2,
  ReplayRecordingV1,
  ReplaySurfaceV1,
} from "@localai/shared";
import {
  replayRecordingDetail,
  replayRecordingForSource,
} from "./replayClient.ts";

export const SESSION_REVIEW_FORMAT_VERSION = 2 as const;

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
      warningPresent: boolean;
      errorPresent: boolean;
    };

const PRIVATE_REVIEW_KEY =
  /(?:apiKey|providerKey|encryptionKey|url|uri|path|prompt|secret|credential|token|diagnostics|audioBytes|encodedChunks)$/iu;

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
    warningPresent: Boolean(recording.warning),
    errorPresent: Boolean(recording.error),
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
      return sessionReviewRecordingEvidenceFromRecording(detail.recording);
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
  return [
    "- Recording diagnostics: recorded",
    `- Recording ID: ${evidence.recordingId}`,
    `- Replay availability: ${evidence.availability}`,
    `- Recording status: ${evidence.status}`,
    `- Manifest version: ${evidence.manifestVersion ?? "None"}`,
    `- Faithful audio duration: ${formatSessionReviewDuration(evidence.audioDurationMs)}`,
    `- Compiled timeline duration: ${formatSessionReviewDuration(evidence.timelineDurationMs)}`,
    `- Private direction events: ${evidence.direction.length}`,
    `- Recording warning present: ${evidence.warningPresent ? "yes (details withheld)" : "no"}`,
    `- Recording error present: ${evidence.errorPresent ? "yes (details withheld)" : "no"}`,
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
