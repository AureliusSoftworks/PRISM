import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  VaultAuthenticationError,
  VaultEnvelopeMalformedError,
  VaultKeyLifecycleError,
  parseVaultEnvelopeV2,
} from "./vault-envelope-v2.ts";
import {
  decryptUserVaultContentV2,
  encryptUserVaultContentV2,
  type VaultMasterKeyContextV2,
} from "./user-vault-keyring.ts";

export const OWNER_FILE_VAULT_VERSION_V1 = 1 as const;
export const OWNER_FILE_DEFAULT_CHUNK_BYTES_V1 = 256 * 1024;

const OWNER_FILE_MAGIC_V1 = Buffer.from("PRSMFVA1", "ascii");
const OWNER_FILE_HEADER_BYTES_V1 =
  OWNER_FILE_MAGIC_V1.length + 1 + 4 + 32 + 8;
const OWNER_FILE_RECORD_HEADER_BYTES_V1 = 4 + 1 + 4;
const OWNER_FILE_TAG_BYTES_V1 = 16;
const OWNER_FILE_SALT_BYTES_V1 = 32;
const OWNER_FILE_NONCE_PREFIX_BYTES_V1 = 8;
const OWNER_FILE_KEY_BYTES_V1 = 32;
const OWNER_FILE_MIN_CHUNK_BYTES_V1 = 4 * 1024;
const OWNER_FILE_MAX_CHUNK_BYTES_V1 = 4 * 1024 * 1024;
const OWNER_FILE_FINAL_FLAG_V1 = 1;
const OWNER_FILE_ROOT_TABLE_V1 = "owner_file_vault_roots";
const OWNER_FILE_ROOT_COLUMN_V1 = "encrypted_root_key";
const OWNER_FILE_ROOT_DOMAIN_V1 = Buffer.from(
  "PRISM\0OWNER-FILE-ROOT\0V1\0",
  "utf8",
);
const OWNER_FILE_DERIVATION_DOMAIN_V1 = Buffer.from(
  "PRISM\0OWNER-FILE-ENVELOPE-KEY\0V1\0",
  "utf8",
);
const OWNER_FILE_BINDING_DOMAIN_V1 = Buffer.from(
  "PRISM\0OWNER-FILE-BINDING\0V1\0",
  "utf8",
);
const OWNER_FILE_CONTENT_HASH_DOMAIN_V1 = Buffer.from(
  "PRISM\0OWNER-FILE-CONTENT-HASH\0V1\0",
  "utf8",
);
const OWNER_FILE_DIRECTORY_DOMAIN_V1 = Buffer.from(
  "PRISM\0OWNER-FILE-DIRECTORY\0V1\0",
  "utf8",
);
const OWNER_FILE_NAME_DOMAIN_V1 = Buffer.from(
  "PRISM\0OWNER-FILE-NAME\0V1\0",
  "utf8",
);

export interface OwnerFileBindingV1 {
  ownerUserId: string;
  assetClass: string;
  stableAssetId: string;
}

export interface OwnerFileSealReportV1 {
  version: typeof OWNER_FILE_VAULT_VERSION_V1;
  plaintextBytes: number;
  ciphertextBytes: number;
  recordCount: number;
  tenantContentHash: string;
}

export interface OwnerFileOpenReportV1 {
  version: typeof OWNER_FILE_VAULT_VERSION_V1;
  plaintextBytes: number;
  ciphertextBytes: number;
  recordCount: number;
  tenantContentHash: string;
}

type ByteSource = AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
type ByteWriter = (chunk: Buffer) => void | Promise<void>;

interface ParsedOwnerFileHeaderV1 {
  serialized: Buffer;
  chunkBytes: number;
  salt: Buffer;
  noncePrefix: Buffer;
}

function checkedBindingPart(value: string): Buffer {
  if (typeof value !== "string") {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  const encoded = Buffer.from(value, "utf8");
  if (
    encoded.length === 0 ||
    encoded.length > 4_096 ||
    encoded.toString("utf8") !== value ||
    /\p{Cc}/u.test(value)
  ) {
    throw new VaultKeyLifecycleError("invalid_content_binding");
  }
  return encoded;
}

function lengthPrefixed(value: Buffer): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(value.length, 0);
  return Buffer.concat([length, value]);
}

