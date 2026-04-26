import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  parseBearerToken,
  requireValidSession,
  resolveSessionToken,
} from "../auth.ts";

function createSessionDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("parseBearerToken", () => {
  it("accepts bearer tokens with flexible casing and whitespace", () => {
    assert.equal(parseBearerToken("Bearer abc123"), "abc123");
    assert.equal(parseBearerToken("bearer   abc123   "), "abc123");
  });

  it("rejects malformed authorization headers", () => {
    assert.equal(parseBearerToken(undefined), null);
    assert.equal(parseBearerToken("Basic abc123"), null);
    assert.equal(parseBearerToken("Bearer"), null);
    assert.equal(parseBearerToken(""), null);
  });
});

describe("resolveSessionToken", () => {
  it("prefers bearer tokens over cookies", () => {
    const token = resolveSessionToken(
      {
        authorization: "Bearer bearer-token",
        cookie: "localai_session=cookie-token",
      },
      "localai_session"
    );

    assert.equal(token, "bearer-token");
  });

  it("falls back to the configured session cookie", () => {
    const token = resolveSessionToken(
      { cookie: "other=1; localai_session=cookie-token" },
      "localai_session"
    );

    assert.equal(token, "cookie-token");
  });
});

describe("requireValidSession", () => {
  it("resolves a valid session token", () => {
    const db = createSessionDb();
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).run("token-1", "user-1", "2026-01-01T00:05:00.000Z");

    const session = requireValidSession(
      db,
      "token-1",
      new Date("2026-01-01T00:00:00.000Z")
    );

    assert.deepEqual(session, {
      token: "token-1",
      userId: "user-1",
      expiresAt: "2026-01-01T00:05:00.000Z",
    });
  });

  it("deletes expired sessions before rejecting them", () => {
    const db = createSessionDb();
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).run("expired-token", "user-1", "2026-01-01T00:00:00.000Z");

    assert.throws(
      () =>
        requireValidSession(
          db,
          "expired-token",
          new Date("2026-01-01T00:01:00.000Z")
        ),
      /Session expired/
    );
    const row = db
      .prepare("SELECT token FROM sessions WHERE token = ?")
      .get("expired-token");
    assert.equal(row, undefined);
  });
});
