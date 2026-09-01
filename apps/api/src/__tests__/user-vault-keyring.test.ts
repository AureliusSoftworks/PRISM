import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "../db.ts";
import {
  VAULT_INSTALLATION_KDF_VERSION_V1,
  VAULT_KEYRING_MIGRATION_CONTEXT_V2,
  createUserVaultKeyringV2,
  decryptUserVaultContentForMigrationV2,
  decryptUserVaultContentV2,
  deriveVaultMasterKeyContextV2,
  encryptUserVaultContentV2,
  ensureUserVaultKeyringSchema,
  importLegacyUserDekIntoVaultKeyringV2,
  listUserVaultKeysV2,
  loadVaultInstallationKdfConfigV1,
  resolveActiveUserVaultKeyV2,
  rewrapUserVaultKeyringMasterV2,
  rotateUserVaultDekV2,
  type VaultKeyringMigrationContextV2,
} from "../user-vault-keyring.ts";
import {
  VaultAuthenticationError,
  VaultEnvelopeMalformedError,
  VaultKeyLifecycleError,
  VaultUnknownKeyIdError,
  generateVaultKeyIdV2,
  parseVaultEnvelopeV2,
  serializeVaultEnvelopeV2,
} from "../vault-envelope-v2.ts";

const CREATED_AT = "2026-09-01T12:00:00.000Z";
const ROTATED_AT = "2026-09-02T12:00:00.000Z";

function fixture(ownerIds: readonly string[]): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  const insert = db.prepare(
    `INSERT INTO users (
       id, email, display_name, password_hash, password_salt,
       wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
       created_at, last_active_at
     ) VALUES (?, ?, ?, 'legacy-hash', 'legacy-salt',
       'legacy-wrapped-key', 'legacy-iv', 'legacy-tag', ?, ?)`,
  );
  for (const ownerUserId of ownerIds) {
    insert.run(
      ownerUserId,
      `${ownerUserId}@example.test`,
      ownerUserId,
      CREATED_AT,
      CREATED_AT,
    );
  }
  return db;
}

function encryptForOwner(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: ReturnType<typeof deriveVaultMasterKeyContextV2>;
  plaintext?: Buffer;
  stableRowId?: string;
}): Buffer {
  return encryptUserVaultContentV2({
    db: args.db,
    ownerUserId: args.ownerUserId,
    context: args.context,
    logicalTable: "messages",
    logicalColumn: "content",
    stableRowId: args.stableRowId ?? "message-1",
    plaintext: args.plaintext ?? Buffer.from("same private plaintext"),
  });
}

function decryptForOwner(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: ReturnType<typeof deriveVaultMasterKeyContextV2>;
  serializedEnvelope: Uint8Array;
  stableRowId?: string;
}): Buffer {
  return decryptUserVaultContentV2({
    db: args.db,
    ownerUserId: args.ownerUserId,
    context: args.context,
    logicalTable: "messages",
    logicalColumn: "content",
    stableRowId: args.stableRowId ?? "message-1",
    serializedEnvelope: args.serializedEnvelope,
  });
}

function wrappedKeySnapshot(db: DatabaseSync, ownerUserId: string): unknown[] {
  return db
    .prepare(
      `SELECT key_id, state, created_at, rotated_at, wrap_version,
              wrapping_kdf_version,
              hex(wrapped_dek_ciphertext) AS ciphertext,
              hex(wrapped_dek_nonce) AS nonce,
              hex(wrapped_dek_tag) AS tag
         FROM user_vault_keys
        WHERE user_id = ?
        ORDER BY created_at, key_id`,
    )
    .all(ownerUserId);
}