function bindingBytes(binding: OwnerFileBindingV1): Buffer {
  return Buffer.concat([
    OWNER_FILE_BINDING_DOMAIN_V1,
    lengthPrefixed(checkedBindingPart(binding.ownerUserId)),
    lengthPrefixed(checkedBindingPart(binding.assetClass)),
    lengthPrefixed(checkedBindingPart(binding.stableAssetId)),
  ]);
}

function checkedRootKey(rootKey: Uint8Array): Buffer {
  if (!(rootKey instanceof Uint8Array) || rootKey.length !== 32) {
    throw new VaultKeyLifecycleError("invalid_dek");
  }
  return Buffer.from(rootKey);
}

function checkedChunkBytes(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < OWNER_FILE_MIN_CHUNK_BYTES_V1 ||
    value > OWNER_FILE_MAX_CHUNK_BYTES_V1
  ) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  return value;
}

function createHeader(chunkBytes: number): ParsedOwnerFileHeaderV1 {
  const checkedChunkSize = checkedChunkBytes(chunkBytes);
  const salt = randomBytes(OWNER_FILE_SALT_BYTES_V1);
  const noncePrefix = randomBytes(OWNER_FILE_NONCE_PREFIX_BYTES_V1);
  const serialized = Buffer.allocUnsafe(OWNER_FILE_HEADER_BYTES_V1);
  let offset = 0;
  OWNER_FILE_MAGIC_V1.copy(serialized, offset);
  offset += OWNER_FILE_MAGIC_V1.length;
  serialized.writeUInt8(OWNER_FILE_VAULT_VERSION_V1, offset);
  offset += 1;
  serialized.writeUInt32BE(checkedChunkSize, offset);
  offset += 4;
  salt.copy(serialized, offset);
  offset += salt.length;
  noncePrefix.copy(serialized, offset);
  return { serialized, chunkBytes: checkedChunkSize, salt, noncePrefix };
}

function parseHeader(serialized: Buffer): ParsedOwnerFileHeaderV1 {
  if (
    serialized.length !== OWNER_FILE_HEADER_BYTES_V1 ||
    !serialized.subarray(0, OWNER_FILE_MAGIC_V1.length).equals(OWNER_FILE_MAGIC_V1)
  ) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  let offset = OWNER_FILE_MAGIC_V1.length;
  if (serialized.readUInt8(offset) !== OWNER_FILE_VAULT_VERSION_V1) {
    throw new VaultEnvelopeMalformedError("unsupported_version");
  }
  offset += 1;
  const chunkBytes = checkedChunkBytes(serialized.readUInt32BE(offset));
  offset += 4;
  const salt = Buffer.from(
    serialized.subarray(offset, offset + OWNER_FILE_SALT_BYTES_V1),
  );
  offset += OWNER_FILE_SALT_BYTES_V1;
  const noncePrefix = Buffer.from(
    serialized.subarray(offset, offset + OWNER_FILE_NONCE_PREFIX_BYTES_V1),
  );
  return { serialized: Buffer.from(serialized), chunkBytes, salt, noncePrefix };
}

function deriveFileKey(
  rootKey: Uint8Array,
  header: ParsedOwnerFileHeaderV1,
  binding: OwnerFileBindingV1,
): Buffer {
  const checked = checkedRootKey(rootKey);
  try {
    return Buffer.from(
      hkdfSync(
        "sha256",
        checked,
        header.salt,
        Buffer.concat([
          OWNER_FILE_DERIVATION_DOMAIN_V1,
          bindingBytes(binding),
          header.serialized,
        ]),
        OWNER_FILE_KEY_BYTES_V1,
      ),
    );
  } finally {
    checked.fill(0);
  }
}

