import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createEncryptedAccountOwnerV2 } from "../account-auth-vault.ts";
import { initializeDatabase } from "../db.ts";
import {
  deleteAllOwnerAssetsV1,
  deleteOwnerAssetV1,
  ownerAssetCiphertextSizeBytesV1,
  readOwnerAssetBytesV1,
  readOwnerAssetStreamV1,
  writeOwnerAssetBytesV1,
  writeOwnerAssetStreamV1,
  type OwnerAssetStorageIdentityV1,
} from "../owner-asset-storage.ts";
import { deriveMasterKey, encryptText } from "../security.ts";
import { deriveVaultMasterKeyContextV2 } from "../user-vault-keyring.ts";

const MASTER_SECRET = "owner-asset-storage-test-master";

function createOwner(db: DatabaseSync, index: number): string {
  const ownerUserId = `storage-owner-${index}`;
  const userDek = randomBytes(32);
  const masterKey = deriveMasterKey(MASTER_SECRET);
  const wrapped = encryptText(userDek.toString("base64"), masterKey);
  masterKey.fill(0);
  try {
    createEncryptedAccountOwnerV2({
      db,
      ownerUserId,
      loginIdentity: `${ownerUserId}@example.test`,
      displayName: `Storage Owner ${index}`,
      passwordHash: `hash-${index}`,
      passwordSalt: `salt-${index}`,
      wrappedUserKey: wrapped.ciphertext,
      wrappedUserKeyIv: wrapped.iv,
      wrappedUserKeyTag: wrapped.tag,
      userDek,
      createdAt: `2026-09-01T0${index}:00:00.000Z`,
    });
  } finally {
    userDek.fill(0);
  }
  return ownerUserId;
}