describe("per-user Vault V2 keyring", () => {
  it("bootstraps one stable nonsecret installation salt/version without migrating users", () => {
    const first = fixture(["owner-a"]);
    const second = fixture(["owner-a"]);
    try {
      const config = loadVaultInstallationKdfConfigV1(first);
      assert.equal(config.kdfVersion, VAULT_INSTALLATION_KDF_VERSION_V1);
      assert.equal(config.salt.length, 32);
      assert.equal(
        first.prepare("SELECT count(*) AS count FROM user_vault_keys").get()?.count,
        0,
        "database initialization must not import the legacy users row",
      );

      ensureUserVaultKeyringSchema(first);
      assert.deepEqual(loadVaultInstallationKdfConfigV1(first).salt, config.salt);
      assert.notDeepEqual(
        loadVaultInstallationKdfConfigV1(second).salt,
        config.salt,
      );

      const firstContext = deriveVaultMasterKeyContextV2(first, "master-secret");
      assert.throws(
        () =>
          createUserVaultKeyringV2({
            db: second,
            ownerUserId: "owner-a",
            context: firstContext,
          }),
        (error) =>
          error instanceof VaultKeyLifecycleError &&
          error.reason === "invalid_master_key_context",
      );

      first
        .prepare(
          "UPDATE vault_installation_config SET kdf_version = 2 WHERE singleton = 1",
        )
        .run();
      assert.throws(
        () => loadVaultInstallationKdfConfigV1(first),
        (error) =>
          error instanceof VaultKeyLifecycleError &&
          error.reason === "invalid_installation_config",
      );
    } finally {
      first.close();
      second.close();
    }
  });

  it("gives four owners distinct keys, nonces, and ciphertext for the same plaintext", () => {
    const owners = ["owner-a", "owner-b", "owner-c", "owner-d"];
    const db = fixture(owners);
    try {
      const context = deriveVaultMasterKeyContextV2(db, "shared-install-master");
      const plaintext = Buffer.from("same private plaintext");
      const keyIds: string[] = [];
      const nonces: string[] = [];
      const ciphertexts: string[] = [];
      const deks: string[] = [];
      const serializedEnvelopes: string[] = [];
      const envelopes = new Map<string, Buffer>();

      for (const ownerUserId of owners) {
        const key = createUserVaultKeyringV2({
          db,
          ownerUserId,
          context,
          createdAt: CREATED_AT,
        });
        const serialized = encryptForOwner({
          db,
          ownerUserId,
          context,
          plaintext,
        });
        const parsed = parseVaultEnvelopeV2(serialized);
        const resolved = resolveActiveUserVaultKeyV2({
          db,
          ownerUserId,
          context,
        });
        try {
          keyIds.push(key.keyId);
          nonces.push(parsed.nonce.toString("hex"));
          ciphertexts.push(parsed.ciphertext.toString("hex"));
          deks.push(resolved.dek.toString("hex"));
          serializedEnvelopes.push(serialized.toString("hex"));
          envelopes.set(ownerUserId, serialized);
          assert.deepEqual(
            decryptForOwner({
              db,
              ownerUserId,
              context,
              serializedEnvelope: serialized,
            }),
            plaintext,
          );
          assert.equal(serialized.includes(plaintext), false);
        } finally {
          resolved.dek.fill(0);
        }
      }

      for (const values of [
        keyIds,
        nonces,
        ciphertexts,
        deks,
        serializedEnvelopes,
      ]) {
        assert.equal(new Set(values).size, 4);
      }
      assert.equal(
        db.prepare(
          "SELECT count(*) AS count FROM user_vault_keys WHERE state = 'active'",
        ).get()?.count,
        4,
      );
      assert.throws(
        () =>
          decryptForOwner({
            db,
            ownerUserId: "owner-b",
            context,
            serializedEnvelope: envelopes.get("owner-a")!,
          }),
        VaultUnknownKeyIdError,
      );
    } finally {
      db.close();
    }
  });

  it("fails closed for a wrong master and owner/key-bound wrapped-key swaps", () => {
    const db = fixture(["owner-a", "owner-b"]);
    try {
      const context = deriveVaultMasterKeyContextV2(db, "correct-master");
      const wrongContext = deriveVaultMasterKeyContextV2(db, "wrong-master");
      createUserVaultKeyringV2({ db, ownerUserId: "owner-a", context });
      createUserVaultKeyringV2({ db, ownerUserId: "owner-b", context });

      assert.throws(
        () =>
          resolveActiveUserVaultKeyV2({
            db,
            ownerUserId: "owner-a",
            context: wrongContext,
          }),
        VaultAuthenticationError,
      );

      const rows = db
        .prepare(
          `SELECT user_id, wrapped_dek_ciphertext, wrapped_dek_nonce, wrapped_dek_tag
             FROM user_vault_keys
            WHERE state = 'active'
            ORDER BY user_id`,
        )
        .all() as Array<{
        user_id: string;
        wrapped_dek_ciphertext: Uint8Array;
        wrapped_dek_nonce: Uint8Array;
        wrapped_dek_tag: Uint8Array;
      }>;
      assert.equal(rows.length, 2);
      const update = db.prepare(
        `UPDATE user_vault_keys
            SET wrapped_dek_ciphertext = ?, wrapped_dek_nonce = ?, wrapped_dek_tag = ?
          WHERE user_id = ? AND state = 'active'`,
      );
      update.run(
        rows[1].wrapped_dek_ciphertext,
        rows[1].wrapped_dek_nonce,
        rows[1].wrapped_dek_tag,
        rows[0].user_id,
      );
      update.run(
        rows[0].wrapped_dek_ciphertext,
        rows[0].wrapped_dek_nonce,
        rows[0].wrapped_dek_tag,
        rows[1].user_id,
      );

      for (const ownerUserId of ["owner-a", "owner-b"]) {
        assert.throws(
          () =>
            resolveActiveUserVaultKeyV2({ db, ownerUserId, context }),
          VaultAuthenticationError,
        );
      }
    } finally {
      db.close();
    }
  });

  it("rejects unknown keys and ordinary plaintext without a legacy fallback", () => {
    const db = fixture(["owner-a"]);
    try {
      const context = deriveVaultMasterKeyContextV2(db, "master-secret");
      createUserVaultKeyringV2({ db, ownerUserId: "owner-a", context });
      const serialized = encryptForOwner({ db, ownerUserId: "owner-a", context });
      const parsed = parseVaultEnvelopeV2(serialized);
      const unknownKeyEnvelope = serializeVaultEnvelopeV2({
        ...parsed,
        keyId: generateVaultKeyIdV2(),
      });

      assert.throws(
        () =>
          decryptForOwner({
            db,
            ownerUserId: "owner-a",
            context,
            serializedEnvelope: unknownKeyEnvelope,
          }),
        VaultUnknownKeyIdError,
      );
      assert.throws(
        () =>
          decryptForOwner({
            db,
            ownerUserId: "owner-a",
            context,
            serializedEnvelope: Buffer.from("legacy plaintext row"),
          }),
        VaultEnvelopeMalformedError,
      );
    } finally {
      db.close();
    }
  });

  it("rotates transactionally and permits retired-key reads only in migration context", () => {
    const db = fixture(["owner-a"]);
    try {
      const context = deriveVaultMasterKeyContextV2(db, "master-secret");
      const original = createUserVaultKeyringV2({
        db,
        ownerUserId: "owner-a",
        context,
        createdAt: CREATED_AT,
      });
      const oldEnvelope = encryptForOwner({
        db,
        ownerUserId: "owner-a",
        context,
      });
      assert.throws(
        () =>
          rotateUserVaultDekV2({
            db,
            ownerUserId: "owner-a",
            context,
            rotatedAt: "2026-08-31T12:00:00.000Z",
          }),
        (error) =>
          error instanceof VaultKeyLifecycleError &&
          error.reason === "transaction_conflict",
      );
      assert.deepEqual(
        listUserVaultKeysV2(db, "owner-a").map((key) => [key.keyId, key.state]),
        [[original.keyId, "active"]],
      );
      const rotation = rotateUserVaultDekV2({
        db,
        ownerUserId: "owner-a",
        context,
        rotatedAt: ROTATED_AT,
      });
      assert.equal(rotation.retiredKeyId, original.keyId);
      assert.notEqual(rotation.activeKey.keyId, original.keyId);

      const keys = listUserVaultKeysV2(db, "owner-a");
      assert.equal(keys.length, 2);
      assert.deepEqual(
        keys.map((key) => [key.keyId, key.state, key.createdAt, key.rotatedAt]),
        [
          [original.keyId, "retired", CREATED_AT, ROTATED_AT],
          [rotation.activeKey.keyId, "active", ROTATED_AT, null],
        ],
      );
      assert.equal(keys.filter((key) => key.state === "active").length, 1);

      assert.throws(
        () =>
          decryptForOwner({
            db,
            ownerUserId: "owner-a",
            context,
            serializedEnvelope: oldEnvelope,
          }),
        (error) =>
          error instanceof VaultKeyLifecycleError &&
          error.reason === "retired_key_requires_migration_context",
      );
      assert.deepEqual(
        decryptUserVaultContentForMigrationV2({
          db,
          ownerUserId: "owner-a",
          context,
          migrationContext: VAULT_KEYRING_MIGRATION_CONTEXT_V2,
          logicalTable: "messages",
          logicalColumn: "content",
          stableRowId: "message-1",
          serializedEnvelope: oldEnvelope,
        }),
        Buffer.from("same private plaintext"),
      );
      assert.throws(
        () =>
          decryptUserVaultContentForMigrationV2({
            db,
            ownerUserId: "owner-a",
            context,
            migrationContext: {
              kind: "vault-keyring-migration-context-v2",
            } as VaultKeyringMigrationContextV2,
            logicalTable: "messages",
            logicalColumn: "content",
            stableRowId: "message-1",
            serializedEnvelope: oldEnvelope,
          }),
        VaultKeyLifecycleError,
      );

      const newEnvelope = encryptForOwner({
        db,
        ownerUserId: "owner-a",
        context,
      });
      assert.equal(parseVaultEnvelopeV2(newEnvelope).keyId, rotation.activeKey.keyId);
      assert.deepEqual(
        decryptForOwner({
          db,
          ownerUserId: "owner-a",
          context,
          serializedEnvelope: newEnvelope,
        }),
        Buffer.from("same private plaintext"),
      );

      const active = db
        .prepare(
          `SELECT created_at, wrap_version, wrapping_kdf_version,
                  wrapped_dek_ciphertext, wrapped_dek_nonce, wrapped_dek_tag
             FROM user_vault_keys
            WHERE user_id = ? AND state = 'active'`,
        )
        .get("owner-a") as {
        created_at: string;
        wrap_version: number;
        wrapping_kdf_version: number;
        wrapped_dek_ciphertext: Uint8Array;
        wrapped_dek_nonce: Uint8Array;
        wrapped_dek_tag: Uint8Array;
      };
      assert.throws(
        () =>
          db
            .prepare(
              `INSERT INTO user_vault_keys (
                 user_id, key_id, state, created_at, rotated_at,
                 wrap_version, wrapping_kdf_version,
                 wrapped_dek_ciphertext, wrapped_dek_nonce, wrapped_dek_tag
               ) VALUES (?, ?, 'active', ?, NULL, ?, ?, ?, ?, ?)`,
            )
            .run(
              "owner-a",
              generateVaultKeyIdV2(),
              active.created_at,
              active.wrap_version,
              active.wrapping_kdf_version,
              active.wrapped_dek_ciphertext,
              active.wrapped_dek_nonce,
              active.wrapped_dek_tag,
            ),
        /UNIQUE constraint failed/u,
      );
      assert.throws(
        () => createUserVaultKeyringV2({ db, ownerUserId: "owner-a", context }),
        (error) =>
          error instanceof VaultKeyLifecycleError &&
          error.reason === "keyring_already_initialized",
      );
      assert.equal(
        db.prepare(
          "SELECT count(*) AS count FROM user_vault_keys WHERE user_id = ? AND state = 'active'",
        ).get("owner-a")?.count,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("rewraps the same DEKs under a new master atomically", () => {
    const db = fixture(["owner-a"]);
    try {
      const oldContext = deriveVaultMasterKeyContextV2(db, "old-master");
      const wrongContext = deriveVaultMasterKeyContextV2(db, "wrong-master");
      const newContext = deriveVaultMasterKeyContextV2(db, "new-master");
      createUserVaultKeyringV2({
        db,
        ownerUserId: "owner-a",
        context: oldContext,
        createdAt: CREATED_AT,
      });
      const retiredEnvelope = encryptForOwner({
        db,
        ownerUserId: "owner-a",
        context: oldContext,
      });
      rotateUserVaultDekV2({
        db,
        ownerUserId: "owner-a",
        context: oldContext,
        rotatedAt: ROTATED_AT,
      });
      const activeEnvelope = encryptForOwner({
        db,
        ownerUserId: "owner-a",
        context: oldContext,
      });
      const beforeKey = resolveActiveUserVaultKeyV2({
        db,
        ownerUserId: "owner-a",
        context: oldContext,
      });
      const beforeMetadata = listUserVaultKeysV2(db, "owner-a");
      const beforeWrapped = wrappedKeySnapshot(db, "owner-a");

      assert.throws(
        () =>
          rewrapUserVaultKeyringMasterV2({
            db,
            ownerUserId: "owner-a",
            oldContext: wrongContext,
            newContext,
          }),
        VaultAuthenticationError,
      );
      assert.deepEqual(wrappedKeySnapshot(db, "owner-a"), beforeWrapped);

      assert.equal(
        rewrapUserVaultKeyringMasterV2({
          db,
          ownerUserId: "owner-a",
          oldContext,
          newContext,
        }),
        2,
      );
      assert.notDeepEqual(wrappedKeySnapshot(db, "owner-a"), beforeWrapped);
      assert.deepEqual(listUserVaultKeysV2(db, "owner-a"), beforeMetadata);
      assert.throws(
        () =>
          resolveActiveUserVaultKeyV2({
            db,
            ownerUserId: "owner-a",
            context: oldContext,
          }),
        VaultAuthenticationError,
      );
      const afterKey = resolveActiveUserVaultKeyV2({
        db,
        ownerUserId: "owner-a",
        context: newContext,
      });
      try {
        assert.deepEqual(afterKey.dek, beforeKey.dek);
        assert.equal(afterKey.keyId, beforeKey.keyId);
      } finally {
        afterKey.dek.fill(0);
        beforeKey.dek.fill(0);
      }
      assert.deepEqual(
        decryptForOwner({
          db,
          ownerUserId: "owner-a",
          context: newContext,
          serializedEnvelope: activeEnvelope,
        }),
        Buffer.from("same private plaintext"),
      );
      assert.deepEqual(
        decryptUserVaultContentForMigrationV2({
          db,
          ownerUserId: "owner-a",
          context: newContext,
          migrationContext: VAULT_KEYRING_MIGRATION_CONTEXT_V2,
          logicalTable: "messages",
          logicalColumn: "content",
          stableRowId: "message-1",
          serializedEnvelope: retiredEnvelope,
        }),
        Buffer.from("same private plaintext"),
      );
    } finally {
      db.close();
    }
  });

  it("imports a legacy 32-byte DEK only through the explicit bridge", () => {
    const db = fixture(["owner-a"]);
    try {
      const context = deriveVaultMasterKeyContextV2(db, "master-secret");
      const legacyDek = randomBytes(32);
      const expected = Buffer.from(legacyDek);
      const imported = importLegacyUserDekIntoVaultKeyringV2({
        db,
        ownerUserId: "owner-a",
        context,
        legacyDek,
        createdAt: CREATED_AT,
      });
      const resolved = resolveActiveUserVaultKeyV2({
        db,
        ownerUserId: "owner-a",
        context,
      });
      try {
        assert.equal(resolved.keyId, imported.keyId);
        assert.deepEqual(resolved.dek, expected);
      } finally {
        resolved.dek.fill(0);
        expected.fill(0);
        legacyDek.fill(0);
      }
    } finally {
      db.close();
    }
  });
});