function recordHeader(index: number, flags: number, plaintextBytes: number): Buffer {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > 0xffff_ffff ||
    (flags !== 0 && flags !== OWNER_FILE_FINAL_FLAG_V1) ||
    !Number.isSafeInteger(plaintextBytes) ||
    plaintextBytes < 0 ||
    plaintextBytes > 0xffff_ffff
  ) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  const header = Buffer.allocUnsafe(OWNER_FILE_RECORD_HEADER_BYTES_V1);
  header.writeUInt32BE(index, 0);
  header.writeUInt8(flags, 4);
  header.writeUInt32BE(plaintextBytes, 5);
  return header;
}

function recordNonce(prefix: Buffer, index: number): Buffer {
  const nonce = Buffer.allocUnsafe(12);
  prefix.copy(nonce, 0);
  nonce.writeUInt32BE(index, 8);
  return nonce;
}

function recordAad(
  header: ParsedOwnerFileHeaderV1,
  binding: OwnerFileBindingV1,
  serializedRecordHeader: Buffer,
): Buffer {
  return Buffer.concat([
    header.serialized,
    bindingBytes(binding),
    serializedRecordHeader,
  ]);
}

async function writeChunk(writer: ByteWriter, chunk: Buffer): Promise<void> {
  await writer(Buffer.from(chunk));
}

function addSafeBytes(total: number, increment: number): number {
  const next = total + increment;
  if (!Number.isSafeInteger(next)) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  return next;
}

function contentHasher(rootKey: Uint8Array) {
  const checked = checkedRootKey(rootKey);
  try {
    return createHmac("sha256", checked).update(
      OWNER_FILE_CONTENT_HASH_DOMAIN_V1,
    );
  } finally {
    checked.fill(0);
  }
}

function finishContentHash(hasher: ReturnType<typeof createHmac>): string {
  return `pofh1_${hasher.digest("hex")}`;
}

function sealedRecordBytes(args: {
  fileKey: Buffer;
  header: ParsedOwnerFileHeaderV1;
  binding: OwnerFileBindingV1;
  index: number;
  flags: number;
  plaintext: Buffer;
}): Buffer {
  const serializedRecordHeader = recordHeader(
    args.index,
    args.flags,
    args.plaintext.length,
  );
  const cipher = createCipheriv(
    "aes-256-gcm",
    args.fileKey,
    recordNonce(args.header.noncePrefix, args.index),
    { authTagLength: OWNER_FILE_TAG_BYTES_V1 },
  );
  cipher.setAAD(recordAad(args.header, args.binding, serializedRecordHeader));
  const ciphertext = Buffer.concat([
    cipher.update(args.plaintext),
    cipher.final(),
  ]);
  return Buffer.concat([
    serializedRecordHeader,
    ciphertext,
    cipher.getAuthTag(),
  ]);
}

