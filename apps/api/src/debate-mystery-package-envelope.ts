import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  PORTABLE_MYSTERY_PACKAGE_MAGIC_V1,
  canonicalPortablePackageJsonV1,
  validateMansionPackageHeaderV1,
  type MansionPackageHeaderV1,
  type PortablePackageJsonValueV1,
  type PortableMysteryCompatibilityV1,
  type PortableMysteryCreatorSignatureV1,
  type PortableMysteryEncryptionModeV1,
  type PortableMysteryPackageTypeV1,
} from "@localai/shared";

const MAGIC = Buffer.from(PORTABLE_MYSTERY_PACKAGE_MAGIC_V1, "ascii");
const ENVELOPE_VERSION = 1;
const FIXED_PREFIX_BYTES = MAGIC.length + 1 + 1 + 4 + 16 + 12;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_HEADER_BYTES = 64 * 1024;
export const MAX_PORTABLE_MYSTERY_ENVELOPE_BYTES = 256 * 1024 * 1024;
const AES_ALGORITHM = "aes-256-gcm";
const STANDARD_SEAL_CONTEXT = "PRISM portable mystery spoiler seal v1; not DRM";

export class PortableMysteryEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortableMysteryEnvelopeError";
  }
}

export interface PortableMysteryEnvelopeMetadataV1 {
  packageType: PortableMysteryPackageTypeV1;
  title: string;
  creatorName: string;
  compatibility: PortableMysteryCompatibilityV1;
  expandedBytes: number;
  assetCount: number;
  contentWarnings: string[];
  creatorSignature?: PortableMysteryCreatorSignatureV1 | null;
}

