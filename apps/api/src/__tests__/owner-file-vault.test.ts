import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createEncryptedAccountOwnerV2 } from "../account-auth-vault.ts";
import { initializeDatabase } from "../db.ts";
import {
  loadOrCreateOwnerFileRootKeyV1,
  openOwnerFileBufferV1,
  openOwnerFileEnvelopeV1,
  ownerFileRootEnvelopeKeyIdV1,
  ownerFileTenantContentHashV1,
  ownerOpaqueAssetFileNameV1,
  ownerOpaqueDirectoryNameV1,
  sealOwnerFileBufferV1,
  sealOwnerFileEnvelopeV1,
} from "../owner-file-vault.ts";
import { deriveMasterKey, encryptText } from "../security.ts";
import {
  deriveVaultMasterKeyContextV2,
  type VaultMasterKeyContextV2,
} from "../user-vault-keyring.ts";
import {
  VaultAuthenticationError,
  VaultEnvelopeMalformedError,
  VaultUnknownKeyIdError,
} from "../vault-envelope-v2.ts";

const MASTER_SECRET = "owner-file-vault-test-master";

function createOwner(
  db: DatabaseSync,
  index: number,
): { ownerUserId: string; identity: string } {
  const ownerUserId = `file-owner-${index}`;
  const identity = `file-owner-${index}@example.test`;
  const userDek = randomBytes(32);
  const masterKey = deriveMasterKey(MASTER_SECRET);
  const wrapped = encryptText(userDek.toString("base64"), masterKey);
  masterKey.fill(0);
  try {
    createEncryptedAccountOwnerV2({
      db,
      ownerUserId,
      loginIdentity: identity,
      displayName: `File Owner ${index}`,
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
  return { ownerUserId, identity };
}

async function* unevenChunks(
  bytes: Uint8Array,
  sizes: readonly number[],
): AsyncGenerator<Buffer> {
  let offset = 0;
  let sizeIndex = 0;
  while (offset < bytes.length) {
    const size = sizes[sizeIndex % sizes.length] ?? 1;
    const end = Math.min(bytes.length, offset + size);
    yield Buffer.from(bytes.subarray(offset, end));
    offset = end;
    sizeIndex += 1;
  }
}

function collectingWriter(chunks: Buffer[]): (chunk: Buffer) => void {
  return (chunk) => chunks.push(Buffer.from(chunk));
}

function openRoot(
  db: DatabaseSync,
  context: VaultMasterKeyContextV2,
  ownerUserId: string,
): Buffer {
  return loadOrCreateOwnerFileRootKeyV1({
    db,
    context,
    ownerUserId,
    createdAt: "2026-09-01T12:00:00.000Z",
  });
}

describe("Owner File Vault V1", () => {
  it("gives four owners independent ciphertext, hashes, opaque paths, and deletion lifecycles for identical bytes", async () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"), MASTER_SECRET);
    try {
      const context = deriveVaultMasterKeyContextV2(db, MASTER_SECRET);
      const owners = Array.from({ length: 4 }, (_, index) =>
        createOwner(db, index),
      );
      const plaintext = Buffer.concat([
        Buffer.from("four-owner-asset-plaintext-canary\0", "utf8"),
        randomBytes(12_500),
      ]);
      const sealed: Array<{
        ownerUserId: string;
        rootKey: Buffer;
        ciphertext: Buffer;
        contentHash: string;
        directory: string;
        filename: string;
      }> = [];

      for (const owner of owners) {
        const rootKey = openRoot(db, context, owner.ownerUserId);
        const ciphertextChunks: Buffer[] = [];
        const report = await sealOwnerFileEnvelopeV1({
          rootKey,
          binding: {
            ownerUserId: owner.ownerUserId,
            assetClass: "image-original",
            stableAssetId: "same-logical-id-in-each-account",
          },
          plaintext: unevenChunks(plaintext, [1, 17, 4093, 7, 8_192]),
          writeCiphertext: collectingWriter(ciphertextChunks),
          chunkBytes: 4_096,
        });
        const ciphertext = Buffer.concat(ciphertextChunks);
        assert.equal(report.plaintextBytes, plaintext.length);
        assert.equal(report.ciphertextBytes, ciphertext.length);
        assert.equal(ciphertext.includes(plaintext), false);
        assert.equal(
          ciphertext.includes(Buffer.from(owner.ownerUserId, "utf8")),
          false,
        );
        assert.equal(
          ciphertext.includes(
            Buffer.from("same-logical-id-in-each-account", "utf8"),
          ),
          false,
        );
        sealed.push({
          ownerUserId: owner.ownerUserId,
          rootKey,
          ciphertext,
          contentHash: report.tenantContentHash,
          directory: ownerOpaqueDirectoryNameV1(rootKey),
          filename: ownerOpaqueAssetFileNameV1(
            rootKey,
            "same-logical-id-in-each-account",
          ),
        });
      }

      assert.equal(new Set(sealed.map((item) => item.contentHash)).size, 4);
      assert.equal(new Set(sealed.map((item) => item.directory)).size, 4);
      assert.equal(new Set(sealed.map((item) => item.filename)).size, 4);
      assert.equal(
        new Set(sealed.map((item) => item.ciphertext.toString("hex"))).size,
        4,
      );

      for (const item of sealed) {
        const openedChunks: Buffer[] = [];
        const report = await openOwnerFileEnvelopeV1({
          rootKey: item.rootKey,
          binding: {
            ownerUserId: item.ownerUserId,
            assetClass: "image-original",
            stableAssetId: "same-logical-id-in-each-account",
          },
          ciphertext: unevenChunks(item.ciphertext, [3, 2, 819, 5_003]),
          writePlaintext: collectingWriter(openedChunks),
        });
        assert.deepEqual(Buffer.concat(openedChunks), plaintext);
        assert.equal(report.tenantContentHash, item.contentHash);
      }

      await assert.rejects(
        () =>
          openOwnerFileEnvelopeV1({
            rootKey: sealed[1]!.rootKey,
            binding: {
              ownerUserId: sealed[0]!.ownerUserId,
              assetClass: "image-original",
              stableAssetId: "same-logical-id-in-each-account",
            },
            ciphertext: [sealed[0]!.ciphertext],
            writePlaintext: () => undefined,
          }),
        VaultAuthenticationError,
      );
      await assert.rejects(
        () =>
          openOwnerFileEnvelopeV1({
            rootKey: sealed[0]!.rootKey,
            binding: {
              ownerUserId: sealed[0]!.ownerUserId,
              assetClass: "image-thumbnail",
              stableAssetId: "same-logical-id-in-each-account",
            },
            ciphertext: [sealed[0]!.ciphertext],
            writePlaintext: () => undefined,
          }),
        VaultAuthenticationError,
      );

      const survivingCiphertexts = new Map(
        sealed.map((item) => [item.ownerUserId, item.ciphertext]),
      );
      survivingCiphertexts.delete(sealed[0]!.ownerUserId);
      assert.equal(survivingCiphertexts.size, 3);
      for (const item of sealed.slice(1)) {
        assert.deepEqual(survivingCiphertexts.get(item.ownerUserId), item.ciphertext);
      }

      for (const item of sealed) item.rootKey.fill(0);
      plaintext.fill(0);
    } finally {
      db.close();
    }
  });

  it("fails closed for tampering, truncation, trailing bytes, and binding transplants", async () => {
    const rootKey = randomBytes(32);
    const binding = {
      ownerUserId: "tamper-owner",
      assetClass: "audio-original",
      stableAssetId: "audio-asset-1",
    };
    const plaintext = randomBytes(9_000);
    const chunks: Buffer[] = [];
    await sealOwnerFileEnvelopeV1({
      rootKey,
      binding,
      plaintext: unevenChunks(plaintext, [777, 2_111]),
      writeCiphertext: collectingWriter(chunks),
      chunkBytes: 4_096,
    });
    const envelope = Buffer.concat(chunks);

    const tampered = Buffer.from(envelope);
    tampered[tampered.length - 1] ^= 0x01;
    await assert.rejects(
      () =>
        openOwnerFileEnvelopeV1({
          rootKey,
          binding,
          ciphertext: [tampered],
          writePlaintext: () => undefined,
        }),
      VaultAuthenticationError,
    );
    await assert.rejects(
      () =>
        openOwnerFileEnvelopeV1({
          rootKey,
          binding,
          ciphertext: [envelope.subarray(0, envelope.length - 1)],
          writePlaintext: () => undefined,
        }),
      VaultEnvelopeMalformedError,
    );
    await assert.rejects(
      () =>
        openOwnerFileEnvelopeV1({
          rootKey,
          binding,
          ciphertext: [Buffer.concat([envelope, Buffer.from([0])])],
          writePlaintext: () => undefined,
        }),
      VaultEnvelopeMalformedError,
    );
    await assert.rejects(
      () =>
        openOwnerFileEnvelopeV1({
          rootKey,
          binding: { ...binding, stableAssetId: "audio-asset-2" },
          ciphertext: [envelope],
          writePlaintext: () => undefined,
        }),
      VaultAuthenticationError,
    );
    rootKey.fill(0);
    plaintext.fill(0);
  });

  it("stores each tenant root only as an owner-bound Vault envelope", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"), MASTER_SECRET);
    try {
      const context = deriveVaultMasterKeyContextV2(db, MASTER_SECRET);
      const ownerA = createOwner(db, 0).ownerUserId;
      const ownerB = createOwner(db, 1).ownerUserId;
      const rootA = openRoot(db, context, ownerA);
      const rootB = openRoot(db, context, ownerB);
      const rows = db
        .prepare(
          `SELECT user_id, encrypted_root_key
             FROM owner_file_vault_roots ORDER BY user_id`,
        )
        .all() as Array<{ user_id: string; encrypted_root_key: Uint8Array }>;
      assert.equal(rows.length, 2);
      assert.equal(rows[0]!.encrypted_root_key instanceof Uint8Array, true);
      assert.equal(
        Buffer.from(rows[0]!.encrypted_root_key).includes(rootA),
        false,
      );
      assert.notEqual(
        ownerFileRootEnvelopeKeyIdV1(rows[0]!.encrypted_root_key),
        ownerFileRootEnvelopeKeyIdV1(rows[1]!.encrypted_root_key),
      );
      assert.notEqual(
        ownerFileTenantContentHashV1(rootA, Buffer.from("same bytes")),
        ownerFileTenantContentHashV1(rootB, Buffer.from("same bytes")),
      );
      assert.equal(
        ownerFileTenantContentHashV1(rootA, Buffer.from("same bytes")),
        ownerFileTenantContentHashV1(rootA, Buffer.from("same bytes")),
      );
      assert.notEqual(
        ownerOpaqueAssetFileNameV1(rootA, "asset-a"),
        ownerOpaqueAssetFileNameV1(rootA, "asset-b"),
      );

      const originalB = Buffer.from(rows[1]!.encrypted_root_key);
      db.prepare(
        "UPDATE owner_file_vault_roots SET encrypted_root_key = ? WHERE user_id = ?",
      ).run(rows[0]!.encrypted_root_key, ownerB);
      assert.throws(
        () => loadOrCreateOwnerFileRootKeyV1({ db, context, ownerUserId: ownerB }),
        VaultUnknownKeyIdError,
      );
      db.prepare(
        "UPDATE owner_file_vault_roots SET encrypted_root_key = ? WHERE user_id = ?",
      ).run(originalB, ownerB);
      assert.deepEqual(
        loadOrCreateOwnerFileRootKeyV1({ db, context, ownerUserId: ownerB }),
        rootB,
      );
      db.prepare("DELETE FROM users WHERE id = ?").run(ownerA);
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM owner_file_vault_roots WHERE user_id = ?",
            )
            .get(ownerA) as { count: number }
        ).count,
        0,
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM owner_file_vault_roots WHERE user_id = ?",
            )
            .get(ownerB) as { count: number }
        ).count,
        1,
      );
      rootA.fill(0);
      rootB.fill(0);
    } finally {
      db.close();
    }
  });

  it("authenticates an empty file with a mandatory final record", async () => {
    const rootKey = randomBytes(32);
    const binding = {
      ownerUserId: "empty-owner",
      assetClass: "document-original",
      stableAssetId: "empty-file",
    };
    const chunks: Buffer[] = [];
    const sealed = await sealOwnerFileEnvelopeV1({
      rootKey,
      binding,
      plaintext: [],
      writeCiphertext: collectingWriter(chunks),
    });
    const openedChunks: Buffer[] = [];
    const opened = await openOwnerFileEnvelopeV1({
      rootKey,
      binding,
      ciphertext: chunks,
      writePlaintext: collectingWriter(openedChunks),
    });
    assert.equal(Buffer.concat(openedChunks).length, 0);
    assert.equal(sealed.recordCount, 1);
    assert.equal(opened.recordCount, 1);
    assert.equal(opened.tenantContentHash, sealed.tenantContentHash);
    rootKey.fill(0);
  });

  it("keeps synchronous buffer callers on the identical streaming envelope format", async () => {
    const rootKey = randomBytes(32);
    const binding = {
      ownerUserId: "buffer-owner",
      assetClass: "image-original",
      stableAssetId: "buffer-asset",
    };
    const source = randomBytes(10_000);
    const sealedBuffer = sealOwnerFileBufferV1({
      rootKey,
      binding,
      plaintext: source,
      chunkBytes: 4_096,
    });
    const asyncOpenedChunks: Buffer[] = [];
    const asyncOpened = await openOwnerFileEnvelopeV1({
      rootKey,
      binding,
      ciphertext: unevenChunks(sealedBuffer.ciphertext, [1, 31, 777]),
      writePlaintext: collectingWriter(asyncOpenedChunks),
    });
    assert.deepEqual(Buffer.concat(asyncOpenedChunks), source);
    assert.equal(
      asyncOpened.tenantContentHash,
      sealedBuffer.report.tenantContentHash,
    );

    const streamingChunks: Buffer[] = [];
    const streamingSealed = await sealOwnerFileEnvelopeV1({
      rootKey,
      binding,
      plaintext: unevenChunks(source, [13, 2_000, 5]),
      writeCiphertext: collectingWriter(streamingChunks),
      chunkBytes: 4_096,
    });
    const bufferOpened = openOwnerFileBufferV1({
      rootKey,
      binding,
      ciphertext: Buffer.concat(streamingChunks),
    });
    assert.deepEqual(bufferOpened.plaintext, source);
    assert.equal(
      bufferOpened.report.tenantContentHash,
      streamingSealed.tenantContentHash,
    );
    bufferOpened.plaintext.fill(0);
    source.fill(0);
    rootKey.fill(0);
  });
});
