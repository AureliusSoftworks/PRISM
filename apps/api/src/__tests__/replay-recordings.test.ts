import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import type { ReplayManifestV1, ReplayVoiceTakeV1 } from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import {
  claimNextReplayRecording,
  deleteReplayRecordingMedia,
  failReplayRender,
  getReplayRecording,
  listReplayRecordings,
  queueReplayRecording,
  replayVoiceTakesForRecording,
  retryReplayRecording,
  upsertReplayVoiceTake,
} from "../replay-recordings.ts";
import { replayRecordingRelativeDirectory } from "../replay-storage.ts";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const now = "2026-07-21T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'replay@example.com', 'Producer', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO botcast_shows
      (id, user_id, host_bot_id, name, premise, hosting_style, accent_color,
       atmosphere_json, created_at, updated_at)
     VALUES ('show-1', 'user-1', 'host-1', 'The Show', 'Premise', 'Direct',
             '#ff3366', '{}', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO botcast_episodes
      (id, user_id, show_id, host_bot_id, guest_bot_id, title, topic,
       provider, response_mode, status, segment, started_at, completed_at,
       created_at, updated_at)
     VALUES ('episode-1', 'user-1', 'show-1', 'host-1', 'guest-1',
             'The Episode', 'Truth', 'local', 'local', 'completed', 'closing',
             ?, ?, ?, ?)`,
  ).run(now, now, now, now);
  db.prepare(
    `INSERT INTO conversations
      (id, user_id, title, conversation_mode, created_at, updated_at)
     VALUES ('coffee-1', 'user-1', 'Coffee replay', 'coffee', ?, ?)`,
  ).run(now, now);
  return db;
}

const manifest: ReplayManifestV1 = {
  v: 1,
  surface: "signal",
  sourceId: "episode-1",
  title: "The Episode",
  createdAt: "2026-07-21T00:00:00.000Z",
  completedAt: "2026-07-21T00:02:00.000Z",
  privacyMode: "local",
  participants: [
    {
      id: "host-1",
      name: "Host",
      kind: "bot",
      role: "host",
      color: "#ff3366",
      glyph: "spark",
      seatIndex: 0,
      visible: true,
    },
  ],
  utterances: [
    {
      id: "message-1",
      sourceMessageId: "message-1",
      speakerId: "host-1",
      speakerRole: "host",
      text: "Welcome.",
      spokenText: "Welcome.",
      moodKey: "warm",
      audible: true,
      visible: true,
      createdAt: "2026-07-21T00:00:01.000Z",
    },
  ],
  events: [],
  visual: {
    theme: "dark",
    accentColor: "#ff3366",
    atmosphereImageUrl: null,
  },
};

const takeSnapshot: ReplayVoiceTakeV1 = {
  v: 1,
  sourceKey: "message-1",
  sourceMessageId: "message-1",
  sourceEventId: null,
  speakerId: "host-1",
  speakerName: "Host",
  spokenText: "Welcome.",
  performanceText: null,
  mode: "english",
  requestedEngine: "builtin",
  resolvedEngine: null,
  profile: {
    v: 1,
    baseVoiceId: "voice-1",
    pitch: 0,
    warmth: 0,
    pace: 0,
    lilt: 0,
  },
  moodKey: "warm",
  effectsEnabled: true,
  gain: 1,
  stereoPan: -0.3,
  channel: "primary",
  seed: "episode-1:message-1",
  audible: true,
  durationMs: null,
  alignment: null,
};

describe("durable replay recordings", () => {
  it("freezes a take, queues deterministically, and leases without any provider work", () => {
    const db = fixture();
    const firstTake = upsertReplayVoiceTake(
      db,
      "user-1",
      "signal",
      "episode-1",
      takeSnapshot,
    );
    const duplicateTake = upsertReplayVoiceTake(
      db,
      "user-1",
      "signal",
      "episode-1",
      { ...takeSnapshot, mode: "mute" },
    );
    assert.equal(duplicateTake.id, firstTake.id);
    assert.equal(duplicateTake.snapshot.mode, "english");

    const queued = queueReplayRecording(db, "user-1", manifest);
    assert.equal(queued.status, "queued");
    assert.match(queued.transcriptVttUrl ?? "", /transcript\.vtt/u);
    const claimed = claimNextReplayRecording(db, "user-1");
    assert.ok(claimed);
    assert.equal(claimed.recording.status, "preparing_audio");
    assert.equal(claimed.takes[0]?.snapshot.requestedEngine, "builtin");

    const failed = failReplayRender(
      db,
      "user-1",
      claimed.recording.id,
      claimed.renderToken,
      "encoder unavailable",
    );
    assert.equal(failed.status, "failed");
    const retried = retryReplayRecording(db, "user-1", failed.id);
    assert.equal(retried?.status, "queued");
  });

  it("keeps recordings tenant-scoped and cascades metadata with the source", () => {
    const db = fixture();
    const queued = queueReplayRecording(db, "user-1", manifest);
    assert.equal(getReplayRecording(db, "other-user", queued.id), null);
    assert.equal(listReplayRecordings(db, "user-1").length, 1);
    db.prepare("DELETE FROM botcast_episodes WHERE id = ? AND user_id = ?").run(
      "episode-1",
      "user-1",
    );
    assert.equal(listReplayRecordings(db, "user-1").length, 0);
  });

  it("recovers stale client leases and keeps the transcript after recording deletion", () => {
    const db = fixture();
    const queued = queueReplayRecording(db, "user-1", manifest);
    const firstClaim = claimNextReplayRecording(db, "user-1");
    assert.ok(firstClaim);
    db.prepare(
      "UPDATE replay_recordings SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?",
    ).run(queued.id);
    const recoveredClaim = claimNextReplayRecording(db, "user-1");
    assert.ok(recoveredClaim);
    assert.equal(recoveredClaim.recording.id, queued.id);
    assert.notEqual(recoveredClaim.renderToken, firstClaim.renderToken);

    const deleted = deleteReplayRecordingMedia(db, "user-1", queued.id);
    assert.equal(deleted?.status, "collecting");
    assert.ok(deleted?.manifest);
    assert.match(deleted?.transcriptMarkdownUrl ?? "", /transcript\.md/u);
    assert.equal(deleted?.videoUrl, null);
  });

  it("claims only the requested replay surface and source", () => {
    const db = fixture();
    queueReplayRecording(db, "user-1", {
      ...manifest,
      surface: "coffee",
      sourceId: "coffee-1",
      title: "Coffee replay",
    });
    queueReplayRecording(db, "user-1", manifest);

    const signal = claimNextReplayRecording(db, "user-1", {
      surface: "signal",
      sourceId: "episode-1",
    });
    assert.equal(signal?.recording.surface, "signal");
    assert.equal(signal?.recording.sourceId, "episode-1");

    const coffee = claimNextReplayRecording(db, "user-1", {
      surface: "coffee",
    });
    assert.equal(coffee?.recording.surface, "coffee");
    assert.equal(coffee?.recording.sourceId, "coffee-1");
  });

  it("rejects traversal in every replay media path segment", () => {
    assert.throws(
      () => replayRecordingRelativeDirectory("../user-1", "recording-1"),
      /Invalid replay media path segment/u,
    );
    assert.throws(
      () => replayRecordingRelativeDirectory("user-1", "../../recording-1"),
      /Invalid replay media path segment/u,
    );
  });

  it("freezes English, Premium, Bottish, and Muted on the exact next utterances", () => {
    const db = fixture();
    const expected = [
      { mode: "english" as const, requestedEngine: "builtin" as const },
      { mode: "english" as const, requestedEngine: "elevenlabs" as const },
      { mode: "bottish" as const, requestedEngine: null },
      { mode: "mute" as const, requestedEngine: null },
    ];
    const recordingId = expected
      .map((voice, index) =>
        upsertReplayVoiceTake(db, "user-1", "signal", "episode-1", {
          ...takeSnapshot,
          sourceKey: `message-${index + 1}`,
          sourceMessageId: `message-${index + 1}`,
          mode: voice.mode,
          requestedEngine: voice.requestedEngine,
          audible: voice.mode !== "mute",
        }),
      )[0]!.recordingId;
    assert.deepEqual(
      replayVoiceTakesForRecording(db, "user-1", recordingId).map((take) => ({
        messageId: take.snapshot.sourceMessageId,
        mode: take.snapshot.mode,
        engine: take.snapshot.requestedEngine,
      })),
      [
        { messageId: "message-1", mode: "english", engine: "builtin" },
        { messageId: "message-2", mode: "english", engine: "elevenlabs" },
        { messageId: "message-3", mode: "bottish", engine: null },
        { messageId: "message-4", mode: "mute", engine: null },
      ],
    );
  });
});