export interface OpenedPortableMysteryEnvelopeV1 {
  header: MansionPackageHeaderV1;
  payload: Uint8Array;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function standardSealKey(): Buffer {
  // This application-readable key provides spoiler sealing, not DRM. Anyone
  // with the binary can recover it; password mode is the private-sharing path.
  return createHash("sha256").update(STANDARD_SEAL_CONTEXT, "utf8").digest();
}

function passwordKey(password: string, salt: Buffer): Buffer {
  if (password.length < 1 || password.length > 1024) {
    throw new PortableMysteryEnvelopeError("A package password is required.");
  }
  return scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function keyForMode(
  mode: PortableMysteryEncryptionModeV1,
  salt: Buffer,
  password?: string,
): Buffer {
  if (mode === "spoiler_seal") return standardSealKey();
  return passwordKey(password ?? "", salt);
}

function modeFlag(mode: PortableMysteryEncryptionModeV1): number {
  return mode === "password" ? 1 : 0;
}

function modeFromFlag(flag: number): PortableMysteryEncryptionModeV1 {
  if (flag === 0) return "spoiler_seal";
  if (flag === 1) return "password";
  throw new PortableMysteryEnvelopeError("Package encryption mode is unsupported.");
}

function canonicalHeaderBytes(header: MansionPackageHeaderV1): Buffer {
  return Buffer.from(canonicalPortablePackageJsonV1(
    JSON.parse(JSON.stringify(header)) as PortablePackageJsonValueV1,
  ), "utf8");
}

function fixedPrefix(args: {
  mode: PortableMysteryEncryptionModeV1;
  headerBytes: Buffer;
  salt: Buffer;
  iv: Buffer;
}): Buffer {
  const prefix = Buffer.alloc(FIXED_PREFIX_BYTES);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt8(ENVELOPE_VERSION, MAGIC.length);
  prefix.writeUInt8(modeFlag(args.mode), MAGIC.length + 1);
  prefix.writeUInt32BE(args.headerBytes.byteLength, MAGIC.length + 2);
  args.salt.copy(prefix, MAGIC.length + 6);
  args.iv.copy(prefix, MAGIC.length + 6 + SALT_BYTES);
  return Buffer.concat([prefix, args.headerBytes]);
}

export function sealPortableMysteryEnvelopeV1(args: {
  payload: Uint8Array;
  mode: PortableMysteryEncryptionModeV1;
  metadata: PortableMysteryEnvelopeMetadataV1;
  password?: string;
}): Uint8Array {
  const payload = Buffer.from(args.payload);
  if (payload.byteLength < 1 || payload.byteLength > MAX_PORTABLE_MYSTERY_ENVELOPE_BYTES) {
    throw new PortableMysteryEnvelopeError("Package payload is outside the supported size boundary.");
  }
  const header: MansionPackageHeaderV1 = {
    magic: PORTABLE_MYSTERY_PACKAGE_MAGIC_V1,
    formatVersion: { major: 1, minor: 0 },
    packageType: args.metadata.packageType,
    title: args.metadata.title,
    creatorName: args.metadata.creatorName,
    compatibility: args.metadata.compatibility,
    compressedBytes: payload.byteLength,
    expandedBytes: args.metadata.expandedBytes,
    assetCount: args.metadata.assetCount,
    contentWarnings: [...args.metadata.contentWarnings],
    payloadSha256: sha256(payload),
    encryptionMode: args.mode,
    creatorSignature: args.metadata.creatorSignature ?? null,
  };
  const validation = validateMansionPackageHeaderV1(header);
  if (validation.length > 0) throw new PortableMysteryEnvelopeError(validation.join("\n"));
  const headerBytes = canonicalHeaderBytes(header);
  if (headerBytes.byteLength > MAX_HEADER_BYTES) {
    throw new PortableMysteryEnvelopeError("Package header is too large.");
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const authenticatedPrefix = fixedPrefix({ mode: args.mode, headerBytes, salt, iv });
  const cipher = createCipheriv(AES_ALGORITHM, keyForMode(args.mode, salt, args.password), iv);
  cipher.setAAD(authenticatedPrefix);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const envelope = Buffer.concat([authenticatedPrefix, ciphertext, cipher.getAuthTag()]);
  if (envelope.byteLength > MAX_PORTABLE_MYSTERY_ENVELOPE_BYTES) {
    throw new PortableMysteryEnvelopeError("Package envelope is too large.");
  }
  return envelope;
}

function parsedEnvelope(envelope: Uint8Array): {
  header: MansionPackageHeaderV1;
  mode: PortableMysteryEncryptionModeV1;
  salt: Buffer;
  iv: Buffer;
  authenticatedPrefix: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
} {
  const bytes = Buffer.from(envelope);
  if (
    bytes.byteLength < FIXED_PREFIX_BYTES + 2 + TAG_BYTES ||
    bytes.byteLength > MAX_PORTABLE_MYSTERY_ENVELOPE_BYTES
  ) throw new PortableMysteryEnvelopeError("Package envelope is empty, truncated, or too large.");
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new PortableMysteryEnvelopeError("Package magic bytes are invalid.");
  }
  if (bytes.readUInt8(MAGIC.length) !== ENVELOPE_VERSION) {
    throw new PortableMysteryEnvelopeError("Package envelope version is unsupported.");
  }
  const mode = modeFromFlag(bytes.readUInt8(MAGIC.length + 1));
  const headerLength = bytes.readUInt32BE(MAGIC.length + 2);
  if (headerLength < 2 || headerLength > MAX_HEADER_BYTES) {
    throw new PortableMysteryEnvelopeError("Package header length is invalid.");
  }
  const headerStart = FIXED_PREFIX_BYTES;
  const ciphertextStart = headerStart + headerLength;
  const tagStart = bytes.byteLength - TAG_BYTES;
  if (ciphertextStart >= tagStart) throw new PortableMysteryEnvelopeError("Package payload is truncated.");
  let header: MansionPackageHeaderV1;
  try {
    header = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(headerStart, ciphertextStart),
    )) as MansionPackageHeaderV1;
  } catch {
    throw new PortableMysteryEnvelopeError("Package header is invalid JSON.");
  }
  const errors = validateMansionPackageHeaderV1(header);
  if (errors.length > 0) throw new PortableMysteryEnvelopeError(errors.join("\n"));
  if (header.encryptionMode !== mode) {
    throw new PortableMysteryEnvelopeError("Package encryption metadata does not match its envelope.");
  }
  const ciphertext = bytes.subarray(ciphertextStart, tagStart);
  if (header.compressedBytes !== ciphertext.byteLength) {
    throw new PortableMysteryEnvelopeError("Package payload size does not match its header.");
  }
  return {
    header,
    mode,
    salt: bytes.subarray(MAGIC.length + 6, MAGIC.length + 6 + SALT_BYTES),
    iv: bytes.subarray(MAGIC.length + 6 + SALT_BYTES, FIXED_PREFIX_BYTES),
    authenticatedPrefix: bytes.subarray(0, ciphertextStart),
    ciphertext,
    tag: bytes.subarray(tagStart),
  };
}

export function inspectPortableMysteryEnvelopeHeaderV1(
  envelope: Uint8Array,
): MansionPackageHeaderV1 {
  return parsedEnvelope(envelope).header;
}

export function openPortableMysteryEnvelopeV1(args: {
  envelope: Uint8Array;
  password?: string;
}): OpenedPortableMysteryEnvelopeV1 {
  const parsed = parsedEnvelope(args.envelope);
  let payload: Buffer;
  try {
    const decipher = createDecipheriv(
      AES_ALGORITHM,
      keyForMode(parsed.mode, parsed.salt, args.password),
      parsed.iv,
    );
    decipher.setAAD(parsed.authenticatedPrefix);
    decipher.setAuthTag(parsed.tag);
    payload = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
  } catch {
    throw new PortableMysteryEnvelopeError("Package authentication failed.");
  }
  if (
    payload.byteLength !== parsed.header.compressedBytes ||
    sha256(payload) !== parsed.header.payloadSha256
  ) throw new PortableMysteryEnvelopeError("Package authentication failed.");
  return { header: parsed.header, payload };
}