export async function sealOwnerFileEnvelopeV1(args: {
  rootKey: Uint8Array;
  binding: OwnerFileBindingV1;
  plaintext: ByteSource;
  writeCiphertext: ByteWriter;
  chunkBytes?: number;
}): Promise<OwnerFileSealReportV1> {
  bindingBytes(args.binding);
  const header = createHeader(
    args.chunkBytes ?? OWNER_FILE_DEFAULT_CHUNK_BYTES_V1,
  );
  const fileKey = deriveFileKey(args.rootKey, header, args.binding);
  const hasher = contentHasher(args.rootKey);
  let pending = Buffer.alloc(0);
  let plaintextBytes = 0;
  let ciphertextBytes = header.serialized.length;
  let recordCount = 0;
  try {
    await writeChunk(args.writeCiphertext, header.serialized);
    for await (const value of args.plaintext) {
      if (!(value instanceof Uint8Array)) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      const chunk = Buffer.from(value);
      if (chunk.length === 0) continue;
      hasher.update(chunk);
      plaintextBytes = addSafeBytes(plaintextBytes, chunk.length);
      pending =
        pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([pending, chunk]);
      while (pending.length >= header.chunkBytes) {
        if (recordCount >= 0xffff_ffff) {
          throw new VaultEnvelopeMalformedError("invalid_input");
        }
        const plaintext = Buffer.from(pending.subarray(0, header.chunkBytes));
        pending = Buffer.from(pending.subarray(header.chunkBytes));
        const serializedRecord = sealedRecordBytes({
          fileKey,
          header,
          binding: args.binding,
          index: recordCount,
          flags: 0,
          plaintext,
        });
        await writeChunk(args.writeCiphertext, serializedRecord);
        ciphertextBytes = addSafeBytes(
          ciphertextBytes,
          serializedRecord.length,
        );
        recordCount += 1;
      }
    }
    if (pending.length > 0) {
      if (recordCount >= 0xffff_ffff) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      const serializedRecord = sealedRecordBytes({
        fileKey,
        header,
        binding: args.binding,
        index: recordCount,
        flags: 0,
        plaintext: pending,
      });
      await writeChunk(args.writeCiphertext, serializedRecord);
      ciphertextBytes = addSafeBytes(
        ciphertextBytes,
        serializedRecord.length,
      );
      recordCount += 1;
    }
    const finalRecord = sealedRecordBytes({
      fileKey,
      header,
      binding: args.binding,
      index: recordCount,
      flags: OWNER_FILE_FINAL_FLAG_V1,
      plaintext: Buffer.alloc(0),
    });
    await writeChunk(args.writeCiphertext, finalRecord);
    ciphertextBytes = addSafeBytes(ciphertextBytes, finalRecord.length);
    recordCount += 1;
    return Object.freeze({
      version: OWNER_FILE_VAULT_VERSION_V1,
      plaintextBytes,
      ciphertextBytes,
      recordCount,
      tenantContentHash: finishContentHash(hasher),
    });
  } finally {
    pending.fill(0);
    fileKey.fill(0);
  }
}

export function sealOwnerFileBufferV1(args: {
  rootKey: Uint8Array;
  binding: OwnerFileBindingV1;
  plaintext: Uint8Array;
  chunkBytes?: number;
}): { ciphertext: Buffer; report: OwnerFileSealReportV1 } {
  if (!(args.plaintext instanceof Uint8Array)) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  bindingBytes(args.binding);
  const header = createHeader(
    args.chunkBytes ?? OWNER_FILE_DEFAULT_CHUNK_BYTES_V1,
  );
  const fileKey = deriveFileKey(args.rootKey, header, args.binding);
  const hasher = contentHasher(args.rootKey);
  const plaintext = Buffer.from(args.plaintext);
  const records: Buffer[] = [];
  try {
    hasher.update(plaintext);
    let index = 0;
    for (let offset = 0; offset < plaintext.length; offset += header.chunkBytes) {
      if (index >= 0xffff_ffff) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      records.push(
        sealedRecordBytes({
          fileKey,
          header,
          binding: args.binding,
          index,
          flags: 0,
          plaintext: Buffer.from(
            plaintext.subarray(offset, offset + header.chunkBytes),
          ),
        }),
      );
      index += 1;
    }
    records.push(
      sealedRecordBytes({
        fileKey,
        header,
        binding: args.binding,
        index,
        flags: OWNER_FILE_FINAL_FLAG_V1,
        plaintext: Buffer.alloc(0),
      }),
    );
    const ciphertext = Buffer.concat([header.serialized, ...records]);
    return {
      ciphertext,
      report: Object.freeze({
        version: OWNER_FILE_VAULT_VERSION_V1,
        plaintextBytes: plaintext.length,
        ciphertextBytes: ciphertext.length,
        recordCount: records.length,
        tenantContentHash: finishContentHash(hasher),
      }),
    };
  } finally {
    plaintext.fill(0);
    fileKey.fill(0);
  }
}

