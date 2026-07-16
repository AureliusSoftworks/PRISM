import { inflateRawSync } from "node:zlib";
import {
  assertSafeSlateArchivePath,
  serializeSlateArchiveManifest,
  verifySlateArchiveBundle,
  type SlateArchiveBundleV1,
  type SlateArchiveManifestV1,
} from "./slate-author-safety.ts";

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE = 0;
const ZIP_DEFLATE = 8;
const ZIP_DOS_EPOCH_DATE = 0x0021;
const MANIFEST_PATH = "manifest.json";

export const MAX_SLATE_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ENTRY_BYTES = 192 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 384 * 1024 * 1024;
const MAX_ENTRY_COUNT = 128;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

interface CentralEntry {
  path: string;
  flags: number;
  compression: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export class SlateArchiveZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlateArchiveZipError";
  }
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new SlateArchiveZipError("Slate ZIP archive is truncated.");
  }
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new SlateArchiveZipError("Slate ZIP archive is truncated.");
  }
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function slateArchiveCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function localHeader(input: {
  name: Uint8Array;
  content: Uint8Array;
  crc32: number;
}): Uint8Array {
  const header = new Uint8Array(30 + input.name.byteLength);
  writeUint32(header, 0, ZIP_LOCAL_FILE_HEADER);
  writeUint16(header, 4, 20);
  writeUint16(header, 6, ZIP_UTF8_FLAG);
  writeUint16(header, 8, ZIP_STORE);
  writeUint16(header, 10, 0);
  writeUint16(header, 12, ZIP_DOS_EPOCH_DATE);
  writeUint32(header, 14, input.crc32);
  writeUint32(header, 18, input.content.byteLength);
  writeUint32(header, 22, input.content.byteLength);
  writeUint16(header, 26, input.name.byteLength);
  writeUint16(header, 28, 0);
  header.set(input.name, 30);
  return header;
}

function centralHeader(input: {
  name: Uint8Array;
  content: Uint8Array;
  crc32: number;
  localHeaderOffset: number;
}): Uint8Array {
  const header = new Uint8Array(46 + input.name.byteLength);
  writeUint32(header, 0, ZIP_CENTRAL_FILE_HEADER);
  writeUint16(header, 4, 20);
  writeUint16(header, 6, 20);
  writeUint16(header, 8, ZIP_UTF8_FLAG);
  writeUint16(header, 10, ZIP_STORE);
  writeUint16(header, 12, 0);
  writeUint16(header, 14, ZIP_DOS_EPOCH_DATE);
  writeUint32(header, 16, input.crc32);
  writeUint32(header, 20, input.content.byteLength);
  writeUint32(header, 24, input.content.byteLength);
  writeUint16(header, 28, input.name.byteLength);
  writeUint16(header, 30, 0);
  writeUint16(header, 32, 0);
  writeUint16(header, 34, 0);
  writeUint16(header, 36, 0);
  writeUint32(header, 38, 0);
  writeUint32(header, 42, input.localHeaderOffset);
  header.set(input.name, 46);
  return header;
}

function endOfCentralDirectory(input: {
  entryCount: number;
  centralDirectoryBytes: number;
  centralDirectoryOffset: number;
}): Uint8Array {
  const record = new Uint8Array(22);
  writeUint32(record, 0, ZIP_END_OF_CENTRAL_DIRECTORY);
  writeUint16(record, 4, 0);
  writeUint16(record, 6, 0);
  writeUint16(record, 8, input.entryCount);
  writeUint16(record, 10, input.entryCount);
  writeUint32(record, 12, input.centralDirectoryBytes);
  writeUint32(record, 16, input.centralDirectoryOffset);
  writeUint16(record, 20, 0);
  return record;
}

function normalizedPayload(payload: Uint8Array): Uint8Array {
  if (!(payload instanceof Uint8Array) || payload.byteLength < 22) {
    throw new SlateArchiveZipError("Slate ZIP archive is empty or invalid.");
  }
  if (payload.byteLength > MAX_SLATE_ARCHIVE_BYTES) {
    throw new SlateArchiveZipError("Slate ZIP archive is too large.");
  }
  return payload;
}

