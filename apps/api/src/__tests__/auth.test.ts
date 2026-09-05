import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  CLIENT_ACCESS_COOKIE_NAME,
  createClientAccessToken,
  createSessionToken,
  parseBearerToken,
  requireValidClientAccess,
  requireValidSession,
  resolveClientAccessToken,
  resolveSessionToken,
  revokeClientAccessToken,
  revokeSessionToken,
  rotateClientAccessToken,
  rotateSessionToken,
} from "../auth.ts";
import { createEncryptedAccountOwnerV2 } from "../account-auth-vault.ts";
import { initializeDatabase } from "../db.ts";
import { deriveMasterKey, encryptText } from "../security.ts";

const MASTER_SECRET = "auth-test-account-vault-master";
const OWNER_ID = "user-1";

function createAuthDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"), MASTER_SECRET);
  const userDek = randomBytes(32);
  const legacyMasterKey = deriveMasterKey(MASTER_SECRET);
  const wrapped = encryptText(userDek.toString("base64"), legacyMasterKey);
  legacyMasterKey.fill(0);
  try {
    createEncryptedAccountOwnerV2({
      db,
      ownerUserId: OWNER_ID,
      loginIdentity: "auth-owner@example.test",
      displayName: "Auth Owner",
      passwordHash: "password-hash",
      passwordSalt: "password-salt",
      wrappedUserKey: wrapped.ciphertext,
      wrappedUserKeyIv: wrapped.iv,
      wrappedUserKeyTag: wrapped.tag,
      userDek,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  } finally {
    userDek.fill(0);
  }
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
    assert.equal(
      resolveSessionToken(
        {
          authorization: "Bearer bearer-token",
          cookie: "localai_session=cookie-token",
        },
        "localai_session",
      ),
      "bearer-token",
    );
  });

  it("falls back to the configured session cookie", () => {
    assert.equal(
      resolveSessionToken(
        { cookie: "other=1; localai_session=cookie-token" },
        "localai_session",
      ),
      "cookie-token",
    );
  });
});

describe("client access tokens", () => {
  it("creates and resolves a native-client gate token from its own cookie", () => {
    const db = createAuthDb();
    try {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const token = createClientAccessToken(db, OWNER_ID, 24, now);

      assert.equal(token.expiresAt, "2026-01-02T00:00:00.000Z");
      assert.equal(
        resolveClientAccessToken({
          cookie: `${CLIENT_ACCESS_COOKIE_NAME}=${encodeURIComponent(token.token)}`,
        }),
        token.token,
      );
      assert.equal(
        resolveClientAccessToken({
          "x-prism-client-access": token.token,
          cookie: `${CLIENT_ACCESS_COOKIE_NAME}=ignored-cookie-token`,
        }),
        token.token,
      );
      assert.deepEqual(
        requireValidClientAccess(
          db,
          token.token,
          new Date("2026-01-01T00:01:00.000Z"),
        ),
        {
          token: token.token,
          userId: OWNER_ID,
          expiresAt: "2026-01-02T00:00:00.000Z",
        },
      );
      const physical = db
        .prepare("SELECT token_hash FROM main.client_access_tokens")
        .get() as { token_hash: string };
      assert.match(physical.token_hash, /^pct2_[a-f0-9]{64}$/u);
      assert.notEqual(physical.token_hash, token.token);
    } finally {
      db.close();
    }
  });

  it("keeps native-client access separate from browser user sessions", () => {
    const db = createAuthDb();
    try {
      createSessionToken(
        db,
        OWNER_ID,
        1,
        new Date("2026-01-01T00:00:00.000Z"),
      );
      assert.equal(
        resolveSessionToken(
          { cookie: `${CLIENT_ACCESS_COOKIE_NAME}=client-token` },
          "localai_session",
        ),
        null,
      );
      assert.throws(
        () =>
          requireValidSession(
            db,
            "client-token",
            new Date("2026-01-01T00:00:00.000Z"),
          ),
        /Invalid session/,
      );
    } finally {
      db.close();
    }
  });

  it("deletes expired native-client access tokens before rejecting them", () => {
    const db = createAuthDb();
    try {
      const token = createClientAccessToken(
        db,
        OWNER_ID,
        0,
        new Date("2026-01-01T00:00:00.000Z"),
      );
      assert.throws(
        () =>
          requireValidClientAccess(
            db,
            token.token,
            new Date("2026-01-01T00:01:00.000Z"),
          ),
        /expired/,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM client_access_tokens").get() as {
          count: number;
        }).count,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("rotates and revokes client tokens without persisting either presented value", () => {
    const db = createAuthDb();
    try {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const first = createClientAccessToken(db, OWNER_ID, 1, now);
      const second = rotateClientAccessToken(db, first.token, OWNER_ID, 1, now);
      assert.throws(() => requireValidClientAccess(db, first.token, now), /Invalid/);
      assert.equal(requireValidClientAccess(db, second.token, now).userId, OWNER_ID);
      assert.equal(revokeClientAccessToken(db, second.token), true);
      assert.equal(revokeClientAccessToken(db, second.token), false);
    } finally {
      db.close();
    }
  });
});

describe("session bearer tokens", () => {
  it("resolves, rotates, and revokes a valid session through keyed hashes", () => {
    const db = createAuthDb();
    try {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const first = createSessionToken(db, OWNER_ID, 1, now);
      assert.deepEqual(requireValidSession(db, first.token, now), {
        token: first.token,
        userId: OWNER_ID,
        expiresAt: "2026-01-01T01:00:00.000Z",
      });
      const second = rotateSessionToken(db, first.token, OWNER_ID, 1, now);
      assert.throws(() => requireValidSession(db, first.token, now), /Invalid session/);
      assert.equal(requireValidSession(db, second.token, now).userId, OWNER_ID);
      assert.equal(revokeSessionToken(db, second.token), true);
      assert.equal(revokeSessionToken(db, second.token), false);
    } finally {
      db.close();
    }
  });

  it("deletes expired sessions before rejecting them", () => {
    const db = createAuthDb();
    try {
      const token = createSessionToken(
        db,
        OWNER_ID,
        0,
        new Date("2026-01-01T00:00:00.000Z"),
      );
      assert.throws(
        () =>
          requireValidSession(
            db,
            token.token,
            new Date("2026-01-01T00:01:00.000Z"),
          ),
        /Session expired/,
      );
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as {
          count: number;
        }).count,
        0,
      );
    } finally {
      db.close();
    }
  });
});
