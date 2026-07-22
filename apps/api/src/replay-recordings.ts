import { createHash, randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import {
  REPLAY_VIDEO_FPS,
  REPLAY_VIDEO_HEIGHT,
  REPLAY_VIDEO_WIDTH,
  compileReplayTimelineV1,
  replayManifestToMarkdownV1,
  replayManifestV1IsValid,
  replayTimelineToWebVttV1,
  type ReplayCaptureModeV1,
  type ReplayCaptureReportV1,
  type ReplayManifestV1,
  type ReplayRecordingStatusV1,
  type ReplayRecordingV1,
  type ReplaySurfaceV1,
  type ReplayTimelineV1,
  type ReplayVoiceTakeRecordV1,
  type ReplayVoiceTakeV1,
} from "@localai/shared";
import { resolveAbsoluteUnderDataRoot } from "./image-storage.ts";
import {
  finalizeReplayUpload,
  listReplayRecordingDirectoryIds,
  removeReplayFile,
  removeReplayRecordingDirectory,
  replayUploadRelativePath,
  replayVideoRelativePath,
  replayVoiceTakeRelativePath,
  writeReplayBytesAtomically,
  writeReplayRenderChunk,
} from "./replay-storage.ts";

const REPLAY_MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
const REPLAY_TIMELINE_MAX_BYTES = 4 * 1024 * 1024;
const REPLAY_CAPTURE_REPORT_MAX_BYTES = 64 * 1024;
const REPLAY_TAKE_SNAPSHOT_MAX_BYTES = 256 * 1024;
export const REPLAY_RENDER_CHUNK_MAX_BYTES = 8 * 1024 * 1024;

type ReplayRecordingRow = {
  id: string;
  user_id: string;
  surface: ReplaySurfaceV1;
  source_id: string;
  status: ReplayRecordingStatusV1;
  capture_mode: ReplayCaptureModeV1;
  capture_report_json: string | null;
  progress: number;
  manifest_json: string | null;
  timeline_json: string | null;
  render_token: string | null;
  upload_rel_path: string | null;
  video_rel_path: string | null;
  codec: string | null;
  content_type: string | null;
  width: number;
  height: number;
  fps: number;
  duration_ms: number | null;
  size_bytes: number | null;
  warning: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type ReplayVoiceTakeRow = {
  id: string;
  user_id: string;
  recording_id: string;
  snapshot_json: string;
  status: ReplayVoiceTakeRecordV1["status"];
  audio_rel_path: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

function replayId(): string {
  return randomBytes(12).toString("hex");
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function boundedMessage(value: unknown, max = 1_000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim().slice(0, max);
  return normalized || null;
}

function assertLiveReplayTimeline(
  manifest: ReplayManifestV1,
  timeline: ReplayTimelineV1,
): void {
  if (
    !timeline ||
    typeof timeline !== "object" ||
    timeline.v !== 1 ||
    !Number.isFinite(timeline.durationMs) ||
    timeline.durationMs <= 0 ||
    timeline.durationMs > 4 * 60 * 60 * 1_000 ||
    !Array.isArray(timeline.beats)
  ) {
    throw new Error("Live replay timeline is invalid.");
  }
  const messageIds = new Set(
    manifest.utterances.map((utterance) => utterance.sourceMessageId),
  );
  const beatIds = new Set<string>();
  for (const beat of timeline.beats) {
    if (
      !beat.id?.trim() ||
      beatIds.has(beat.id) ||
      !Number.isFinite(beat.startMs) ||
      !Number.isFinite(beat.endMs) ||
      beat.startMs < 0 ||
      beat.endMs <= beat.startMs ||
      beat.endMs > timeline.durationMs + 1_000 ||
      (beat.sourceMessageId !== null && !messageIds.has(beat.sourceMessageId))
    ) {
      throw new Error("Live replay timeline contains an invalid beat.");
    }
    beatIds.add(beat.id);
  }
}

function replayCaptureReportIsValid(
  report: ReplayCaptureReportV1 | null | undefined,
): report is ReplayCaptureReportV1 {
  if (!report || typeof report !== "object") return false;
  const counts = [
    report.capturedFrames,
    report.heldFrames,
    report.audioFrames,
    report.audioDiscontinuities,
    report.visibilityInterruptions,
    report.longestVisualGapMs,
  ];
  return (
    typeof report.startedAt === "string" &&
    report.startedAt.length <= 80 &&
    (report.completedAt === null ||
      (typeof report.completedAt === "string" && report.completedAt.length <= 80)) &&
    report.degradedReason === null &&
    counts.every((value) => Number.isFinite(value) && value >= 0)
  );
}

function assertReplaySourceOwned(
  db: DatabaseSync,
  userId: string,
  surface: ReplaySurfaceV1,
  sourceId: string,
): void {
  const row = surface === "signal"
    ? db
        .prepare("SELECT id FROM botcast_episodes WHERE id = ? AND user_id = ?")
        .get(sourceId, userId)
    : db
        .prepare(
          "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND conversation_mode = 'coffee'",
        )
        .get(sourceId, userId);
  if (!row) throw new Error(`Unknown ${surface} replay source.`);
}

function mapVoiceTakeRow(row: ReplayVoiceTakeRow): ReplayVoiceTakeRecordV1 {
  const snapshot = parseJson<ReplayVoiceTakeV1>(row.snapshot_json);
  if (!snapshot) throw new Error("Stored replay voice take is invalid.");
  return {
    id: row.id,
    recordingId: row.recording_id,
    snapshot,
    status: row.status,
    audioUrl: row.audio_rel_path
      ? `/api/replays/${encodeURIComponent(row.recording_id)}/takes/${encodeURIComponent(row.id)}/audio`
      : null,
    audioContentType: row.content_type,
    audioSizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecordingRow(row: ReplayRecordingRow): ReplayRecordingV1 {
  const hasVideo = Boolean(
    row.video_rel_path && existsSync(resolveAbsoluteUnderDataRoot(row.video_rel_path)),
  );
  return {
    id: row.id,
    surface: row.surface,
    sourceId: row.source_id,
    status: row.status,
    captureMode: row.capture_mode === "live" ? "live" : "rebuild",
    captureReport: parseJson<ReplayCaptureReportV1>(row.capture_report_json),
    progress: Math.max(0, Math.min(1, Number(row.progress) || 0)),
    manifest: parseJson<ReplayManifestV1>(row.manifest_json),
    timeline: parseJson<ReplayTimelineV1>(row.timeline_json),
    width: row.width,
    height: row.height,
    fps: row.fps,
    durationMs: row.duration_ms,
    sizeBytes: row.size_bytes,
    codec: row.codec,
    contentType: row.content_type,
    videoUrl: hasVideo ? `/api/replays/${encodeURIComponent(row.id)}/video` : null,
    transcriptVttUrl: row.manifest_json
      ? `/api/replays/${encodeURIComponent(row.id)}/transcript.vtt`
      : null,
    transcriptMarkdownUrl: row.manifest_json
      ? `/api/replays/${encodeURIComponent(row.id)}/transcript.md`
      : null,
    warning: row.warning,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordingRow(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
): ReplayRecordingRow | null {
  return (db
    .prepare("SELECT * FROM replay_recordings WHERE id = ? AND user_id = ?")
    .get(recordingId, userId) as ReplayRecordingRow | undefined) ?? null;
}

export function replayVoiceTakesForRecording(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
): ReplayVoiceTakeRecordV1[] {
  return (
    db
      .prepare(
        "SELECT * FROM replay_voice_takes WHERE user_id = ? AND recording_id = ? ORDER BY created_at, rowid",
      )
      .all(userId, recordingId) as ReplayVoiceTakeRow[]
  ).map(mapVoiceTakeRow);
}

export function ensureReplayRecording(
  db: DatabaseSync,
  userId: string,
  surface: ReplaySurfaceV1,
  sourceId: string,
): ReplayRecordingV1 {
  assertReplaySourceOwned(db, userId, surface, sourceId);
  const existing = db
    .prepare(
      "SELECT * FROM replay_recordings WHERE user_id = ? AND surface = ? AND source_id = ?",
    )
    .get(userId, surface, sourceId) as ReplayRecordingRow | undefined;
  if (existing) return mapRecordingRow(existing);
  const id = replayId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO replay_recordings
       (id, user_id, surface, source_id, status, progress, manifest_version,
        width, height, fps, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'collecting', 0, 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    surface,
    sourceId,
    REPLAY_VIDEO_WIDTH,
    REPLAY_VIDEO_HEIGHT,
    REPLAY_VIDEO_FPS,
    now,
    now,
  );
  return mapRecordingRow(recordingRow(db, userId, id)!);
}

export function startLiveReplayRecording(
  db: DatabaseSync,
  userId: string,
  surface: ReplaySurfaceV1,
  sourceId: string,
): { recording: ReplayRecordingV1; renderToken: string } {
  if (surface !== "signal") {
    throw new Error("Live replay recording is currently available only for Signal.");
  }
  const recording = ensureReplayRecording(db, userId, surface, sourceId);
  const row = recordingRow(db, userId, recording.id)!;
  removeReplayFile(row.upload_rel_path);
  removeReplayFile(row.video_rel_path);
  const renderToken = randomBytes(18).toString("hex");
  const uploadRelativePath = replayUploadRelativePath(
    userId,
    recording.id,
    renderToken,
  );
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_recordings
        SET status = 'rendering', progress = 0.01, capture_mode = 'live',
            capture_report_json = NULL, render_token = ?, upload_rel_path = ?,
            video_rel_path = NULL, codec = NULL, content_type = NULL,
            duration_ms = NULL, size_bytes = NULL, warning = NULL,
            error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(renderToken, uploadRelativePath, now, recording.id, userId);
  return {
    recording: mapRecordingRow(recordingRow(db, userId, recording.id)!),
    renderToken,
  };
}

export function getReplayRecording(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
): { recording: ReplayRecordingV1; takes: ReplayVoiceTakeRecordV1[] } | null {
  const row = recordingRow(db, userId, recordingId);
  if (!row) return null;
  return {
    recording: mapRecordingRow(row),
    takes: replayVoiceTakesForRecording(db, userId, recordingId),
  };
}

export function listReplayRecordings(
  db: DatabaseSync,
  userId: string,
  filter: {
    surface?: ReplaySurfaceV1 | null;
    sourceId?: string | null;
    status?: ReplayRecordingStatusV1 | null;
  } = {},
): ReplayRecordingV1[] {
  pruneOrphanedReplayMedia(db, userId);
  const clauses = ["user_id = ?"];
  const params: Array<string> = [userId];
  if (filter.surface) {
    clauses.push("surface = ?");
    params.push(filter.surface);
  }
  if (filter.sourceId) {
    clauses.push("source_id = ?");
    params.push(filter.sourceId);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  return (
    db
      .prepare(
        `SELECT * FROM replay_recordings WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`,
      )
      .all(...params) as ReplayRecordingRow[]
  ).map(mapRecordingRow);
}

export function upsertReplayVoiceTake(
  db: DatabaseSync,
  userId: string,
  surface: ReplaySurfaceV1,
  sourceId: string,
  snapshot: ReplayVoiceTakeV1,
): ReplayVoiceTakeRecordV1 {
  if (
    snapshot.v !== 1 ||
    !snapshot.sourceKey?.trim() ||
    !snapshot.speakerId?.trim() ||
    !snapshot.spokenText?.trim()
  ) {
    throw new Error("Replay voice take is incomplete.");
  }
  const snapshotJson = JSON.stringify(snapshot);
  if (Buffer.byteLength(snapshotJson) > REPLAY_TAKE_SNAPSHOT_MAX_BYTES) {
    throw new Error("Replay voice take is too large.");
  }
  const recording = ensureReplayRecording(db, userId, surface, sourceId);
  const existing = db
    .prepare(
      "SELECT * FROM replay_voice_takes WHERE recording_id = ? AND source_key = ?",
    )
    .get(recording.id, snapshot.sourceKey) as ReplayVoiceTakeRow | undefined;
  if (existing) return mapVoiceTakeRow(existing);
  const id = replayId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO replay_voice_takes
       (id, user_id, recording_id, source_key, source_message_id,
        source_event_id, snapshot_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?)`,
  ).run(
    id,
    userId,
    recording.id,
    snapshot.sourceKey,
    snapshot.sourceMessageId,
    snapshot.sourceEventId,
    snapshotJson,
    now,
    now,
  );
  return mapVoiceTakeRow(
    db.prepare("SELECT * FROM replay_voice_takes WHERE id = ?").get(id) as ReplayVoiceTakeRow,
  );
}

export function updateReplayVoiceTakeSnapshot(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  takeId: string,
  patch: {
    durationMs?: number | null;
    resolvedEngine?: string | null;
    alignment?: ReplayVoiceTakeV1["alignment"];
    sourceMessageId?: string | null;
  },
): ReplayVoiceTakeRecordV1 | null {
  const row = db
    .prepare(
      "SELECT * FROM replay_voice_takes WHERE id = ? AND recording_id = ? AND user_id = ?",
    )
    .get(takeId, recordingId, userId) as ReplayVoiceTakeRow | undefined;
  if (!row) return null;
  const snapshot = parseJson<ReplayVoiceTakeV1>(row.snapshot_json);
  if (!snapshot) throw new Error("Stored replay voice take is invalid.");
  const durationMs =
    typeof patch.durationMs === "number" && Number.isFinite(patch.durationMs)
      ? Math.max(1, Math.min(120_000, Math.round(patch.durationMs)))
      : snapshot.durationMs;
  const next: ReplayVoiceTakeV1 = {
    ...snapshot,
    durationMs,
    resolvedEngine:
      patch.resolvedEngine === undefined
        ? snapshot.resolvedEngine
        : boundedMessage(patch.resolvedEngine, 80),
    alignment:
      patch.alignment === undefined ? snapshot.alignment : patch.alignment,
    sourceMessageId:
      patch.sourceMessageId === undefined
        ? snapshot.sourceMessageId
        : boundedMessage(patch.sourceMessageId, 180),
  };
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_voice_takes
        SET source_message_id = ?, snapshot_json = ?, updated_at = ?
      WHERE id = ? AND recording_id = ? AND user_id = ?`,
  ).run(next.sourceMessageId, JSON.stringify(next), now, takeId, recordingId, userId);
  return mapVoiceTakeRow(
    db.prepare("SELECT * FROM replay_voice_takes WHERE id = ?").get(takeId) as ReplayVoiceTakeRow,
  );
}

export function storeReplayVoiceTakeAudio(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  takeId: string,
  bytes: Uint8Array,
  contentType: string,
): ReplayVoiceTakeRecordV1 | null {
  const row = db
    .prepare(
      "SELECT * FROM replay_voice_takes WHERE id = ? AND recording_id = ? AND user_id = ?",
    )
    .get(takeId, recordingId, userId) as ReplayVoiceTakeRow | undefined;
  if (!row) return null;
  const relativePath = replayVoiceTakeRelativePath({
    userId,
    recordingId,
    takeId,
    contentType,
  });
  writeReplayBytesAtomically(relativePath, bytes);
  if (row.audio_rel_path && row.audio_rel_path !== relativePath) {
    removeReplayFile(row.audio_rel_path);
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_voice_takes
        SET status = 'captured', audio_rel_path = ?, content_type = ?,
            size_bytes = ?, updated_at = ?
      WHERE id = ? AND recording_id = ? AND user_id = ?`,
  ).run(relativePath, contentType, bytes.byteLength, now, takeId, recordingId, userId);
  return mapVoiceTakeRow(
    db.prepare("SELECT * FROM replay_voice_takes WHERE id = ?").get(takeId) as ReplayVoiceTakeRow,
  );
}

export function queueReplayRecording(
  db: DatabaseSync,
  userId: string,
  manifest: ReplayManifestV1,
): ReplayRecordingV1 {
  if (!replayManifestV1IsValid(manifest)) throw new Error("Replay manifest is invalid.");
  const manifestJson = JSON.stringify(manifest);
  if (Buffer.byteLength(manifestJson) > REPLAY_MANIFEST_MAX_BYTES) {
    throw new Error("Replay manifest is too large.");
  }
  const recording = ensureReplayRecording(db, userId, manifest.surface, manifest.sourceId);
  const row = recordingRow(db, userId, recording.id)!;
  const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
  const takes = replayVoiceTakesForRecording(db, userId, recording.id);
  const timeline = compileReplayTimelineV1(manifest, takes);
  const now = new Date().toISOString();
  const unchangedReady =
    row.manifest_json === manifestJson &&
    (row.status === "ready" || row.status === "ready_with_warnings");
  if (unchangedReady) return mapRecordingRow(row);
  if (row.capture_mode === "live") removeReplayFile(row.upload_rel_path);
  db.prepare(
    `UPDATE replay_recordings
        SET status = 'queued', progress = 0, capture_mode = 'rebuild',
            manifest_version = 1, manifest_json = ?, manifest_hash = ?, timeline_json = ?,
            transcript_vtt = ?, transcript_markdown = ?, render_token = NULL,
            upload_rel_path = NULL, warning = NULL, error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    manifestJson,
    manifestHash,
    JSON.stringify(timeline),
    replayTimelineToWebVttV1(timeline),
    replayManifestToMarkdownV1(manifest, timeline),
    now,
    recording.id,
    userId,
  );
  return mapRecordingRow(recordingRow(db, userId, recording.id)!);
}

export function claimNextReplayRecording(
  db: DatabaseSync,
  userId: string,
  filters: {
    surface?: ReplaySurfaceV1;
    sourceId?: string;
  } = {},
): { recording: ReplayRecordingV1; takes: ReplayVoiceTakeRecordV1[]; renderToken: string } | null {
  const staleBefore = new Date(Date.now() - 90_000).toISOString();
  const interrupted = db
    .prepare(
      `SELECT upload_rel_path FROM replay_recordings
        WHERE user_id = ?
          AND status IN ('preparing_audio', 'rendering')
          AND updated_at < ?`,
    )
    .all(userId, staleBefore) as Array<{ upload_rel_path: string | null }>;
  for (const row of interrupted) removeReplayFile(row.upload_rel_path);
  db.prepare(
    `UPDATE replay_recordings
        SET status = CASE
              WHEN manifest_json IS NULL THEN 'collecting'
              ELSE 'queued'
            END,
            progress = 0, capture_mode = 'rebuild', render_token = NULL,
            upload_rel_path = NULL,
            warning = 'Interrupted replay render restarted safely.',
            updated_at = ?
      WHERE user_id = ?
        AND status IN ('preparing_audio', 'rendering')
        AND updated_at < ?`,
  ).run(new Date().toISOString(), userId, staleBefore);
  const candidate = db
    .prepare(
      `SELECT * FROM replay_recordings
        WHERE user_id = ? AND status = 'queued' AND manifest_json IS NOT NULL
          AND (? IS NULL OR surface = ?)
          AND (? IS NULL OR source_id = ?)
        ORDER BY updated_at, rowid LIMIT 1`,
    )
    .get(
      userId,
      filters.surface ?? null,
      filters.surface ?? null,
      filters.sourceId ?? null,
      filters.sourceId ?? null,
    ) as ReplayRecordingRow | undefined;
  if (!candidate) return null;
  const renderToken = randomBytes(18).toString("hex");
  const uploadRelativePath = replayUploadRelativePath(userId, candidate.id, renderToken);
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE replay_recordings
        SET status = 'preparing_audio', progress = 0.01,
            capture_mode = 'rebuild', render_token = ?, upload_rel_path = ?,
            error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'queued'`,
  ).run(renderToken, uploadRelativePath, now, candidate.id, userId);
  if (Number(result.changes ?? 0) === 0) return null;
  return {
    recording: mapRecordingRow(recordingRow(db, userId, candidate.id)!),
    takes: replayVoiceTakesForRecording(db, userId, candidate.id),
    renderToken,
  };
}

function requireActiveRender(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  renderToken: string,
): ReplayRecordingRow {
  const row = recordingRow(db, userId, recordingId);
  if (
    !row ||
    row.render_token !== renderToken ||
    (row.status !== "preparing_audio" && row.status !== "rendering")
  ) {
    throw new Error("Replay render lease is no longer active.");
  }
  return row;
}

export function updateReplayRenderProgress(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  renderToken: string,
  status: "preparing_audio" | "rendering",
  progress: number,
): ReplayRecordingV1 {
  requireActiveRender(db, userId, recordingId, renderToken);
  const boundedProgress = Math.max(0.01, Math.min(0.99, Number(progress) || 0));
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_recordings SET status = ?, progress = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND render_token = ?`,
  ).run(status, boundedProgress, now, recordingId, userId, renderToken);
  return mapRecordingRow(recordingRow(db, userId, recordingId)!);
}

export function storeReplayRenderChunk(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  renderToken: string,
  position: number,
  bytes: Uint8Array,
): number {
  const row = requireActiveRender(db, userId, recordingId, renderToken);
  if (!row.upload_rel_path) throw new Error("Replay render upload is not initialized.");
  const sizeBytes = writeReplayRenderChunk({
    relativePath: row.upload_rel_path,
    position,
    bytes,
  });
  db.prepare(
    `UPDATE replay_recordings SET updated_at = ?
      WHERE id = ? AND user_id = ? AND render_token = ?`,
  ).run(new Date().toISOString(), recordingId, userId, renderToken);
  return sizeBytes;
}

export function completeLiveReplayRecording(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  renderToken: string,
  input: {
    manifest: ReplayManifestV1;
    timeline: ReplayTimelineV1;
    captureReport: ReplayCaptureReportV1;
    contentType: "video/mp4" | "video/webm";
    codec: string;
    durationMs: number;
  },
): ReplayRecordingV1 {
  const row = requireActiveRender(db, userId, recordingId, renderToken);
  if (row.capture_mode !== "live" || !row.upload_rel_path) {
    throw new Error("Live replay upload is not active.");
  }
  if (
    !replayManifestV1IsValid(input.manifest) ||
    input.manifest.surface !== row.surface ||
    input.manifest.sourceId !== row.source_id
  ) {
    throw new Error("Live replay manifest does not match its source.");
  }
  assertLiveReplayTimeline(input.manifest, input.timeline);
  if (!replayCaptureReportIsValid(input.captureReport)) {
    throw new Error("Live replay capture report is invalid.");
  }
  const manifestJson = JSON.stringify(input.manifest);
  const timelineJson = JSON.stringify(input.timeline);
  const captureReportJson = JSON.stringify(input.captureReport);
  if (Buffer.byteLength(manifestJson) > REPLAY_MANIFEST_MAX_BYTES) {
    throw new Error("Replay manifest is too large.");
  }
  if (Buffer.byteLength(timelineJson) > REPLAY_TIMELINE_MAX_BYTES) {
    throw new Error("Replay timeline is too large.");
  }
  if (
    Buffer.byteLength(captureReportJson) > REPLAY_CAPTURE_REPORT_MAX_BYTES
  ) {
    throw new Error("Live replay capture report is invalid.");
  }
  const videoRelativePath = replayVideoRelativePath({
    userId,
    recordingId,
    contentType: input.contentType,
  });
  const { sizeBytes } = finalizeReplayUpload({
    uploadRelativePath: row.upload_rel_path,
    videoRelativePath,
    contentType: input.contentType,
  });
  const now = new Date().toISOString();
  const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
  db.prepare(
    `UPDATE replay_recordings
        SET status = 'ready', progress = 1, capture_mode = 'live',
            capture_report_json = ?, manifest_version = 1,
            manifest_json = ?, manifest_hash = ?, timeline_json = ?,
            transcript_vtt = ?, transcript_markdown = ?,
            video_rel_path = ?, upload_rel_path = NULL, render_token = NULL,
            content_type = ?, codec = ?, duration_ms = ?, size_bytes = ?,
            warning = NULL, error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ? AND render_token = ?`,
  ).run(
    captureReportJson,
    manifestJson,
    manifestHash,
    timelineJson,
    replayTimelineToWebVttV1(input.timeline),
    replayManifestToMarkdownV1(input.manifest, input.timeline),
    videoRelativePath,
    input.contentType,
    boundedMessage(input.codec, 120),
    Math.max(1, Math.round(input.durationMs || input.timeline.durationMs)),
    sizeBytes,
    now,
    recordingId,
    userId,
    renderToken,
  );
  return mapRecordingRow(recordingRow(db, userId, recordingId)!);
}

export function abortLiveReplayRecording(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  renderToken: string,
  reason: unknown,
  captureReport: ReplayCaptureReportV1 | null = null,
): ReplayRecordingV1 {
  const row = requireActiveRender(db, userId, recordingId, renderToken);
  if (row.capture_mode !== "live") {
    throw new Error("Live replay upload is not active.");
  }
  removeReplayFile(row.upload_rel_path);
  const reportJson = captureReport ? JSON.stringify(captureReport) : null;
  const nextStatus = row.manifest_json ? "queued" : "collecting";
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_recordings
        SET status = ?, progress = 0, capture_mode = 'rebuild',
            capture_report_json = ?, render_token = NULL,
            upload_rel_path = NULL, warning = ?, error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    nextStatus,
    reportJson && Buffer.byteLength(reportJson) <= REPLAY_CAPTURE_REPORT_MAX_BYTES
      ? reportJson
      : null,
    boundedMessage(reason, 1_000) ??
      "Live recording was interrupted. PRISM will rebuild it safely.",
    now,
    recordingId,
    userId,
  );
  return mapRecordingRow(recordingRow(db, userId, recordingId)!);
}

export function completeReplayRender(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  renderToken: string,
  metadata: {
    contentType: "video/mp4" | "video/webm";
    codec: string;
    durationMs: number;
    warning?: string | null;
  },
): ReplayRecordingV1 {
  const row = requireActiveRender(db, userId, recordingId, renderToken);
  if (!row.upload_rel_path || !row.manifest_json) {
    throw new Error("Replay render upload is incomplete.");
  }
  const videoRelativePath = replayVideoRelativePath({
    userId,
    recordingId,
    contentType: metadata.contentType,
  });
  const { sizeBytes } = finalizeReplayUpload({
    uploadRelativePath: row.upload_rel_path,
    videoRelativePath,
    contentType: metadata.contentType,
  });
  const manifest = parseJson<ReplayManifestV1>(row.manifest_json);
  if (!manifest) throw new Error("Stored replay manifest is invalid.");
  const takes = replayVoiceTakesForRecording(db, userId, recordingId);
  const timeline = compileReplayTimelineV1(manifest, takes);
  const warning = boundedMessage(metadata.warning, 1_000);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_recordings
        SET status = ?, progress = 1, capture_mode = 'rebuild',
            timeline_json = ?, transcript_vtt = ?, transcript_markdown = ?,
            video_rel_path = ?, upload_rel_path = NULL,
            render_token = NULL, content_type = ?, codec = ?, duration_ms = ?,
            size_bytes = ?, warning = ?, error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    warning ? "ready_with_warnings" : "ready",
    JSON.stringify(timeline),
    replayTimelineToWebVttV1(timeline),
    replayManifestToMarkdownV1(manifest, timeline),
    videoRelativePath,
    metadata.contentType,
    boundedMessage(metadata.codec, 120),
    Math.max(1, Math.round(metadata.durationMs || timeline.durationMs)),
    sizeBytes,
    warning,
    now,
    recordingId,
    userId,
  );
  return mapRecordingRow(recordingRow(db, userId, recordingId)!);
}

export function failReplayRender(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  renderToken: string,
  error: unknown,
): ReplayRecordingV1 {
  const row = requireActiveRender(db, userId, recordingId, renderToken);
  removeReplayFile(row.upload_rel_path);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_recordings
        SET status = 'failed', progress = 0, capture_mode = 'rebuild',
            render_token = NULL,
            upload_rel_path = NULL, error = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    boundedMessage(error instanceof Error ? error.message : error, 1_000) ??
      "Replay rendering failed.",
    now,
    recordingId,
    userId,
  );
  return mapRecordingRow(recordingRow(db, userId, recordingId)!);
}

export function retryReplayRecording(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
): ReplayRecordingV1 | null {
  const row = recordingRow(db, userId, recordingId);
  if (!row || !row.manifest_json) return null;
  removeReplayFile(row.upload_rel_path);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE replay_recordings
        SET status = 'queued', progress = 0, capture_mode = 'rebuild',
            render_token = NULL, upload_rel_path = NULL, warning = NULL,
            error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(now, recordingId, userId);
  return mapRecordingRow(recordingRow(db, userId, recordingId)!);
}

export function deleteReplayRecordingMedia(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
): ReplayRecordingV1 | null {
  const row = recordingRow(db, userId, recordingId);
  if (!row) return null;
  removeReplayRecordingDirectory(userId, recordingId);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      `UPDATE replay_voice_takes
          SET status = 'planned', audio_rel_path = NULL, content_type = NULL,
              size_bytes = NULL, updated_at = ?
        WHERE user_id = ? AND recording_id = ?`,
    ).run(now, userId, recordingId);
    db.prepare(
      `UPDATE replay_recordings
          SET status = 'collecting', progress = 0,
              capture_mode = 'rebuild', render_token = NULL,
              upload_rel_path = NULL, video_rel_path = NULL, codec = NULL,
              content_type = NULL, duration_ms = NULL, size_bytes = NULL,
              warning = 'Recording deleted. The saved transcript can rebuild it.',
              error = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).run(now, recordingId, userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return mapRecordingRow(recordingRow(db, userId, recordingId)!);
}

export function replayVideoFile(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
): { absolutePath: string; contentType: string; sizeBytes: number } | null {
  const row = recordingRow(db, userId, recordingId);
  if (!row?.video_rel_path || !row.content_type) return null;
  const absolutePath = resolveAbsoluteUnderDataRoot(row.video_rel_path);
  if (!existsSync(absolutePath)) return null;
  return { absolutePath, contentType: row.content_type, sizeBytes: statSync(absolutePath).size };
}

export function replayVoiceTakeAudioFile(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  takeId: string,
): { absolutePath: string; contentType: string; sizeBytes: number } | null {
  const row = db
    .prepare(
      `SELECT audio_rel_path, content_type FROM replay_voice_takes
        WHERE id = ? AND recording_id = ? AND user_id = ?`,
    )
    .get(takeId, recordingId, userId) as
    | { audio_rel_path: string | null; content_type: string | null }
    | undefined;
  if (!row?.audio_rel_path || !row.content_type) return null;
  const absolutePath = resolveAbsoluteUnderDataRoot(row.audio_rel_path);
  if (!existsSync(absolutePath)) return null;
  return { absolutePath, contentType: row.content_type, sizeBytes: statSync(absolutePath).size };
}

export function replayTranscript(
  db: DatabaseSync,
  userId: string,
  recordingId: string,
  format: "vtt" | "markdown",
): string | null {
  const row = db
    .prepare(
      "SELECT transcript_vtt, transcript_markdown FROM replay_recordings WHERE id = ? AND user_id = ?",
    )
    .get(recordingId, userId) as
    | { transcript_vtt: string | null; transcript_markdown: string | null }
    | undefined;
  return format === "vtt" ? (row?.transcript_vtt ?? null) : (row?.transcript_markdown ?? null);
}

export function pruneOrphanedReplayMedia(db: DatabaseSync, userId: string): void {
  const known = new Set(
    (
      db.prepare("SELECT id FROM replay_recordings WHERE user_id = ?").all(userId) as Array<{
        id: string;
      }>
    ).map((row) => row.id),
  );
  for (const recordingId of listReplayRecordingDirectoryIds(userId)) {
    if (!known.has(recordingId)) removeReplayRecordingDirectory(userId, recordingId);
  }
}