export function openOwnerFileBufferV1(args: {
  rootKey: Uint8Array;
  binding: OwnerFileBindingV1;
  ciphertext: Uint8Array;
}): { plaintext: Buffer; report: OwnerFileOpenReportV1 } {
  if (
    !(args.ciphertext instanceof Uint8Array) ||
    args.ciphertext.length < OWNER_FILE_HEADER_BYTES_V1
  ) {
    throw new VaultEnvelopeMalformedError("invalid_input");
  }
  bindingBytes(args.binding);
  const serialized = Buffer.from(args.ciphertext);
  const header = parseHeader(
    serialized.subarray(0, OWNER_FILE_HEADER_BYTES_V1),
  );
  const fileKey = deriveFileKey(args.rootKey, header, args.binding);
  const hasher = contentHasher(args.rootKey);
  const plaintextChunks: Buffer[] = [];
  let offset = OWNER_FILE_HEADER_BYTES_V1;
  let recordCount = 0;
  let plaintextBytes = 0;
  try {
    while (true) {
      if (offset + OWNER_FILE_RECORD_HEADER_BYTES_V1 > serialized.length) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      const serializedRecordHeader = serialized.subarray(
        offset,
        offset + OWNER_FILE_RECORD_HEADER_BYTES_V1,
      );
      offset += OWNER_FILE_RECORD_HEADER_BYTES_V1;
      const index = serializedRecordHeader.readUInt32BE(0);
      const flags = serializedRecordHeader.readUInt8(4);
      const plaintextLength = serializedRecordHeader.readUInt32BE(5);
      if (
        index !== recordCount ||
        (flags !== 0 && flags !== OWNER_FILE_FINAL_FLAG_V1) ||
        plaintextLength > header.chunkBytes ||
        (flags === 0 && plaintextLength === 0) ||
        (flags === OWNER_FILE_FINAL_FLAG_V1 && plaintextLength !== 0) ||
        offset + plaintextLength + OWNER_FILE_TAG_BYTES_V1 > serialized.length
      ) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      const ciphertext = serialized.subarray(offset, offset + plaintextLength);
      offset += plaintextLength;
      const tag = serialized.subarray(offset, offset + OWNER_FILE_TAG_BYTES_V1);
      offset += OWNER_FILE_TAG_BYTES_V1;
      let plaintext: Buffer;
      try {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          fileKey,
          recordNonce(header.noncePrefix, index),
          { authTagLength: OWNER_FILE_TAG_BYTES_V1 },
        );
        decipher.setAAD(
          recordAad(header, args.binding, serializedRecordHeader),
        );
        decipher.setAuthTag(tag);
        plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);
      } catch {
        throw new VaultAuthenticationError();
      }
      recordCount += 1;
      if (flags === OWNER_FILE_FINAL_FLAG_V1) {
        plaintext.fill(0);
        if (offset !== serialized.length) {
          throw new VaultEnvelopeMalformedError("invalid_input");
        }
        break;
      }
      plaintextBytes = addSafeBytes(plaintextBytes, plaintext.length);
      hasher.update(plaintext);
      plaintextChunks.push(plaintext);
    }
    const plaintext = Buffer.concat(plaintextChunks);
    for (const chunk of plaintextChunks) chunk.fill(0);
    return {
      plaintext,
      report: Object.freeze({
        version: OWNER_FILE_VAULT_VERSION_V1,
        plaintextBytes,
        ciphertextBytes: serialized.length,
        recordCount,
        tenantContentHash: finishContentHash(hasher),
      }),
    };
  } finally {
    fileKey.fill(0);
  }
}

class AsyncByteReader {
  readonly #iterator: AsyncIterator<Uint8Array>;
  #buffers: Buffer[] = [];
  #bufferedBytes = 0;
  #done = false;

