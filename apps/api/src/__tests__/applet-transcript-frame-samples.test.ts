import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  listAppletTranscriptFrameSamples,
  recordAppletTranscriptFrameSample,
} from "../applet-transcript-frame-samples.ts";
import { initializeDatabase } from "../db.ts";

describe("applet transcript frame samples", () => {
  it("keeps the first frame rate recorded for an entry", () => {
    const db = new DatabaseSync(":memory:");
    initializeDatabase(db);
    db.prepare(
      `INSERT INTO users
        (id, email, display_name, password_hash, password_salt,
         wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
         created_at, last_active_at)
       VALUES ('user-1', 'one@example.test', 'One', 'hash', 'salt',
               'cipher', 'iv', 'tag', 'now', 'now')`,
    ).run();
    recordAppletTranscriptFrameSample(
      db,
      "user-1",
      "coffee",
      "session-1",
      "message-1",
      58.6,
      "2026-08-14T19:00:00.000Z",
    );
    recordAppletTranscriptFrameSample(
      db,
      "user-1",
      "coffee",
      "session-1",
      "message-1",
      12,
      "2026-08-14T19:01:00.000Z",
    );
    assert.deepEqual(
      listAppletTranscriptFrameSamples(db, "user-1", "coffee", "session-1"),
      [
        {
          entryId: "message-1",
          fps: 59,
          capturedAt: "2026-08-14T19:00:00.000Z",
        },
      ],
    );
    db.close();
  });
});
