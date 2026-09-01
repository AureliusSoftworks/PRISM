import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const VAULT_CONTENT_CIPHER = "aes-256-gcm";
const VAULT_ENVELOPE_MAGIC = Buffer.from("PRISMVLT", "ascii");
const VAULT_CONTENT_AAD_PREFIX = Buffer.from(
  "PRISM\0VAULT-CONTENT\0V2\0",
  "utf8",
);
const VAULT_ENVELOPE_HEADER_BYTES = 16;
const VAULT_DEK_BYTES = 32;
const VAULT_NONCE_BYTES = 12;
const VAULT_TAG_BYTES = 16;
const VAULT_KEY_ID_BYTES = 36;
const VAULT_SAFE_FAILURE_MESSAGE = "Vault content could not be opened.";

export const VAULT_ENVELOPE_VERSION_V2 = 2 as const;
export const VAULT_V2_MAX_CIPHERTEXT_BYTES = 64 * 1024 * 1024;

const VAULT_KEY_ID_PATTERN = /^vk2_[0-9a-f]{32}$/u;

type VaultEnvelopeMalformedReason =
  | "invalid_input"
  | "invalid_magic"
  | "unsupported_version"
  | "invalid_lengths"
  | "invalid_key_id"
  | "truncated_or_trailing_data";

export type VaultKeyLifecycleReason =
  | "invalid_content_binding"
  | "invalid_dek"
  | "invalid_master_key_context"
  | "invalid_installation_config"
  | "owner_not_found"
  | "keyring_already_initialized"
  | "active_key_missing"
  | "multiple_active_keys"
  | "retired_key_requires_migration_context"
  | "corrupt_key_record"
  | "transaction_conflict";

export class VaultEnvelopeMalformedError extends Error {
  readonly code = "vault_envelope_malformed" as const;
  readonly reason: VaultEnvelopeMalformedReason;

  constructor(reason: VaultEnvelopeMalformedReason = "invalid_input") {
    super(VAULT_SAFE_FAILURE_MESSAGE);
    this.name = "VaultEnvelopeMalformedError";
    this.reason = reason;
  }
}

export class VaultUnknownKeyIdError extends Error {
  readonly code = "vault_unknown_key_id" as const;

  constructor() {
    super(VAULT_SAFE_FAILURE_MESSAGE);
    this.name = "VaultUnknownKeyIdError";
  }
}

export class VaultAuthenticationError extends Error {
  readonly code = "vault_authentication_failed" as const;

  constructor() {
    super(VAULT_SAFE_FAILURE_MESSAGE);
    this.name = "VaultAuthenticationError";
  }
}

export class VaultKeyLifecycleError extends Error {
  readonly code = "vault_key_lifecycle_misuse" as const;
  readonly reason: VaultKeyLifecycleReason;

  constructor(reason: VaultKeyLifecycleReason) {
    super(VAULT_SAFE_FAILURE_MESSAGE);
    this.name = "VaultKeyLifecycleError";
    this.reason = reason;
  }
}

export type VaultV2InternalError =
  | VaultEnvelopeMalformedError
  | VaultUnknownKeyIdError
  | VaultAuthenticationError
  | VaultKeyLifecycleError;

export interface VaultHttpSafeFailure {
  code: "vault_access_failed";
  message: "Vault content could not be opened.";
}

const VAULT_HTTP_SAFE_FAILURE: VaultHttpSafeFailure = Object.freeze({
  code: "vault_access_failed",
  message: "Vault content could not be opened.",
});

export function isVaultV2InternalError(
  error: unknown,
): error is VaultV2InternalError {
  return (
    error instanceof VaultEnvelopeMalformedError ||
    error instanceof VaultUnknownKeyIdError ||
    error instanceof VaultAuthenticationError ||
    error instanceof VaultKeyLifecycleError
  );
}

/**
 * HTTP handlers must collapse every internal Vault failure to this single
 * content-free shape instead of exposing key existence or authentication
 * details as an oracle.
 */
export function redactVaultV2ErrorForHttp(
  error: unknown,
): VaultHttpSafeFailure | null {
  return isVaultV2InternalError(error) ? VAULT_HTTP_SAFE_FAILURE : null;
}

export interface VaultContentBindingV2 {
  ownerUserId: string;
  logicalTable: string;
  logicalColumn: string;
  stableRowId: string;
}

