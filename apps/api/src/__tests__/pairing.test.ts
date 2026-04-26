import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  consumePairingCode,
  createPairingCode,
  hashPairingCode,
  normalizePairingCode,
} from "../pairing.ts";

function createPairingDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE pairing_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("pairing code helpers", () => {
  it("normalizes human-entered codes before hashing", () => {
    assert.equal(normalizePairingCode("ab12-cd34 ef56"), "AB12CD34EF56");
    assert.equal(hashPairingCode("AB12-CD34"), hashPairingCode("ab12cd34"));
  });
});

describe("pairing code lifecycle", () => {
  it("creates a short-lived pairing code and consumes it once", () => {
    const db = createPairingDb();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const pairing = createPairingCode(db, "user-1", now);

    assert.match(pairing.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(pairing.expiresAt, "2026-01-01T00:05:00.000Z");

    const consumed = consumePairingCode(
      db,
      pairing.code,
      new Date("2026-01-01T00:01:00.000Z")
    );
    assert.deepEqual(consumed, { userId: "user-1" });
    assert.throws(
      () =>
        consumePairingCode(
          db,
          pairing.code,
          new Date("2026-01-01T00:02:00.000Z")
        ),
      /already been used/
    );
  });

  it("rejects expired pairing codes", () => {
    const db = createPairingDb();
    db.prepare(
      "INSERT INTO pairing_codes (id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      "pairing-1",
      "user-1",
      hashPairingCode("ABCD-EFGH-JKLM"),
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );

    assert.throws(
      () =>
        consumePairingCode(
          db,
          "ABCD-EFGH-JKLM",
          new Date("2026-01-01T00:01:00.000Z")
        ),
      /expired/
    );
  });
});
