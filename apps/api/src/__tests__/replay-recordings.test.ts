import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import type {
  ReplayManifestV1,
  ReplayManifestV2,
} from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import {
  claimNextReplayRecording,
  finalizeReplayRecordingV2,
  getReplayRecording,
  listReplayRecordings,
  queueReplayRecording,
  startReplayRecordingDraft,
  storeReplayFaithfulAudio,
} from "../replay-recordings.ts";
import { replayRecordingRelativeDirectory } from "../replay-storage.ts";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const now = "2026-07-24T00:00:00.000Z";
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

const participant = {
  id: "host-1",
  name: "Host",
  kind: "bot" as const,
  role: "host",
  color: "#ff3366",
  glyph: "spark",
  seatIndex: 0,
  visible: true,
};

const utterance = {
  id: "message-1",
  sourceMessageId: "message-1",
  speakerId: "host-1",
  speakerRole: "host",
  text: "Welcome.",
  spokenText: "Welcome.",
  moodKey: "warm",
  audible: true,
  visible: true,
  createdAt: "2026-07-24T00:00:01.000Z",
};

function manifestV2(
  surface: "signal" | "coffee" = "signal",
): ReplayManifestV2 {
  const sourceId = surface === "signal" ? "episode-1" : "coffee-1";
  return {
    v: 2,
    surface,
    sourceId,
    title: surface === "signal" ? "The Episode" : "Coffee replay",
    createdAt: "2026-07-24T00:00:00.000Z",
    completedAt: "2026-07-24T00:00:10.000Z",
    privacyMode: "local",
    participants: [participant],
    utterances: [utterance],
    initialScene: {
      camera: surface === "signal" ? "wide" : null,
      segment: surface === "signal" ? "opening" : null,
      introActive: false,
      outroActive: false,
      activeAction: null,
      activeReaction: null,
      overlapMessageIds: [],
      studioMix: {},
      participants: {
        "host-1": {
          visible: true,
          present: true,
          speaking: false,
          thinking: false,
          mood: "warm",
          cupLevel: surface === "coffee" ? 1 : null,
          sipping: false,
          voiceMode: "english",
          audible: true,
          gain: 1,
          pan: 0,
          effects: [],
        },
      },
    },
    direction: [
      {
        sequence: 1,
        atMs: 1_250,
        endMs: 3_800,
        kind: "speech",
        sourceMessageId: "message-1",
        payload: {
          speakerId: "host-1",
          voiceMode: "english",
          audible: true,
          effects: ["studio-room"],
          gain: 0.9,
          pan: -0.25,
          alignment: {
            characters: ["W"],
            characterStartTimesSeconds: [0],
            characterEndTimesSeconds: [0.1],
          },
        },
      },
      {
        sequence: 2,
        atMs: 4_100,
        endMs: 4_900,
        kind: "action",
        sourceMessageId: "message-1",
        payload: {
          userVisibleText: "The host taps the desk.",
          captureDiagnostic: "private",
        },
      },
    ],
    visual: {
      theme: "dark",
      accentColor: "#ff3366",
      atmosphereImageUrl: null,
    },
  };
}

const manifestV1: ReplayManifestV1 = {
  v: 1,
  surface: "signal",
  sourceId: "episode-1",
  title: "The Episode",
  createdAt: "2026-07-24T00:00:00.000Z",
  completedAt: "2026-07-24T00:00:10.000Z",
  privacyMode: "local",
  participants: [participant],
  utterances: [utterance],
  events: [],
  visual: {
    theme: "dark",
    accentColor: "#ff3366",
    atmosphereImageUrl: null,
  },
};