export function encodeSlateArchiveZip(bundle: SlateArchiveBundleV1): Uint8Array {
  verifySlateArchiveBundle(bundle);
  const textEntries: Record<string, string> = {
    [MANIFEST_PATH]: serializeSlateArchiveManifest(bundle.manifest),
    ...bundle.files,
  };
  const paths = Object.keys(textEntries).sort();
  if (paths.length > MAX_ENTRY_COUNT) {
    throw new SlateArchiveZipError("Slate archive contains too many files.");
  }
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const path of paths) {
    assertSafeSlateArchivePath(path);
    const name = encoder.encode(path);
    const content = encoder.encode(textEntries[path]!);
    if (content.byteLength > MAX_ENTRY_BYTES) {
      throw new SlateArchiveZipError(`Slate archive file is too large: ${path}.`);
    }
    const checksum = slateArchiveCrc32(content);
    const local = localHeader({ name, content, crc32: checksum });
    localParts.push(local, content);
    centralParts.push(
      centralHeader({
        name,
        content,
        crc32: checksum,
        localHeaderOffset: localOffset,
      }),
    );
    localOffset += local.byteLength + content.byteLength;
  }
  const centralDirectory = concatBytes(centralParts);
  const output = concatBytes([
    ...localParts,
    centralDirectory,
    endOfCentralDirectory({
      entryCount: paths.length,
      centralDirectoryBytes: centralDirectory.byteLength,
      centralDirectoryOffset: localOffset,
    }),
  ]);
  if (output.byteLength > MAX_SLATE_ARCHIVE_BYTES) {
    throw new SlateArchiveZipError("Slate ZIP archive is too large.");
  }
  return output;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new SlateArchiveZipError("Slate ZIP archive has no central directory.");
}

function decodePath(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SlateArchiveZipError("Slate ZIP archive contains an invalid filename.");
  }
}