describe("owner asset ciphertext storage", () => {
  it("keeps four identical asset libraries opaque, encrypted, and lifecycle-independent", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "prism-owner-assets-"));
    const previousDbPath = process.env.DB_PATH;
    process.env.DB_PATH = join(tempDirectory, "localai.db");
    const db = initializeDatabase(
      new DatabaseSync(process.env.DB_PATH),
      MASTER_SECRET,
    );
    try {
      const context = deriveVaultMasterKeyContextV2(db, MASTER_SECRET);
      const ownerIds = Array.from({ length: 4 }, (_, index) =>
        createOwner(db, index),
      );
      const plaintext = Buffer.concat([
        Buffer.from("owner-asset-filesystem-plaintext-canary\0", "utf8"),
        randomBytes(5_000),
      ]);
      const identities: OwnerAssetStorageIdentityV1[] = ownerIds.map(
        (ownerUserId) => ({
          db,
          context,
          ownerUserId,
          assetClass: "image-original",
          stableAssetId: "same-image-id",
        }),
      );
      const records = identities.map((identity) =>
        writeOwnerAssetBytesV1({ identity, bytes: plaintext, exclusive: true }),
      );

      assert.equal(new Set(records.map((row) => row.localRelativePath)).size, 4);
      assert.equal(new Set(records.map((row) => row.tenantContentHash)).size, 4);
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index]!;
        const identity = identities[index]!;
        assert.doesNotMatch(record.localRelativePath, /storage-owner|same-image-id/u);
        const absolutePath = join(tempDirectory, record.localRelativePath);
        const stored = readFileSync(absolutePath);
        assert.equal(stored.includes(plaintext), false);
        assert.equal(stored.includes(Buffer.from(identity.ownerUserId)), false);
        assert.equal(statSync(absolutePath).mode & 0o777, 0o600);
        assert.equal(
          ownerAssetCiphertextSizeBytesV1({
            identity,
            localRelativePath: record.localRelativePath,
          }),
          stored.length,
        );
        assert.deepEqual(
          readOwnerAssetBytesV1({
            identity,
            localRelativePath: record.localRelativePath,
          }),
          plaintext,
        );
      }

      assert.throws(
        () =>
          readOwnerAssetBytesV1({
            identity: identities[1]!,
            localRelativePath: records[0]!.localRelativePath,
          }),
        /unavailable/u,
      );
      assert.throws(
        () =>
          readOwnerAssetBytesV1({
            identity: {
              ...identities[0]!,
              stableAssetId: "different-image-id",
            },
            localRelativePath: records[0]!.localRelativePath,
          }),
        /unavailable/u,
      );

      const replacement = Buffer.from("encrypted-owner-zero-replacement");
      const replaced = writeOwnerAssetBytesV1({
        identity: identities[0]!,
        bytes: replacement,
      });
      assert.equal(replaced.localRelativePath, records[0]!.localRelativePath);
      assert.deepEqual(
        readOwnerAssetBytesV1({
          identity: identities[0]!,
          localRelativePath: replaced.localRelativePath,
        }),
        replacement,
      );
      for (let index = 1; index < records.length; index += 1) {
        assert.deepEqual(
          readOwnerAssetBytesV1({
            identity: identities[index]!,
            localRelativePath: records[index]!.localRelativePath,
          }),
          plaintext,
        );
      }

      assert.equal(
        deleteOwnerAssetV1({
          identity: identities[0]!,
          localRelativePath: records[0]!.localRelativePath,
        }),
        true,
      );
      assert.equal(
        existsSync(join(tempDirectory, records[0]!.localRelativePath)),
        false,
      );
      for (const record of records.slice(1)) {
        assert.equal(existsSync(join(tempDirectory, record.localRelativePath)), true);
      }

      assert.equal(
        deleteAllOwnerAssetsV1({
          db,
          context,
          ownerUserId: ownerIds[1]!,
        }),
        true,
      );
      assert.equal(
        existsSync(join(tempDirectory, records[1]!.localRelativePath)),
        false,
      );
      assert.equal(existsSync(join(tempDirectory, records[2]!.localRelativePath)), true);
      assert.equal(existsSync(join(tempDirectory, records[3]!.localRelativePath)), true);

      const mediaRoot = join(tempDirectory, "account-vault-media-v1");
      const pendingPlaintextTemps = readdirSync(mediaRoot, {
        recursive: true,
      }).filter((entry) => String(entry).endsWith(".tmp"));
      assert.deepEqual(pendingPlaintextTemps, []);
      plaintext.fill(0);
      replacement.fill(0);
    } finally {
      db.close();
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it("streams large assets through ciphertext-only temporary files", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "prism-owner-stream-"));
    const previousDbPath = process.env.DB_PATH;
    process.env.DB_PATH = join(tempDirectory, "localai.db");
    const db = initializeDatabase(
      new DatabaseSync(process.env.DB_PATH),
      MASTER_SECRET,
    );
    try {
      const context = deriveVaultMasterKeyContextV2(db, MASTER_SECRET);
      const ownerIds = Array.from({ length: 4 }, (_, index) =>
        createOwner(db, index),
      );
      const canary = Buffer.from("streaming-owner-file-plaintext-canary", "utf8");
      const first = Buffer.concat([canary, randomBytes(300_000)]);
      const second = Buffer.concat([randomBytes(400_000), canary]);
      const identity: OwnerAssetStorageIdentityV1 = {
        db,
        context,
        ownerUserId: ownerIds[0]!,
        assetClass: "large-replay-media",
        stableAssetId: "streamed-recording",
      };
      let inspectedPendingCiphertext = false;
      async function* plaintextSource() {
        yield first;
        const mediaRoot = join(tempDirectory, "account-vault-media-v1");
        const pending = readdirSync(mediaRoot, { recursive: true })
          .map(String)
          .filter((entry) => entry.endsWith(".tmp"));
        assert.equal(pending.length, 1);
        const pendingBytes = readFileSync(join(mediaRoot, pending[0]!));
        assert.equal(pendingBytes.includes(canary), false);
        inspectedPendingCiphertext = true;
        yield second;
      }

      const record = await writeOwnerAssetStreamV1({
        identity,
        plaintext: plaintextSource(),
        exclusive: true,
      });
      assert.equal(inspectedPendingCiphertext, true);
      assert.equal(record.plaintextBytes, first.length + second.length);
      const stored = readFileSync(join(tempDirectory, record.localRelativePath));
      assert.equal(stored.includes(canary), false);

      const opened: Buffer[] = [];
      const openReport = await readOwnerAssetStreamV1({
        identity,
        localRelativePath: record.localRelativePath,
        writePlaintext: (chunk) => opened.push(Buffer.from(chunk)),
      });
      assert.equal(openReport.plaintextBytes, first.length + second.length);
      assert.deepEqual(Buffer.concat(opened), Buffer.concat([first, second]));

      await assert.rejects(
        readOwnerAssetStreamV1({
          identity: { ...identity, ownerUserId: ownerIds[1]! },
          localRelativePath: record.localRelativePath,
          writePlaintext: () => undefined,
        }),
        /unavailable/u,
      );
      const remainingTemps = readdirSync(
        join(tempDirectory, "account-vault-media-v1"),
        { recursive: true },
      ).filter((entry) => String(entry).endsWith(".tmp"));
      assert.deepEqual(remainingTemps, []);
      first.fill(0);
      second.fill(0);
      for (const chunk of opened) chunk.fill(0);
    } finally {
      db.close();
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