export interface VaultEnvelopeV2 {
  version: typeof VAULT_ENVELOPE_VERSION_V2;
  keyId: string;
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

function utf8Component(
  value: unknown,
  maxBytes: number,
  identifierOnly: boolean,
): Buffer {
  if (typeof value !== "string" || value.length === 0) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  if (/\p{Cc}/u.test(value)) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  if (identifierOnly && !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  const encoded = Buffer.from(value, "utf8");
  if (
    encoded.length === 0 ||
    encoded.length > maxBytes ||
    encoded.toString("utf8") !== value
  ) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  return encoded;
}

export function assertVaultOwnerUserIdV2(
  ownerUserId: unknown,
): asserts ownerUserId is string {
  utf8Component(ownerUserId, 256, false);
}

export function assertVaultKeyIdV2(keyId: unknown): asserts keyId is string {
  if (
    typeof keyId !== "string" ||
    Buffer.byteLength(keyId, "ascii") !== VAULT_KEY_ID_BYTES ||
    !VAULT_KEY_ID_PATTERN.test(keyId)
  ) {
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
}

export function generateVaultKeyIdV2(): string {
  return `vk2_${randomBytes(16).toString("hex")}`;
}

function lengthPrefixed(component: Buffer): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(component.length, 0);
  return Buffer.concat([length, component]);
}

/**
 * Canonical AAD: a fixed domain/version prefix followed only by the owner,
 * logical table, logical column, and stable row ID in unambiguous length-
 * prefixed UTF-8 form.
 */
export function buildVaultContentAadV2(binding: VaultContentBindingV2): Buffer {
  const owner = utf8Component(binding.ownerUserId, 256, false);
  const table = utf8Component(binding.logicalTable, 128, true);
  const column = utf8Component(binding.logicalColumn, 128, true);
  const row = utf8Component(binding.stableRowId, 1_024, false);
  return Buffer.concat([
    VAULT_CONTENT_AAD_PREFIX,
    lengthPrefixed(owner),
    lengthPrefixed(table),
    lengthPrefixed(column),
    lengthPrefixed(row),
  ]);
}

function checkedEnvelopeBuffer(value: unknown): Buffer {
  if (!(value instanceof Uint8Array)) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  const bytes = Buffer.from(value);
  const maximumBytes =
    VAULT_ENVELOPE_HEADER_BYTES +
    VAULT_KEY_ID_BYTES +
    VAULT_NONCE_BYTES +
    VAULT_TAG_BYTES +
    VAULT_V2_MAX_CIPHERTEXT_BYTES;
  if (
    bytes.length < VAULT_ENVELOPE_HEADER_BYTES ||
    bytes.length > maximumBytes
  ) {
    throw new VaultEnvelopeMalformedError("invalid_lengths");
  }
  return bytes;
}

function checkedEnvelopeV2(envelope: VaultEnvelopeV2): VaultEnvelopeV2 {
  if (envelope.version !== VAULT_ENVELOPE_VERSION_V2) {
    throw new VaultEnvelopeMalformedError("unsupported_version");
  }
  try {
    assertVaultKeyIdV2(envelope.keyId);
  } catch {
    throw new VaultEnvelopeMalformedError("invalid_key_id");
  }
  if (
    !(envelope.nonce instanceof Uint8Array) ||
    envelope.nonce.length !== VAULT_NONCE_BYTES ||
    !(envelope.tag instanceof Uint8Array) ||
    envelope.tag.length !== VAULT_TAG_BYTES ||
    !(envelope.ciphertext instanceof Uint8Array) ||
    envelope.ciphertext.length > VAULT_V2_MAX_CIPHERTEXT_BYTES
  ) {
    throw new VaultEnvelopeMalformedError("invalid_lengths");
  }
  return {
    version: VAULT_ENVELOPE_VERSION_V2,
    keyId: envelope.keyId,
    nonce: Buffer.from(envelope.nonce),
    ciphertext: Buffer.from(envelope.ciphertext),
    tag: Buffer.from(envelope.tag),
  };
}

export function serializeVaultEnvelopeV2(envelope: VaultEnvelopeV2): Buffer {
  const checked = checkedEnvelopeV2(envelope);
  const keyId = Buffer.from(checked.keyId, "ascii");
  const header = Buffer.alloc(VAULT_ENVELOPE_HEADER_BYTES);
  VAULT_ENVELOPE_MAGIC.copy(header, 0);
  header.writeUInt8(VAULT_ENVELOPE_VERSION_V2, 8);
  header.writeUInt8(keyId.length, 9);
  header.writeUInt8(checked.nonce.length, 10);
  header.writeUInt8(checked.tag.length, 11);
  header.writeUInt32BE(checked.ciphertext.length, 12);
  return Buffer.concat([
    header,
    keyId,
    checked.nonce,
    checked.ciphertext,
    checked.tag,
  ]);
}

export function parseVaultEnvelopeV2(serialized: Uint8Array): VaultEnvelopeV2 {
  const bytes = checkedEnvelopeBuffer(serialized);
  if (
    !bytes
      .subarray(0, VAULT_ENVELOPE_MAGIC.length)
      .equals(VAULT_ENVELOPE_MAGIC)
  ) {
    throw new VaultEnvelopeMalformedError("invalid_magic");
  }
  if (bytes.readUInt8(8) !== VAULT_ENVELOPE_VERSION_V2) {
    throw new VaultEnvelopeMalformedError("unsupported_version");
  }
  const keyIdLength = bytes.readUInt8(9);
  const nonceLength = bytes.readUInt8(10);
  const tagLength = bytes.readUInt8(11);
  const ciphertextLength = bytes.readUInt32BE(12);
  if (
    keyIdLength !== VAULT_KEY_ID_BYTES ||
    nonceLength !== VAULT_NONCE_BYTES ||
    tagLength !== VAULT_TAG_BYTES ||
    ciphertextLength > VAULT_V2_MAX_CIPHERTEXT_BYTES
  ) {
    throw new VaultEnvelopeMalformedError("invalid_lengths");
  }
  const expectedLength =
    VAULT_ENVELOPE_HEADER_BYTES +
    keyIdLength +
    nonceLength +
    ciphertextLength +
    tagLength;
  if (bytes.length !== expectedLength) {
    throw new VaultEnvelopeMalformedError("truncated_or_trailing_data");
  }
  let offset = VAULT_ENVELOPE_HEADER_BYTES;
  const keyIdBytes = bytes.subarray(offset, offset + keyIdLength);
  offset += keyIdLength;
  const keyId = keyIdBytes.toString("ascii");
  if (
    !VAULT_KEY_ID_PATTERN.test(keyId) ||
    !Buffer.from(keyId, "ascii").equals(keyIdBytes)
  ) {
    throw new VaultEnvelopeMalformedError("invalid_key_id");
  }
  const nonce = Buffer.from(bytes.subarray(offset, offset + nonceLength));
  offset += nonceLength;
  const ciphertext = Buffer.from(
    bytes.subarray(offset, offset + ciphertextLength),
  );
  offset += ciphertextLength;
  const tag = Buffer.from(bytes.subarray(offset, offset + tagLength));
  return Object.freeze({
    version: VAULT_ENVELOPE_VERSION_V2,
    keyId,
    nonce,
    ciphertext,
    tag,
  });
}

function checkedDek(dek: unknown): Buffer {
  if (!(dek instanceof Uint8Array) || dek.length !== VAULT_DEK_BYTES) {
    throw new VaultKeyLifecycleError("invalid_dek");
  }
  return Buffer.from(dek);
}

function checkedPlaintext(plaintext: unknown): Buffer {
  if (
    !(plaintext instanceof Uint8Array) ||
    plaintext.length > VAULT_V2_MAX_CIPHERTEXT_BYTES
  ) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  return Buffer.from(plaintext);
}

export function encryptVaultContentV2(args: {
  plaintext: Uint8Array;
  dek: Uint8Array;
  keyId: string;
  binding: VaultContentBindingV2;
}): Buffer {
  assertVaultKeyIdV2(args.keyId);
  const plaintext = checkedPlaintext(args.plaintext);
  const dek = checkedDek(args.dek);
  try {
    const nonce = randomBytes(VAULT_NONCE_BYTES);
    const aad = buildVaultContentAadV2(args.binding);
    const cipher = createCipheriv(VAULT_CONTENT_CIPHER, dek, nonce, {
      authTagLength: VAULT_TAG_BYTES,
    });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return serializeVaultEnvelopeV2({
      version: VAULT_ENVELOPE_VERSION_V2,
      keyId: args.keyId,
      nonce,
      ciphertext,
      tag: cipher.getAuthTag(),
    });
  } finally {
    dek.fill(0);
  }
}

export function decryptParsedVaultContentV2(args: {
  envelope: VaultEnvelopeV2;
  dek: Uint8Array;
  binding: VaultContentBindingV2;
}): Buffer {
  const envelope = checkedEnvelopeV2(args.envelope);
  const dek = checkedDek(args.dek);
  try {
    const aad = buildVaultContentAadV2(args.binding);
    try {
      const decipher = createDecipheriv(
        VAULT_CONTENT_CIPHER,
        dek,
        envelope.nonce,
        { authTagLength: VAULT_TAG_BYTES },
      );
      decipher.setAAD(aad);
      decipher.setAuthTag(envelope.tag);
      return Buffer.concat([
        decipher.update(envelope.ciphertext),
        decipher.final(),
      ]);
    } catch {
      throw new VaultAuthenticationError();
    }
  } finally {
    dek.fill(0);
  }
}

export function decryptVaultContentV2(args: {
  serializedEnvelope: Uint8Array;
  dek: Uint8Array;
  binding: VaultContentBindingV2;
}): Buffer {
  return decryptParsedVaultContentV2({
    envelope: parseVaultEnvelopeV2(args.serializedEnvelope),
    dek: args.dek,
    binding: args.binding,
  });
}
