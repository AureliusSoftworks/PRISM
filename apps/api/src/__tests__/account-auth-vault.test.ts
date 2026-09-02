import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  addAccountAuthPrivateUserColumnV2,
  accountAuthVaultContractIsCompleteV2,
  accountAuthVaultIsActiveV2,
  activateAccountAuthVaultV2,
  createEncryptedAccountOwnerV2,
  findAccountOwnerIdByLoginIdentityV2,
  resumeAccountAuthVaultV2,
  rotateAccountOwnerVaultDekV2,
  sessionTokenHashV2,
  suspendAccountAuthVaultViewV2,
} from "../account-auth-vault.ts";
import {
  activateCoreContentVaultV2,
  coreContentVaultIsActiveV2,
} from "../core-content-vault.ts";
import {
  createClientAccessToken,
  createSessionToken,
  requireValidClientAccess,
  requireValidSession,
  revokeClientAccessToken,
  revokeSessionToken,
  rotateClientAccessToken,
  rotateSessionToken,
} from "../auth.ts";
import { initializeDatabase } from "../db.ts";
import { deriveMasterKey, encryptText } from "../security.ts";

const MASTER_SECRET = "account-auth-vault-adversarial-master";
const createdTempDirectories: string[] = [];

function tempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "prism-account-auth-vault-"));
  createdTempDirectories.push(directory);
  return join(directory, "fixture.db");
}

