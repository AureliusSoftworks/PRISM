import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VAULT_ENVELOPE_VERSION_V2,
  VaultAuthenticationError,
  VaultEnvelopeMalformedError,
  VaultKeyLifecycleError,
  VaultUnknownKeyIdError,
  buildVaultContentAadV2,
  decryptVaultContentV2,
  encryptVaultContentV2,
  generateVaultKeyIdV2,
  parseVaultEnvelopeV2,
  redactVaultV2ErrorForHttp,
  serializeVaultEnvelopeV2,
  type VaultContentBindingV2,
} from "../vault-envelope-v2.ts";

const BINDING: VaultContentBindingV2 = {
  ownerUserId: "owner-a",
  logicalTable: "messages",
  logicalColumn: "content",
  stableRowId: "message-1",
};

describe("Vault Envelope V2", () => {
  it("round-trips one canonical binary envelope with explicit bounded fields", () => {
    const dek = randomBytes(32);
    const keyId = generateVaultKeyIdV2();
    const plaintext = Buffer.from("private account content", "utf8");
    const serialized = encryptVaultContentV2({
      plaintext,
      dek,
      keyId,
      binding: BINDING,
    });
    const parsed = parseVaultEnvelopeV2(serialized);

    assert.equal(parsed.version, VAULT_ENVELOPE_VERSION_V2);
    assert.equal(parsed.keyId, keyId);
    assert.equal(parsed.nonce.length, 12);
    assert.equal(parsed.tag.length, 16);
    assert.equal(parsed.ciphertext.length, plaintext.length);
    assert.notDeepEqual(parsed.ciphertext, plaintext);
    assert.deepEqual(serializeVaultEnvelopeV2(parsed), serialized);
    assert.deepEqual(
      decryptVaultContentV2({ serializedEnvelope: serialized, dek, binding: BINDING }),
      plaintext,
    );

    const aad = buildVaultContentAadV2(BINDING);
    assert.equal(aad.includes(Buffer.from(BINDING.ownerUserId)), true);
    assert.equal(aad.includes(Buffer.from(BINDING.logicalTable)), true);
    assert.equal(aad.includes(Buffer.from(BINDING.logicalColumn)), true);
    assert.equal(aad.includes(Buffer.from(BINDING.stableRowId)), true);
  });

  it("authenticates the DEK and every owner/table/column/row binding", () => {
    const dek = randomBytes(32);
    const serialized = encryptVaultContentV2({
      plaintext: Buffer.from("bound payload"),
      dek,
      keyId: generateVaultKeyIdV2(),
      binding: BINDING,
    });

    assert.throws(
      () =>
        decryptVaultContentV2({
          serializedEnvelope: serialized,
          dek: randomBytes(32),
          binding: BINDING,
        }),
      VaultAuthenticationError,
    );
    for (const binding of [
      { ...BINDING, ownerUserId: "owner-b" },
      { ...BINDING, logicalTable: "memories" },
      { ...BINDING, logicalColumn: "summary" },
      { ...BINDING, stableRowId: "message-2" },
    ]) {
      assert.throws(
        () =>
          decryptVaultContentV2({
            serializedEnvelope: serialized,
            dek,
            binding,
          }),
        VaultAuthenticationError,
      );
    }
  });

  it("rejects malformed, unknown-version, truncated, trailing, and oversized shapes", () => {
    const serialized = encryptVaultContentV2({
      plaintext: Buffer.from("payload"),
      dek: randomBytes(32),
      keyId: generateVaultKeyIdV2(),
      binding: BINDING,
    });
    const badMagic = Buffer.from(serialized);
    badMagic[0] ^= 0xff;
    const unknownVersion = Buffer.from(serialized);
    unknownVersion[8] = 99;
    const invalidKeyId = Buffer.from(serialized);
    invalidKeyId[16] = "x".charCodeAt(0);
    const oversizedHeader = Buffer.from(serialized.subarray(0, 16));
    oversizedHeader.writeUInt32BE(64 * 1024 * 1024 + 1, 12);

    for (const malformed of [
      Buffer.from("plain text is not an envelope"),
      badMagic,
      unknownVersion,
      invalidKeyId,
      serialized.subarray(0, serialized.length - 1),
      Buffer.concat([serialized, Buffer.from([0])]),
      oversizedHeader,
    ]) {
      assert.throws(
        () => parseVaultEnvelopeV2(malformed),
        VaultEnvelopeMalformedError,
      );
    }
  });

  it("never treats plaintext or a legacy triplet as ordinary V2 content", () => {
    const dek = randomBytes(32);
    for (const legacyOrPlaintext of [
      Buffer.from("ordinary plaintext"),
      Buffer.from(
        JSON.stringify({
          ciphertext: "bGVnYWN5",
          iv: "AAAAAAAAAAAAAAAA",
          tag: "AAAAAAAAAAAAAAAAAAAAAA==",
        }),
      ),
    ]) {
      assert.throws(
        () =>
          decryptVaultContentV2({
            serializedEnvelope: legacyOrPlaintext,
            dek,
            binding: BINDING,
          }),
        VaultEnvelopeMalformedError,
      );
    }
  });

  it("keeps internal failure types distinct while redacting one HTTP-safe shape", () => {
    const failures = [
      new VaultEnvelopeMalformedError(),
      new VaultUnknownKeyIdError(),
      new VaultAuthenticationError(),
      new VaultKeyLifecycleError("active_key_missing"),
    ];
    const redacted = failures.map(redactVaultV2ErrorForHttp);
    assert.deepEqual(
      redacted,
      failures.map(() => ({
        code: "vault_access_failed",
        message: "Vault content could not be opened.",
      })),
    );
    assert.equal(redactVaultV2ErrorForHttp(new Error("ordinary failure")), null);
    assert.equal(new Set(failures.map((failure) => failure.code)).size, 4);
  });
});