describe("faithful replay recordings", () => {
  it("uses an idempotent draft, upload, finalize lifecycle and becomes faithful atomically", () => {
    const db = fixture();
    const first = startReplayRecordingDraft(
      db,
      "user-1",
      "signal",
      "episode-1",
    );
    const repeated = startReplayRecordingDraft(
      db,
      "user-1",
      "signal",
      "episode-1",
    );
    assert.equal(first.id, repeated.id);
    assert.equal(first.availability, "saving");

    const uploaded = storeReplayFaithfulAudio(
      db,
      "user-1",
      first.id,
      new Uint8Array([1, 2, 3, 4]),
      "audio/webm",
      12_400,
    );
    assert.equal(uploaded?.availability, "saving");

    const finalized = finalizeReplayRecordingV2(
      db,
      "user-1",
      first.id,
      manifestV2(),
    );
    assert.equal(finalized?.availability, "faithful");
    assert.equal(finalized?.status, "ready");
    assert.equal(finalized?.audioUrl, `/api/replays/${first.id}/audio`);
    assert.equal(finalized?.videoUrl, null);
    assert.equal(finalized?.timeline?.durationMs, 12_400);
    assert.deepEqual(
      finalized?.timeline?.beats
        .filter((beat) => beat.kind === "utterance")
        .map((beat) => [beat.startMs, beat.endMs]),
      [[1_250, 3_800]],
    );

    const idempotent = finalizeReplayRecordingV2(
      db,
      "user-1",
      first.id,
      manifestV2(),
    );
    assert.equal(idempotent?.id, first.id);
    assert.equal(listReplayRecordings(db, "user-1").length, 1);
    assert.equal(claimNextReplayRecording(db, "user-1"), null);
  });

  it("keeps a missing master transcript-only and never reconstructs audio", () => {
    const db = fixture();
    const draft = startReplayRecordingDraft(
      db,
      "user-1",
      "coffee",
      "coffee-1",
    );
    const finalized = finalizeReplayRecordingV2(
      db,
      "user-1",
      draft.id,
      manifestV2("coffee"),
    );
    assert.equal(finalized?.availability, "transcript_only");
    assert.equal(finalized?.audioUrl, null);
    assert.equal(finalized?.videoUrl, null);
    assert.match(finalized?.warning ?? "", /transcript-only/u);
    assert.equal(claimNextReplayRecording(db, "user-1"), null);
  });

  it("allows a locally retained master to finish a transcript-only recording later", () => {
    const db = fixture();
    const draft = startReplayRecordingDraft(
      db,
      "user-1",
      "coffee",
      "coffee-1",
    );
    finalizeReplayRecordingV2(
      db,
      "user-1",
      draft.id,
      manifestV2("coffee"),
    );
    const recovered = storeReplayFaithfulAudio(
      db,
      "user-1",
      draft.id,
      new Uint8Array([9, 8, 7]),
      "audio/ogg",
      9_600,
    );
    assert.equal(recovered?.availability, "faithful");
    assert.equal(recovered?.warning, null);
    assert.equal(recovered?.timeline?.durationMs, 9_600);
  });

  it("compiles one readable transcript without exposing private direction details", () => {
    const db = fixture();
    const draft = startReplayRecordingDraft(
      db,
      "user-1",
      "signal",
      "episode-1",
    );
    finalizeReplayRecordingV2(db, "user-1", draft.id, manifestV2());
    const stored = db
      .prepare(
        "SELECT transcript_markdown FROM replay_recordings WHERE id = ?",
      )
      .get(draft.id) as { transcript_markdown: string };
    assert.match(stored.transcript_markdown, /\*\*00:01 · Host\*\*/u);
    assert.match(stored.transcript_markdown, /Welcome\./u);
    assert.match(stored.transcript_markdown, /The host taps the desk\./u);
    assert.doesNotMatch(
      stored.transcript_markdown,
      /studio-room|voiceMode|alignment|captureDiagnostic|private/u,
    );
  });

  it("keeps V1 masters playable and V1 recordings without a master transcript-only", () => {
    const withAudioDb = fixture();
    const withAudioDraft = startReplayRecordingDraft(
      withAudioDb,
      "user-1",
      "signal",
      "episode-1",
    );
    storeReplayFaithfulAudio(
      withAudioDb,
      "user-1",
      withAudioDraft.id,
      new Uint8Array([1]),
      "audio/webm",
      5_000,
    );
    const faithful = queueReplayRecording(
      withAudioDb,
      "user-1",
      manifestV1,
    );
    assert.equal(faithful.availability, "faithful");

    const transcriptDb = fixture();
    const transcriptOnly = queueReplayRecording(
      transcriptDb,
      "user-1",
      manifestV1,
    );
    assert.equal(transcriptOnly.availability, "transcript_only");
    assert.equal(transcriptOnly.audioUrl, null);
  });

  it("enforces source ownership and tenant-scopes draft, audio, and manifest access", () => {
    const db = fixture();
    const draft = startReplayRecordingDraft(
      db,
      "user-1",
      "signal",
      "episode-1",
    );
    assert.equal(getReplayRecording(db, "other-user", draft.id), null);
    assert.equal(
      storeReplayFaithfulAudio(
        db,
        "other-user",
        draft.id,
        new Uint8Array([1]),
        "audio/webm",
        1_000,
      ),
      null,
    );
    assert.equal(
      finalizeReplayRecordingV2(
        db,
        "other-user",
        draft.id,
        manifestV2(),
      ),
      null,
    );
    assert.throws(
      () =>
        startReplayRecordingDraft(
          db,
          "other-user",
          "signal",
          "episode-1",
        ),
      /Unknown signal replay source/u,
    );
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
});
