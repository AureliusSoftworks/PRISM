import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import {
  createSlateArchiveBundle,
  createSlateRecoverySnapshot,
  type SlateArchiveBundleV1,
} from "../slate-author-safety.ts";
import {
  decodeSlateArchiveZip,
  encodeSlateArchiveZip,
  slateArchiveCrc32,
} from "../slate-archive-zip.ts";
import { createSlateSeries } from "../slate-continuity.ts";
import { createSlateProject } from "../slate.ts";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";

const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

interface ZipEntryLocation {
  centralOffset: number;
  contentLength: number;
  contentOffset: number;
  localOffset: number;
  path: string;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function endOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("Test fixture has no ZIP central directory.");
}

function zipEntries(bytes: Uint8Array): ZipEntryLocation[] {
  const endOffset = endOfCentralDirectory(bytes);
  const count = readUint16(bytes, endOffset + 10);
  let centralOffset = readUint32(bytes, endOffset + 16);
  const decoder = new TextDecoder();
  const entries: ZipEntryLocation[] = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(readUint32(bytes, centralOffset), ZIP_CENTRAL_FILE_HEADER);
    const contentLength = readUint32(bytes, centralOffset + 24);
    const nameLength = readUint16(bytes, centralOffset + 28);
    const extraLength = readUint16(bytes, centralOffset + 30);
    const commentLength = readUint16(bytes, centralOffset + 32);
    const localOffset = readUint32(bytes, centralOffset + 42);
    const localNameLength = readUint16(bytes, localOffset + 26);
    const localExtraLength = readUint16(bytes, localOffset + 28);
    entries.push({
      centralOffset,
      contentLength,
      contentOffset: localOffset + 30 + localNameLength + localExtraLength,
      localOffset,
      path: decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength)),
    });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function zipEntry(bytes: Uint8Array, path: string): ZipEntryLocation {
  const entry = zipEntries(bytes).find((candidate) => candidate.path === path);
  assert.ok(entry, `Expected ZIP entry ${path}.`);
  return entry;
}

function renameZipEntry(bytes: Uint8Array, from: string, to: string): void {
  const entry = zipEntry(bytes, from);
  const fromBytes = new TextEncoder().encode(from);
  const toBytes = new TextEncoder().encode(to);
  assert.equal(toBytes.byteLength, fromBytes.byteLength, "Test rename must preserve ZIP layout.");
  bytes.set(toBytes, entry.localOffset + 30);
  bytes.set(toBytes, entry.centralOffset + 46);
}

function seedUser(db: DatabaseSync, id: string): void {
  const now = "2026-07-16T00:00:00.000Z";
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt, wrapped_user_key,
        wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'wrapped', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.test`, id, now, now);
}

describe("Slate .slate ZIP transport", () => {
  let bundle: SlateArchiveBundleV1;
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
    seedUser(db, "author-a");
    const series = createSlateSeries(db, "author-a", { title: "The Lantern Cycle" });
    const project = createSlateProject(db, "author-a", {
      title: "The Lantern Archive",
      spark: "A lighthouse remembers every ship it failed to save.",
      seriesId: series.id,
    });
    bundle = createSlateArchiveBundle(
      createSlateRecoverySnapshot(db, "author-a", project.id),
      new Date("2026-07-16T12:00:00.000Z"),
    );
  });

  afterEach(() => closeTestDatabase(db));

  it("round-trips a deterministic archive with real ZIP signatures", () => {
    const first = encodeSlateArchiveZip(bundle);
    const second = encodeSlateArchiveZip(bundle);

    assert.deepEqual(first, second);
    assert.equal(Buffer.from(first.subarray(0, 4)).toString("hex"), "504b0304");
    assert.equal(readUint32(first, endOfCentralDirectory(first)), ZIP_END_OF_CENTRAL_DIRECTORY);
    assert.deepEqual(decodeSlateArchiveZip(first), bundle);
  });

  it("rejects content whose ZIP checksum no longer matches", () => {
    const archive = Uint8Array.from(encodeSlateArchiveZip(bundle));
    const manuscript = zipEntry(archive, "manuscript.md");
    assert.ok(manuscript.contentLength > 0);
    archive[manuscript.contentOffset] = archive[manuscript.contentOffset]! ^ 0x01;

    assert.throws(
      () => decodeSlateArchiveZip(archive),
      /Slate ZIP archive checksum failed for manuscript\.md/,
    );
  });

  it("rejects path traversal encoded consistently in local and central headers", () => {
    const archive = Uint8Array.from(encodeSlateArchiveZip(bundle));
    renameZipEntry(archive, "manuscript.md", "../payload.md");

    assert.throws(() => decodeSlateArchiveZip(archive), /Unsafe Slate archive path/);
  });

  it("rejects a future manifest version even when its ZIP checksum is valid", () => {
    const archive = Uint8Array.from(encodeSlateArchiveZip(bundle));
    const manifest = zipEntry(archive, "manifest.json");
    const content = archive.subarray(
      manifest.contentOffset,
      manifest.contentOffset + manifest.contentLength,
    );
    const versionMarker = new TextEncoder().encode('"version":1');
    const markerOffset = Buffer.from(content).indexOf(versionMarker);
    assert.ok(markerOffset >= 0, "Expected manifest version marker.");
    content[markerOffset + versionMarker.byteLength - 1] = "2".charCodeAt(0);
    const checksum = slateArchiveCrc32(content);
    writeUint32(archive, manifest.localOffset + 14, checksum);
    writeUint32(archive, manifest.centralOffset + 16, checksum);

    assert.throws(() => decodeSlateArchiveZip(archive), /Unsupported Slate archive format/);
  });

  it("rejects a transport with no manifest entry", () => {
    const archive = Uint8Array.from(encodeSlateArchiveZip(bundle));
    renameZipEntry(archive, "manifest.json", "readme00.json");

    assert.throws(() => decodeSlateArchiveZip(archive), /missing manifest\.json/);
  });

  it("rejects duplicate entry names before reading archive content", () => {
    const archive = Uint8Array.from(encodeSlateArchiveZip(bundle));
    renameZipEntry(archive, "manuscript.md", "manifest.json");

    assert.throws(() => decodeSlateArchiveZip(archive), /repeats manifest\.json/);
  });
});
