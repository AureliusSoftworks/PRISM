import type { DatabaseSync } from "node:sqlite";

import type { AppletSessionNoteSurface } from "./applet-session-notes.ts";

export interface AppletTranscriptFrameSampleV1 {
  entryId: string;
  fps: number;
  capturedAt: string;
}

interface AppletTranscriptFrameSampleRow {
  entry_id: string;
  fps: number;
  captured_at: string;
}

export function readAppletTranscriptFps(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 240 ? rounded : null;
}

export function recordAppletTranscriptFrameSample(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
  entryId: string,
  fps: number,
  capturedAt: string,
): AppletTranscriptFrameSampleV1 {
  const normalizedSessionId = sessionId.trim();
  const normalizedEntryId = entryId.trim();
  const normalizedFps = readAppletTranscriptFps(fps);
  const capturedAtMs = Date.parse(capturedAt);
  if (!normalizedSessionId || !normalizedEntryId || normalizedFps === null) {
    throw new Error("A valid transcript entry and frame rate are required.");
  }
  const normalizedCapturedAt = Number.isFinite(capturedAtMs)
    ? new Date(capturedAtMs).toISOString()
    : new Date().toISOString();
  db.prepare(
    `INSERT INTO applet_transcript_frame_samples
       (user_id, surface, session_id, entry_id, fps, captured_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, surface, session_id, entry_id) DO NOTHING`,
  ).run(
    userId,
    surface,
    normalizedSessionId,
    normalizedEntryId,
    normalizedFps,
    normalizedCapturedAt,
  );
  const stored = db
    .prepare(
      `SELECT entry_id, fps, captured_at
         FROM applet_transcript_frame_samples
        WHERE user_id = ? AND surface = ? AND session_id = ? AND entry_id = ?`,
    )
    .get(userId, surface, normalizedSessionId, normalizedEntryId) as
    | AppletTranscriptFrameSampleRow
    | undefined;
  if (!stored) throw new Error("Transcript frame rate could not be recorded.");
  return {
    entryId: stored.entry_id,
    fps: stored.fps,
    capturedAt: stored.captured_at,
  };
}

export function listAppletTranscriptFrameSamples(
  db: DatabaseSync,
  userId: string,
  surface: AppletSessionNoteSurface,
  sessionId: string,
): AppletTranscriptFrameSampleV1[] {
  return (
    db
      .prepare(
        `SELECT entry_id, fps, captured_at
           FROM applet_transcript_frame_samples
          WHERE user_id = ? AND surface = ? AND session_id = ?
          ORDER BY captured_at, entry_id`,
      )
      .all(
        userId,
        surface,
        sessionId.trim(),
      ) as unknown as AppletTranscriptFrameSampleRow[]
  ).map((row) => ({
    entryId: row.entry_id,
    fps: row.fps,
    capturedAt: row.captured_at,
  }));
}