  constructor(source: ByteSource) {
    const iterable = source as AsyncIterable<Uint8Array>;
    if (typeof iterable[Symbol.asyncIterator] === "function") {
      this.#iterator = iterable[Symbol.asyncIterator]();
    } else {
      const iterator = (source as Iterable<Uint8Array>)[Symbol.iterator]();
      this.#iterator = {
        next: async () => iterator.next(),
      };
    }
  }

  async readExactly(length: number): Promise<Buffer | null> {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    if (length === 0) return Buffer.alloc(0);
    while (this.#bufferedBytes < length && !this.#done) {
      const next = await this.#iterator.next();
      if (next.done) {
        this.#done = true;
        break;
      }
      if (!(next.value instanceof Uint8Array)) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      if (next.value.length > 0) {
        const chunk = Buffer.from(next.value);
        this.#buffers.push(chunk);
        this.#bufferedBytes += chunk.length;
      }
    }
    if (this.#bufferedBytes === 0 && this.#done) return null;
    if (this.#bufferedBytes < length) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    const output = Buffer.allocUnsafe(length);
    let outputOffset = 0;
    while (outputOffset < length) {
      const first = this.#buffers[0]!;
      const take = Math.min(first.length, length - outputOffset);
      first.copy(output, outputOffset, 0, take);
      outputOffset += take;
      this.#bufferedBytes -= take;
      if (take === first.length) this.#buffers.shift();
      else this.#buffers[0] = Buffer.from(first.subarray(take));
    }
    return output;
  }
}

export async function openOwnerFileEnvelopeV1(args: {
  rootKey: Uint8Array;
  binding: OwnerFileBindingV1;
  ciphertext: ByteSource;
  writePlaintext: ByteWriter;
}): Promise<OwnerFileOpenReportV1> {
  bindingBytes(args.binding);
  const reader = new AsyncByteReader(args.ciphertext);
  const serializedHeader = await reader.readExactly(OWNER_FILE_HEADER_BYTES_V1);
  if (!serializedHeader) throw new VaultEnvelopeMalformedError("invalid_input");
  const header = parseHeader(serializedHeader);
  const fileKey = deriveFileKey(args.rootKey, header, args.binding);
  const hasher = contentHasher(args.rootKey);
  let plaintextBytes = 0;
  let ciphertextBytes = header.serialized.length;
  let recordCount = 0;
  try {
    while (true) {
      const serializedRecordHeader = await reader.readExactly(
        OWNER_FILE_RECORD_HEADER_BYTES_V1,
      );
      if (!serializedRecordHeader) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      const index = serializedRecordHeader.readUInt32BE(0);
      const flags = serializedRecordHeader.readUInt8(4);
      const plaintextLength = serializedRecordHeader.readUInt32BE(5);
      if (
        index !== recordCount ||
        (flags !== 0 && flags !== OWNER_FILE_FINAL_FLAG_V1) ||
        plaintextLength > header.chunkBytes ||
        (flags === 0 && plaintextLength === 0) ||
        (flags === OWNER_FILE_FINAL_FLAG_V1 && plaintextLength !== 0)
      ) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      const ciphertext = await reader.readExactly(plaintextLength);
      const tag = await reader.readExactly(OWNER_FILE_TAG_BYTES_V1);
      if (!ciphertext || !tag) {
        throw new VaultEnvelopeMalformedError("invalid_input");
      }
      ciphertextBytes = addSafeBytes(
        ciphertextBytes,
        serializedRecordHeader.length + ciphertext.length + tag.length,
      );
      let plaintext: Buffer;
      try {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          fileKey,
          recordNonce(header.noncePrefix, index),
          { authTagLength: OWNER_FILE_TAG_BYTES_V1 },
        );
        decipher.setAAD(
          recordAad(header, args.binding, serializedRecordHeader),
        );
        decipher.setAuthTag(tag);
        plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);
      } catch {
        throw new VaultAuthenticationError();
      }
      recordCount += 1;
      if (flags === OWNER_FILE_FINAL_FLAG_V1) {
        plaintext.fill(0);
        if ((await reader.readExactly(1)) !== null) {
          throw new VaultEnvelopeMalformedError("invalid_input");
        }
        break;
      }
      hasher.update(plaintext);
      plaintextBytes = addSafeBytes(plaintextBytes, plaintext.length);
      await writeChunk(args.writePlaintext, plaintext);
      plaintext.fill(0);
    }
    return Object.freeze({
      version: OWNER_FILE_VAULT_VERSION_V1,
      plaintextBytes,
      ciphertextBytes,
      recordCount,
      tenantContentHash: finishContentHash(hasher),
    });
  } finally {
    fileKey.fill(0);
  }
}