afterEach(() => {
  for (const directory of createdTempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function wrapOwnerDek(masterSecret: string, userDek: Buffer) {
  const masterKey = deriveMasterKey(masterSecret);
  try {
    return encryptText(userDek.toString("base64"), masterKey);
  } finally {
    masterKey.fill(0);
  }
}

function createOwner(args: {
  db: DatabaseSync;
  index: number;
  identity: string;
  displayName: string;
  theme: "light" | "dark" | "system";
  provider: "local" | "openai";
  privateModel: string;
  privateApiPayload: string;
}): string {
  const ownerUserId = `owner-${args.index}`;
  const userDek = randomBytes(32);
  const wrapped = wrapOwnerDek(MASTER_SECRET, userDek);
  try {
    createEncryptedAccountOwnerV2({
      db: args.db,
      ownerUserId,
      loginIdentity: args.identity,
      displayName: args.displayName,
      passwordHash: `password-hash-${args.index}`,
      passwordSalt: `password-salt-${args.index}`,
      wrappedUserKey: wrapped.ciphertext,
      wrappedUserKeyIv: wrapped.iv,
      wrappedUserKeyTag: wrapped.tag,
      userDek,
      createdAt: `2026-09-01T0${args.index}:00:00.000Z`,
      initialPrivateValues: {
        theme: args.theme,
        preferred_provider: args.provider,
        preferred_local_model: args.privateModel,
        openai_key_ciphertext: args.privateApiPayload,
        openai_key_iv: `inner-iv-${args.index}`,
        openai_key_tag: `inner-tag-${args.index}`,
        voice_mode: args.index % 2 === 0 ? "english" : "bottish",
      },
    });
  } finally {
    userDek.fill(0);
  }
  return ownerUserId;
}

function fileBytes(path: string): Buffer {
  return Buffer.concat(
    [path, `${path}-wal`, `${path}-shm`]
      .filter((candidate) => existsSync(candidate))
      .map((candidate) => readFileSync(candidate)),
  );
}

describe("Account Auth Vault V2", () => {
  it("isolates four owners across switches and restart with no identity, settings, API payload, or bearer plaintext at rest", () => {
    const dbPath = tempDatabasePath();
    let db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
    const fixtures = [
      {
        identity: "ALPHA.Canary@example.test",
        displayName: "Alpha Display Canary",
        theme: "dark" as const,
        provider: "local" as const,
        privateModel: "alpha-private-model-canary",
        privateApiPayload: "alpha-private-api-payload-canary",
      },
      {
        identity: "beta.canary@example.test",
        displayName: "Beta Display Canary",
        theme: "light" as const,
        provider: "openai" as const,
        privateModel: "beta-private-model-canary",
        privateApiPayload: "beta-private-api-payload-canary",
      },
      {
        identity: "gamma.canary@example.test",
        displayName: "Gamma Display Canary",
        theme: "system" as const,
        provider: "local" as const,
        privateModel: "gamma-private-model-canary",
        privateApiPayload: "gamma-private-api-payload-canary",
      },
      {
        identity: "delta.canary@example.test",
        displayName: "Delta Display Canary",
        theme: "dark" as const,
        provider: "openai" as const,
        privateModel: "delta-private-model-canary",
        privateApiPayload: "delta-private-api-payload-canary",
      },
    ];
    const ownerIds = fixtures.map((fixture, index) =>
      createOwner({ db, index, ...fixture }),
    );
    const sessionTokens = ownerIds.map((ownerId) =>
      createSessionToken(
        db,
        ownerId,
        24,
        new Date("2026-09-01T12:00:00.000Z"),
      ).token,
    );
    const clientTokens = ownerIds.map((ownerId) =>
      createClientAccessToken(
        db,
        ownerId,
        24,
        new Date("2026-09-01T12:00:00.000Z"),
      ).token,
    );

    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index]!;
      const ownerId = ownerIds[index]!;
      assert.equal(
        findAccountOwnerIdByLoginIdentityV2(db, fixture.identity.toUpperCase()),
        ownerId,
      );
      assert.deepEqual(
        {
          ...(db
            .prepare(
            `SELECT email, display_name, theme, preferred_provider,
                    preferred_local_model, openai_key_ciphertext, voice_mode
               FROM users WHERE id = ?`,
            )
            .get(ownerId) as Record<string, unknown>),
        },
        {
          email: fixture.identity.toLowerCase(),
          display_name: fixture.displayName,
          theme: fixture.theme,
          preferred_provider: fixture.provider,
          preferred_local_model: fixture.privateModel,
          openai_key_ciphertext: fixture.privateApiPayload,
          voice_mode: index % 2 === 0 ? "english" : "bottish",
        },
      );
      const physical = db
        .prepare(
          `SELECT typeof(email) AS email_type,
                  typeof(display_name) AS display_type,
                  typeof(theme) AS theme_type,
                  typeof(preferred_provider) AS provider_type,
                  typeof(preferred_local_model) AS model_type,
                  typeof(openai_key_ciphertext) AS api_type,
                  login_identity_blind_index
             FROM main.users WHERE id = ?`,
        )
        .get(ownerId) as Record<string, unknown>;
      assert.deepEqual(
        Object.entries(physical)
          .filter(([key]) => key.endsWith("_type"))
          .map(([, value]) => value),
        ["blob", "blob", "blob", "blob", "blob", "blob"],
      );
      assert.match(
        String(physical.login_identity_blind_index),
        /^pli2_[a-f0-9]{64}$/u,
      );
    }

    const multiColumnUpdate = db
      .prepare(
        "UPDATE users SET theme = ?, preferred_provider = ? WHERE id = ?",
      )
      .run("light", "openai", ownerIds[0]!);
    assert.equal(Number(multiColumnUpdate.changes), 1);
    assert.deepEqual(
      {
        ...(db
          .prepare(
            "SELECT theme, preferred_provider FROM users WHERE id = ?",
          )
          .get(ownerIds[0]!) as Record<string, unknown>),
      },
      { theme: "light", preferred_provider: "openai" },
    );
    const restoredUpdate = db
      .prepare(
        "UPDATE users SET theme = ?, preferred_provider = ? WHERE id = ?",
      )
      .run(fixtures[0]!.theme, fixtures[0]!.provider, ownerIds[0]!);
    assert.equal(Number(restoredUpdate.changes), 1);

    const ownerOneTheme = db
      .prepare("SELECT theme FROM main.users WHERE id = ?")
      .get(ownerIds[0]!) as { theme: Uint8Array };
    const ownerTwoTheme = db
      .prepare("SELECT theme FROM main.users WHERE id = ?")
      .get(ownerIds[1]!) as { theme: Uint8Array };
    db.prepare("UPDATE main.users SET theme = ? WHERE id = ?").run(
      ownerOneTheme.theme,
      ownerIds[1]!,
    );
    assert.throws(
      () => db.prepare("SELECT theme FROM users WHERE id = ?").get(ownerIds[1]!),
      /Vault content could not be opened/,
    );
    db.prepare("UPDATE main.users SET theme = ? WHERE id = ?").run(
      ownerTwoTheme.theme,
      ownerIds[1]!,
    );

    rotateAccountOwnerVaultDekV2({
      db,
      ownerUserId: ownerIds[2]!,
      rotatedAt: "2026-09-02T00:00:00.000Z",
    });
    assert.equal(
      (db.prepare("SELECT theme FROM users WHERE id = ?").get(ownerIds[2]!) as {
        theme: string;
      }).theme,
      fixtures[2]!.theme,
    );

    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    db.close();
    const storedBytes = fileBytes(dbPath);
    for (const fixture of fixtures) {
      for (const canary of [
        fixture.identity.toLowerCase(),
        fixture.displayName,
        fixture.privateModel,
        fixture.privateApiPayload,
      ]) {
        assert.equal(storedBytes.includes(Buffer.from(canary, "utf8")), false, canary);
      }
    }
    for (const token of [...sessionTokens, ...clientTokens]) {
      assert.equal(storedBytes.includes(Buffer.from(token, "utf8")), false);
    }

    db = new DatabaseSync(dbPath);
    assert.equal(
      resumeAccountAuthVaultV2({ db, masterSecret: MASTER_SECRET }),
      true,
    );
    for (let index = 0; index < ownerIds.length; index += 1) {
      assert.equal(
        requireValidSession(
          db,
          sessionTokens[index]!,
          new Date("2026-09-01T12:01:00.000Z"),
        ).userId,
        ownerIds[index],
      );
      assert.equal(
        requireValidClientAccess(
          db,
          clientTokens[index]!,
          new Date("2026-09-01T12:01:00.000Z"),
        ).userId,
        ownerIds[index],
      );
      assert.equal(
        (db.prepare("SELECT preferred_local_model FROM users WHERE id = ?").get(
          ownerIds[index]!,
        ) as { preferred_local_model: string }).preferred_local_model,
        fixtures[index]!.privateModel,
      );
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(ownerIds[3]!);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(
        ownerIds[3]!,
      ) as { count: number }).count,
      0,
    );
    assert.equal(
      (db
        .prepare("SELECT COUNT(*) AS count FROM client_access_tokens WHERE user_id = ?")
        .get(ownerIds[3]!) as { count: number }).count,
      0,
    );
    db.close();
  });

  it("migrates legacy identity/settings and raw bearer rows without invalidating presented tokens", () => {
    const dbPath = tempDatabasePath();
    let db = initializeDatabase(new DatabaseSync(dbPath));
    db.exec(`
      DROP TABLE sessions;
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      DROP TABLE client_access_tokens;
      CREATE TABLE client_access_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    const legacyCanaries: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const userDek = randomBytes(32);
      const wrapped = wrapOwnerDek(MASTER_SECRET, userDek);
      userDek.fill(0);
      const identity = `legacy-${index}-identity-canary@example.test`;
      const displayName = `Legacy ${index} Display Canary`;
      const model = `legacy-${index}-model-canary`;
      legacyCanaries.push(identity, displayName, model);
      db.prepare(
        `INSERT INTO main.users (
           id, email, display_name, password_hash, password_salt,
           wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
           theme, preferred_local_model, created_at, last_active_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `legacy-owner-${index}`,
        identity,
        displayName,
        `legacy-hash-${index}`,
        `legacy-salt-${index}`,
        wrapped.ciphertext,
        wrapped.iv,
        wrapped.tag,
        index % 2 === 0 ? "dark" : "light",
        model,
        `2026-08-0${index + 1}T00:00:00.000Z`,
        `2026-08-0${index + 1}T00:00:00.000Z`,
      );
    }
    const rawSession = "legacy-raw-session-token-canary";
    const rawClient = "legacy-raw-client-token-canary";
    legacyCanaries.push(rawSession, rawClient);
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    ).run(rawSession, "legacy-owner-0", "2026-09-03T00:00:00.000Z");
    db.prepare(
      `INSERT INTO client_access_tokens
         (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    ).run(
      rawClient,
      "legacy-owner-0",
      "2026-09-03T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );

    const report = activateAccountAuthVaultV2({
      db,
      masterSecret: MASTER_SECRET,
    });
    assert.equal(report.migratedOwnerCount, 4);
    assert.ok(report.encryptedCellCount > 0);
    assert.equal(report.migratedSessionTokenCount, 1);
    assert.equal(report.migratedClientAccessTokenCount, 1);
    assert.equal(accountAuthVaultContractIsCompleteV2(db), true);
    assert.equal(
      requireValidSession(
        db,
        rawSession,
        new Date("2026-09-01T00:01:00.000Z"),
      ).userId,
      "legacy-owner-0",
    );
    assert.equal(
      requireValidClientAccess(
        db,
        rawClient,
        new Date("2026-09-01T00:01:00.000Z"),
      ).userId,
      "legacy-owner-0",
    );
    assert.match(sessionTokenHashV2(db, rawSession), /^pst2_[a-f0-9]{64}$/u);
    assert.deepEqual(
      tokenColumnNames(db, "sessions"),
      ["token_hash", "user_id", "expires_at"],
    );
    assert.deepEqual(
      tokenColumnNames(db, "client_access_tokens"),
      ["token_hash", "user_id", "expires_at", "created_at"],
    );

    const replacementSession = rotateSessionToken(
      db,
      rawSession,
      "legacy-owner-0",
      24,
      new Date("2026-09-01T00:02:00.000Z"),
    );
    const replacementClient = rotateClientAccessToken(
      db,
      rawClient,
      "legacy-owner-0",
      24,
      new Date("2026-09-01T00:02:00.000Z"),
    );
    assert.throws(() => requireValidSession(db, rawSession), /Invalid session/);
    assert.throws(() => requireValidClientAccess(db, rawClient), /Invalid native/);
    assert.equal(revokeSessionToken(db, replacementSession.token), true);
    assert.equal(revokeClientAccessToken(db, replacementClient.token), true);

    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    db.close();
    const storedBytes = fileBytes(dbPath);
    for (const canary of legacyCanaries) {
      assert.equal(storedBytes.includes(Buffer.from(canary, "utf8")), false, canary);
    }

    db = new DatabaseSync(dbPath);
    assert.equal(
      resumeAccountAuthVaultV2({ db, masterSecret: MASTER_SECRET }),
      true,
    );
    assert.equal(
      (db.prepare("SELECT display_name FROM users WHERE id = ?").get(
        "legacy-owner-2",
      ) as { display_name: string }).display_name,
      "Legacy 2 Display Canary",
    );
    assert.throws(
      () =>
        resumeAccountAuthVaultV2({
          db: new DatabaseSync(dbPath),
          masterSecret: "wrong-installation-master",
        }),
      /Vault content could not be opened/,
    );
    db.close();
  });

  it("restarts a completed Core Vault while migrating legacy bearer tables", () => {
    const dbPath = tempDatabasePath();
    let db = initializeDatabase(new DatabaseSync(dbPath));
    db.exec(`
      DROP TABLE sessions;
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      DROP TABLE client_access_tokens;
      CREATE TABLE client_access_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    const ownerUserId = "startup-owner";
    const userDek = randomBytes(32);
    const wrapped = wrapOwnerDek(MASTER_SECRET, userDek);
    userDek.fill(0);
    db.prepare(
      `INSERT INTO main.users (
         id, email, display_name, password_hash, password_salt,
         wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
         created_at, last_active_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ownerUserId,
      "startup-owner@example.test",
      "Startup Owner",
      "startup-password-hash",
      "startup-password-salt",
      wrapped.ciphertext,
      wrapped.iv,
      wrapped.tag,
      "2026-09-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );
    const sessionToken = "startup-legacy-session-token";
    const clientToken = "startup-legacy-client-token";
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    ).run(sessionToken, ownerUserId, "2026-09-03T00:00:00.000Z");
    db.prepare(
      `INSERT INTO client_access_tokens
         (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    ).run(
      clientToken,
      ownerUserId,
      "2026-09-03T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );
    const coreReport = activateCoreContentVaultV2({
      db,
      masterSecret: MASTER_SECRET,
    });
    assert.equal(coreReport.ownerCount, 1);
    db.close();

    db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
    assert.equal(coreContentVaultIsActiveV2(db), true);
    assert.equal(accountAuthVaultIsActiveV2(db), true);
    assert.equal(accountAuthVaultContractIsCompleteV2(db), true);
    assert.equal(
      requireValidSession(
        db,
        sessionToken,
        new Date("2026-09-01T00:01:00.000Z"),
      ).userId,
      ownerUserId,
    );
    assert.equal(
      requireValidClientAccess(
        db,
        clientToken,
        new Date("2026-09-01T00:01:00.000Z"),
      ).userId,
      ownerUserId,
    );
    const tempViews = db
      .prepare(
        `SELECT name
           FROM temp.sqlite_temp_master
          WHERE type = 'view' AND name IN ('users', 'conversations')
          ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(tempViews.map((row) => row.name), ["conversations", "users"]);
    db.close();
  });

  it("seals additive private columns and repairs an interrupted schema upgrade before normalizers run", () => {
    const dbPath = tempDatabasePath();
    let db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
    const ownerIds = Array.from({ length: 4 }, (_, index) =>
      createOwner({
        db,
        index,
        identity: `schema-${index}@example.test`,
        displayName: `Schema Owner ${index}`,
        theme: "dark",
        provider: "local",
        privateModel: `schema-model-${index}`,
        privateApiPayload: `schema-api-${index}`,
      }),
    );

    assert.equal(
      addAccountAuthPrivateUserColumnV2({
        db,
        columnName: "future_account_setting",
        columnDefinition: "TEXT NOT NULL DEFAULT 'owner-private-default'",
      }),
      true,
    );
    assert.equal(
      addAccountAuthPrivateUserColumnV2({
        db,
        columnName: "future_account_setting",
        columnDefinition: "TEXT NOT NULL DEFAULT 'owner-private-default'",
      }),
      false,
    );
    for (const ownerId of ownerIds) {
      assert.equal(
        (
          db
            .prepare("SELECT future_account_setting FROM users WHERE id = ?")
            .get(ownerId) as { future_account_setting: string }
        ).future_account_setting,
        "owner-private-default",
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT typeof(future_account_setting) AS storage_type FROM main.users WHERE id = ?",
            )
            .get(ownerId) as { storage_type: string }
        ).storage_type,
        "blob",
      );
    }
    db.prepare(
      "UPDATE users SET future_account_setting = ? WHERE id = ?",
    ).run("alpha-only-future-setting", ownerIds[0]!);
    assert.equal(
      (
        db
          .prepare("SELECT future_account_setting FROM users WHERE id = ?")
          .get(ownerIds[1]!) as { future_account_setting: string }
      ).future_account_setting,
      "owner-private-default",
    );

    assert.equal(suspendAccountAuthVaultViewV2(db), true);
    db.exec(
      "ALTER TABLE main.users ADD COLUMN interrupted_future_setting TEXT NOT NULL DEFAULT 'schema-default'",
    );
    db.exec(
      "UPDATE main.users SET interrupted_future_setting = 'interrupted-plaintext-canary'",
    );
    db.close();

    db = initializeDatabase(new DatabaseSync(dbPath), MASTER_SECRET);
    for (const ownerId of ownerIds) {
      assert.equal(
        (
          db
            .prepare("SELECT interrupted_future_setting FROM users WHERE id = ?")
            .get(ownerId) as { interrupted_future_setting: string }
        ).interrupted_future_setting,
        "interrupted-plaintext-canary",
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT typeof(interrupted_future_setting) AS storage_type FROM main.users WHERE id = ?",
            )
            .get(ownerId) as { storage_type: string }
        ).storage_type,
        "blob",
      );
    }
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    db.close();
    assert.equal(
      fileBytes(dbPath).includes(Buffer.from("interrupted-plaintext-canary")),
      false,
    );

    const dbSource = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
    assert.doesNotMatch(
      dbSource,
      /ALTER TABLE (?:main\.)?users ADD COLUMN/u,
      "all additive account columns must use the seal-before-commit helper",
    );
  });
});

function tokenColumnNames(db: DatabaseSync, table: string): string[] {
  return (
    db.prepare(`PRAGMA main.table_info("${table}")`).all() as Array<{
      name: string;
    }>
  ).map((column) => column.name);
}
