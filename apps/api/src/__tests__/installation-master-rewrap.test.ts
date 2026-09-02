import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import {
  createEncryptedAccountOwnerV2,
  findAccountOwnerIdByLoginIdentityV2,
} from "../account-auth-vault.ts";
import { requireValidSession, createSessionToken } from "../auth.ts";
import { initializeDatabase } from "../db.ts";
import { rewrapInstallationMasterKeyV2 } from "../installation-master-rewrap.ts";
import { decryptText, deriveMasterKey, encryptText } from "../security.ts";

const OLD_MASTER = "installation-master-rewrap-old";
const NEW_MASTER = "installation-master-rewrap-new";
const createdDirectories: string[] = [];

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "prism-master-rewrap-"));
  createdDirectories.push(directory);
  return join(directory, "fixture.db");
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createFourOwnerFixture(path: string): {
  ownerIds: string[];
  identities: string[];
  settings: string[];
  sessionTokens: string[];
  legacyDeks: Buffer[];
} {
  const db = initializeDatabase(new DatabaseSync(path), OLD_MASTER);
  const ownerIds: string[] = [];
  const identities: string[] = [];
  const settings: string[] = [];
  const sessionTokens: string[] = [];
  const legacyDeks: Buffer[] = [];
  const oldMasterKey = deriveMasterKey(OLD_MASTER);
  try {
    for (let index = 0; index < 4; index += 1) {
      const ownerId = `rewrap-owner-${index}`;
      const identity = `rewrap-${index}@example.test`;
      const setting = `owner-${index}-private-model`;
      const userDek = randomBytes(32);
      const wrapped = encryptText(userDek.toString("base64"), oldMasterKey);
      createEncryptedAccountOwnerV2({
        db,
        ownerUserId: ownerId,
        loginIdentity: identity,
        displayName: `Rewrap Owner ${index}`,
        passwordHash: `hash-${index}`,
        passwordSalt: `salt-${index}`,
        wrappedUserKey: wrapped.ciphertext,
        wrappedUserKeyIv: wrapped.iv,
        wrappedUserKeyTag: wrapped.tag,
        userDek,
        createdAt: `2026-09-02T0${index}:00:00.000Z`,
        initialPrivateValues: { preferred_local_model: setting },
      });
      ownerIds.push(ownerId);
      identities.push(identity);
      settings.push(setting);
      sessionTokens.push(
        createSessionToken(
          db,
          ownerId,
          24,
          new Date("2026-09-02T12:00:00.000Z"),
        ).token,
      );
      legacyDeks.push(Buffer.from(userDek));
      userDek.fill(0);
    }
  } finally {
    oldMasterKey.fill(0);
    db.close();
  }
  return { ownerIds, identities, settings, sessionTokens, legacyDeks };
}

function wrappingSnapshot(db: DatabaseSync): unknown {
  return {
    auth: db
      .prepare(
        `SELECT hex(wrapped_key_ciphertext) AS ciphertext,
                hex(wrapped_key_nonce) AS nonce, hex(wrapped_key_tag) AS tag
           FROM account_auth_installation_key WHERE singleton = 1`,
      )
      .get(),
    owners: db
      .prepare(
        `SELECT id, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag
           FROM main.users ORDER BY id`,
      )
      .all(),
    keyring: db
      .prepare(
        `SELECT user_id, key_id, hex(wrapped_dek_ciphertext) AS ciphertext,
                hex(wrapped_dek_nonce) AS nonce, hex(wrapped_dek_tag) AS tag
           FROM user_vault_keys ORDER BY user_id, key_id`,
      )
      .all(),
  };
}

describe("installation master-key rewrap", () => {
  it("atomically rewraps all four owners while preserving login, settings, sessions, and DEKs", () => {
    const path = databasePath();
    const fixture = createFourOwnerFixture(path);
    let db = new DatabaseSync(path);
    const before = wrappingSnapshot(db);

    assert.deepEqual(rewrapInstallationMasterKeyV2({
      db,
      oldMasterSecret: OLD_MASTER,
      newMasterSecret: NEW_MASTER,
    }), {
      ownerCount: 4,
      legacyOwnerKeyCount: 4,
      vaultKeyCount: 4,
      accountAuthInstallationKeyCount: 1,
    });
    assert.notDeepEqual(wrappingSnapshot(db), before);
    db.close();

    db = initializeDatabase(new DatabaseSync(path), NEW_MASTER);
    const newMasterKey = deriveMasterKey(NEW_MASTER);
    try {
      for (let index = 0; index < fixture.ownerIds.length; index += 1) {
        const ownerId = fixture.ownerIds[index]!;
        assert.equal(
          findAccountOwnerIdByLoginIdentityV2(db, fixture.identities[index]!),
          ownerId,
        );
        assert.equal(
          (db.prepare("SELECT preferred_local_model FROM users WHERE id = ?").get(
            ownerId,
          ) as { preferred_local_model: string }).preferred_local_model,
          fixture.settings[index],
        );
        assert.equal(
          requireValidSession(
            db,
            fixture.sessionTokens[index]!,
            new Date("2026-09-02T12:01:00.000Z"),
          ).userId,
          ownerId,
        );
        const row = db.prepare(
          `SELECT wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag
             FROM users WHERE id = ?`,
        ).get(ownerId) as {
          wrapped_user_key: string;
          wrapped_user_key_iv: string;
          wrapped_user_key_tag: string;
        };
        const opened = Buffer.from(decryptText({
          ciphertext: row.wrapped_user_key,
          iv: row.wrapped_user_key_iv,
          tag: row.wrapped_user_key_tag,
        }, newMasterKey), "base64");
        assert.deepEqual(opened, fixture.legacyDeks[index]);
        opened.fill(0);
      }
    } finally {
      newMasterKey.fill(0);
      db.close();
      for (const dek of fixture.legacyDeks) dek.fill(0);
    }

    const wrongMasterDb = new DatabaseSync(path);
    assert.throws(
      () => initializeDatabase(wrongMasterDb, OLD_MASTER),
      /Vault content could not be opened/u,
    );
    wrongMasterDb.close();
  });

  it("rolls every wrapping layer back if a later owner keyring is corrupt", () => {
    const path = databasePath();
    const fixture = createFourOwnerFixture(path);
    const db = new DatabaseSync(path);
    const lastOwner = fixture.ownerIds.at(-1)!;
    db.prepare(
      `UPDATE user_vault_keys
          SET wrapped_dek_tag = zeroblob(16)
        WHERE user_id = ?`,
    ).run(lastOwner);
    const before = wrappingSnapshot(db);

    assert.throws(
      () => rewrapInstallationMasterKeyV2({
        db,
        oldMasterSecret: OLD_MASTER,
        newMasterSecret: NEW_MASTER,
      }),
      /Vault content could not be opened/u,
    );
    assert.deepEqual(wrappingSnapshot(db), before);
    db.close();
    for (const dek of fixture.legacyDeks) dek.fill(0);
  });
});
