import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  developerTranscriptPayloadIsSealedV1,
  migrateDeveloperTranscriptPayloadsForOwnerV1,
  openDeveloperTranscriptPayloadV1,
  sealDeveloperTranscriptPayloadV1,
} from "../developer-transcript-vault.ts";

const ownerAKey = Buffer.alloc(32, 0x11);
const ownerBKey = Buffer.alloc(32, 0x22);

describe("developer transcript owner vault", () => {
  it("binds ciphertext to both the owner and event", () => {
    const payloadJson = JSON.stringify({ prompt: "owner-a-canary" });
    const sealed = sealDeveloperTranscriptPayloadV1({
      userId: "owner-a",
      eventId: "event-a",
      payloadJson,
      userKey: ownerAKey,
    });

    assert.equal(developerTranscriptPayloadIsSealedV1(sealed), true);
    assert.doesNotMatch(sealed, /owner-a-canary/u);
    assert.equal(
      openDeveloperTranscriptPayloadV1({
        userId: "owner-a",
        eventId: "event-a",
        payloadJson: sealed,
        userKey: ownerAKey,
      }),
      payloadJson,
    );
    assert.throws(() =>
      openDeveloperTranscriptPayloadV1({
        userId: "owner-b",
        eventId: "event-a",
        payloadJson: sealed,
        userKey: ownerAKey,
      }),
    );
    assert.throws(() =>
      openDeveloperTranscriptPayloadV1({
        userId: "owner-a",
        eventId: "event-a",
        payloadJson: sealed,
        userKey: ownerBKey,
      }),
    );
  });

  it("migrates only the selected owner's legacy rows", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE developer_transcript_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
    db.prepare(
      "INSERT INTO developer_transcript_events (id, user_id, payload_json) VALUES (?, ?, ?)",
    ).run("event-a", "owner-a", JSON.stringify({ prompt: "owner-a-canary" }));
    db.prepare(
      "INSERT INTO developer_transcript_events (id, user_id, payload_json) VALUES (?, ?, ?)",
    ).run("event-b", "owner-b", JSON.stringify({ prompt: "owner-b-canary" }));

    assert.equal(
      migrateDeveloperTranscriptPayloadsForOwnerV1({
        db,
        userId: "owner-a",
        userKey: ownerAKey,
      }),
      1,
    );
    const rows = db
      .prepare(
        "SELECT id, payload_json FROM developer_transcript_events ORDER BY id",
      )
      .all() as Array<{ id: string; payload_json: string }>;
    assert.equal(developerTranscriptPayloadIsSealedV1(rows[0]!.payload_json), true);
    assert.equal(developerTranscriptPayloadIsSealedV1(rows[1]!.payload_json), false);
    assert.doesNotMatch(rows[0]!.payload_json, /owner-a-canary/u);
    assert.match(rows[1]!.payload_json, /owner-b-canary/u);
    db.close();
  });
});