export function ensureOwnerFileVaultSchemaV1(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${OWNER_FILE_ROOT_TABLE_V1} (
      user_id TEXT PRIMARY KEY,
      encrypted_root_key BLOB NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) WITHOUT ROWID;
  `);
}

export function loadOrCreateOwnerFileRootKeyV1(args: {
  db: DatabaseSync;
  ownerUserId: string;
  context: VaultMasterKeyContextV2;
  createdAt?: string;
}): Buffer {
  ensureOwnerFileVaultSchemaV1(args.db);
  const existing = args.db
    .prepare(
      `SELECT encrypted_root_key FROM ${OWNER_FILE_ROOT_TABLE_V1} WHERE user_id = ?`,
    )
    .get(args.ownerUserId) as { encrypted_root_key?: unknown } | undefined;
  if (existing) {
    if (!(existing.encrypted_root_key instanceof Uint8Array)) {
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    const opened = decryptUserVaultContentV2({
      db: args.db,
      ownerUserId: args.ownerUserId,
      context: args.context,
      logicalTable: OWNER_FILE_ROOT_TABLE_V1,
      logicalColumn: OWNER_FILE_ROOT_COLUMN_V1,
      stableRowId: args.ownerUserId,
      serializedEnvelope: existing.encrypted_root_key,
    });
    if (opened.length !== 32) {
      opened.fill(0);
      throw new VaultEnvelopeMalformedError("invalid_input");
    }
    return opened;
  }

  const rootKey = randomBytes(32);
  const encrypted = encryptUserVaultContentV2({
    db: args.db,
    ownerUserId: args.ownerUserId,
    context: args.context,
    logicalTable: OWNER_FILE_ROOT_TABLE_V1,
    logicalColumn: OWNER_FILE_ROOT_COLUMN_V1,
    stableRowId: args.ownerUserId,
    plaintext: rootKey,
  });
  try {
    args.db
      .prepare(
        `INSERT INTO ${OWNER_FILE_ROOT_TABLE_V1}
           (user_id, encrypted_root_key, created_at) VALUES (?, ?, ?)`,
      )
      .run(
        args.ownerUserId,
        encrypted,
        args.createdAt ?? new Date().toISOString(),
      );
    const opened = Buffer.from(rootKey);
    rootKey.fill(0);
    return opened;
  } catch (error) {
    rootKey.fill(0);
    throw error;
  }
}

export function ownerFileTenantContentHashV1(
  rootKey: Uint8Array,
  content: Uint8Array,
): string {
  const hasher = contentHasher(rootKey);
  hasher.update(content);
  return finishContentHash(hasher);
}

function ownerOpaqueDigest(
  rootKey: Uint8Array,
  domain: Buffer,
  value?: string,
): string {
  const checked = checkedRootKey(rootKey);
  try {
    const hmac = createHmac("sha256", checked).update(domain);
    if (value !== undefined) hmac.update(lengthPrefixed(checkedBindingPart(value)));
    return hmac.digest("hex");
  } finally {
    checked.fill(0);
  }
}

export function ownerOpaqueDirectoryNameV1(rootKey: Uint8Array): string {
  return `o1_${ownerOpaqueDigest(rootKey, OWNER_FILE_DIRECTORY_DOMAIN_V1).slice(0, 40)}`;
}

export function ownerOpaqueAssetFileNameV1(
  rootKey: Uint8Array,
  stableAssetId: string,
): string {
  return `a1_${ownerOpaqueDigest(rootKey, OWNER_FILE_NAME_DOMAIN_V1, stableAssetId)}.pvf`;
}

export function ownerOpaqueBoundAssetFileNameV1(
  rootKey: Uint8Array,
  binding: OwnerFileBindingV1,
): string {
  const checked = checkedRootKey(rootKey);
  try {
    return `a1_${createHmac("sha256", checked)
      .update(OWNER_FILE_NAME_DOMAIN_V1)
      .update(bindingBytes(binding))
      .digest("hex")}.pvf`;
  } finally {
    checked.fill(0);
  }
}

export function ownerFileRootEnvelopeKeyIdV1(
  encryptedRootKey: Uint8Array,
): string {
  return parseVaultEnvelopeV2(encryptedRootKey).keyId;
}