function centralEntries(bytes: Uint8Array): {
  entries: CentralEntry[];
  centralDirectoryOffset: number;
} {
  const endOffset = findEndOfCentralDirectory(bytes);
  const disk = readUint16(bytes, endOffset + 4);
  const centralDisk = readUint16(bytes, endOffset + 6);
  const diskEntries = readUint16(bytes, endOffset + 8);
  const totalEntries = readUint16(bytes, endOffset + 10);
  const centralBytes = readUint32(bytes, endOffset + 12);
  const centralOffset = readUint32(bytes, endOffset + 16);
  const commentLength = readUint16(bytes, endOffset + 20);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    totalEntries < 1 ||
    totalEntries > MAX_ENTRY_COUNT ||
    endOffset + 22 + commentLength !== bytes.byteLength ||
    centralOffset + centralBytes !== endOffset
  ) {
    throw new SlateArchiveZipError("Slate ZIP archive directory is invalid.");
  }

  const entries: CentralEntry[] = [];
  const paths = new Set<string>();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readUint32(bytes, cursor) !== ZIP_CENTRAL_FILE_HEADER) {
      throw new SlateArchiveZipError("Slate ZIP archive directory is invalid.");
    }
    const flags = readUint16(bytes, cursor + 8);
    const compression = readUint16(bytes, cursor + 10);
    const crc32 = readUint32(bytes, cursor + 16);
    const compressedSize = readUint32(bytes, cursor + 20);
    const uncompressedSize = readUint32(bytes, cursor + 24);
    const nameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentBytes = readUint16(bytes, cursor + 32);
    const localHeaderOffset = readUint32(bytes, cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentBytes;
    if (next > endOffset || nameLength < 1) {
      throw new SlateArchiveZipError("Slate ZIP archive directory is truncated.");
    }
    if ((flags & 0x0001) !== 0 || (compression !== ZIP_STORE && compression !== ZIP_DEFLATE)) {
      throw new SlateArchiveZipError("Slate ZIP archive uses an unsupported entry format.");
    }
    if (
      compressedSize > MAX_ENTRY_BYTES ||
      uncompressedSize > MAX_ENTRY_BYTES ||
      (compressedSize === 0 && uncompressedSize !== 0)
    ) {
      throw new SlateArchiveZipError("Slate ZIP archive entry is too large.");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new SlateArchiveZipError("Slate ZIP archive expands beyond its safe limit.");
    }
    const path = decodePath(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    assertSafeSlateArchivePath(path);
    if (paths.has(path)) {
      throw new SlateArchiveZipError(`Slate ZIP archive repeats ${path}.`);
    }
    paths.add(path);
    entries.push({
      path,
      flags,
      compression,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = next;
  }
  if (cursor !== endOffset) {
    throw new SlateArchiveZipError("Slate ZIP archive directory length is invalid.");
  }
  return { entries, centralDirectoryOffset: centralOffset };
}

function entryBytes(
  archive: Uint8Array,
  entry: CentralEntry,
  centralDirectoryOffset: number,
): Uint8Array {
  const offset = entry.localHeaderOffset;
  if (offset >= centralDirectoryOffset || readUint32(archive, offset) !== ZIP_LOCAL_FILE_HEADER) {
    throw new SlateArchiveZipError(`Slate ZIP archive entry is invalid: ${entry.path}.`);
  }
  const localFlags = readUint16(archive, offset + 6);
  const localCompression = readUint16(archive, offset + 8);
  const nameLength = readUint16(archive, offset + 26);
  const extraLength = readUint16(archive, offset + 28);
  const contentOffset = offset + 30 + nameLength + extraLength;
  const contentEnd = contentOffset + entry.compressedSize;
  if (
    localFlags !== entry.flags ||
    localCompression !== entry.compression ||
    contentEnd > centralDirectoryOffset ||
    decodePath(archive.subarray(offset + 30, offset + 30 + nameLength)) !== entry.path
  ) {
    throw new SlateArchiveZipError(`Slate ZIP archive entry is invalid: ${entry.path}.`);
  }
  const compressed = archive.subarray(contentOffset, contentEnd);
  let content: Uint8Array;
  try {
    content =
      entry.compression === ZIP_STORE
        ? Uint8Array.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES });
  } catch {
    throw new SlateArchiveZipError(`Slate ZIP archive could not read ${entry.path}.`);
  }
  if (
    content.byteLength !== entry.uncompressedSize ||
    slateArchiveCrc32(content) !== entry.crc32
  ) {
    throw new SlateArchiveZipError(`Slate ZIP archive checksum failed for ${entry.path}.`);
  }
  return content;
}

function decodedText(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SlateArchiveZipError(`Slate ZIP archive file is not UTF-8: ${path}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parsedManifest(value: string): SlateArchiveManifestV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new SlateArchiveZipError("Slate ZIP manifest is not valid JSON.");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.files)) {
    throw new SlateArchiveZipError("Slate ZIP manifest is invalid.");
  }
  return parsed as unknown as SlateArchiveManifestV1;
}

export function decodeSlateArchiveZip(payload: Uint8Array): SlateArchiveBundleV1 {
  const archive = normalizedPayload(payload);
  const { entries, centralDirectoryOffset } = centralEntries(archive);
  const files: Record<string, string> = {};
  let manifestText: string | null = null;
  for (const entry of entries) {
    const content = entryBytes(archive, entry, centralDirectoryOffset);
    if (entry.path === MANIFEST_PATH) {
      if (content.byteLength > MAX_MANIFEST_BYTES) {
        throw new SlateArchiveZipError("Slate ZIP manifest is too large.");
      }
      manifestText = decodedText(content, entry.path);
    } else {
      files[entry.path] = decodedText(content, entry.path);
    }
  }
  if (manifestText === null) {
    throw new SlateArchiveZipError("Slate ZIP archive is missing manifest.json.");
  }
  const bundle = { manifest: parsedManifest(manifestText), files };
  try {
    return verifySlateArchiveBundle(bundle);
  } catch (error) {
    throw new SlateArchiveZipError(
      error instanceof Error ? error.message : "Slate archive bundle is invalid.",
    );
  }
}
