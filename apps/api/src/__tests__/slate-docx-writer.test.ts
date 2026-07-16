import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { describe, it } from "node:test";
import { slateDocxWriter } from "../slate-docx-writer.ts";
import {
  createSlateDocxManuscriptExport,
  SlateManuscriptExportError,
  type SlateExportSource,
} from "../slate-manuscript-export.ts";

const EXPORTED_AT = "2026-07-16T19:00:00.000Z";
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

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

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("ZIP end record not found");
}

interface ZipEntry {
  name: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
  centralHeaderOffset: number;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const endOffset = findEndOfCentralDirectory(bytes);
  const count = readUint16(bytes, endOffset + 10);
  let cursor = readUint32(bytes, endOffset + 16);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    assert.equal(readUint32(bytes, cursor), ZIP_CENTRAL_FILE_HEADER);
    const nameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    entries.push({
      name: decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)),
      compression: readUint16(bytes, cursor + 10),
      compressedSize: readUint32(bytes, cursor + 20),
      localHeaderOffset: readUint32(bytes, cursor + 42),
      centralHeaderOffset: cursor,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function zipText(bytes: Uint8Array, path: string): string {
  const entry = zipEntries(bytes).find((candidate) => candidate.name === path);
  assert.ok(entry, `Expected ${path} in DOCX archive`);
  const localOffset = entry.localHeaderOffset;
  assert.equal(readUint32(bytes, localOffset), ZIP_LOCAL_FILE_HEADER);
  const nameLength = readUint16(bytes, localOffset + 26);
  const extraLength = readUint16(bytes, localOffset + 28);
  const contentOffset = localOffset + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(
    contentOffset,
    contentOffset + entry.compressedSize,
  );
  const content =
    entry.compression === 0
      ? compressed
      : entry.compression === 8
        ? inflateRawSync(compressed)
        : assert.fail(`Unsupported ZIP compression ${entry.compression}`);
  return new TextDecoder().decode(content);
}

function source(): SlateExportSource {
  return {
    projectId: "unicode-book",
    title: "Sævar & 夜明け",
    sections: [
      {
        id: "act",
        parentSectionId: null,
        kind: "act",
        ordinal: 0,
        title: "Act I — Þingvellir",
        prose: "",
        revision: 1,
      },
      {
        id: "chapter",
        parentSectionId: "act",
        kind: "chapter",
        ordinal: 1,
        title: "Chapter One: 帰還",
        prose: "",
        revision: 2,
      },
      {
        id: "first-scene",
        parentSectionId: "chapter",
        kind: "scene",
        ordinal: 2,
        title: "Snow & Ember",
        prose: "Þóra whispered, “Komdu heim.” 🐉\n\n雪 melted on Mara’s sleeve.",
        revision: 9,
        direction: "PRIVATE DIRECTION",
      } as SlateExportSource["sections"][number],
      {
        id: "second-scene",
        parentSectionId: "chapter",
        kind: "scene",
        ordinal: 3,
        title: "Dawn",
        prose: "夜明け answered.",
        revision: 4,
      },
    ],
  };
}

describe("Slate DOCX writer", () => {
  it("writes Unicode prose, structural heading levels, and a centered scene break", async () => {
    const result = await createSlateDocxManuscriptExport({
      source: source(),
      scope: { kind: "book" },
      exportedAt: EXPORTED_AT,
      writer: slateDocxWriter,
    });
    const xml = zipText(result.payload, "word/document.xml");

    assert.equal(String.fromCharCode(...result.payload.subarray(0, 2)), "PK");
    assert.match(xml, /<w:pStyle w:val="Title"\/>/u);
    assert.match(xml, /<w:pStyle w:val="Heading1"\/>/u);
    assert.match(xml, /<w:pStyle w:val="Heading2"\/>/u);
    assert.match(xml, /<w:pStyle w:val="Heading3"\/>/u);
    assert.match(xml, /Sævar &amp; 夜明け/u);
    assert.match(xml, /Þóra whispered, “Komdu heim\.” 🐉/u);
    assert.match(xml, /雪 melted on Mara’s sleeve\./u);
    assert.match(
      xml,
      /<w:p><w:pPr>.*?<w:jc w:val="center"\/>.*?<\/w:pPr>.*?<w:t xml:space="preserve">\* \* \*<\/w:t>.*?<\/w:p>/u,
    );
    assert.ok(!xml.includes("PRIVATE DIRECTION"));
  });

  it("pins OOXML and ZIP timestamps so identical documents have identical bytes", async () => {
    const create = () =>
      createSlateDocxManuscriptExport({
        source: source(),
        scope: { kind: "book" } as const,
        exportedAt: EXPORTED_AT,
        writer: slateDocxWriter,
      });
    const first = await create();
    const second = await create();
    const core = zipText(first.payload, "docProps/core.xml");

    assert.deepEqual(first.payload, second.payload);
    assert.equal(first.manifest.payloadSha256, second.manifest.payloadSha256);
    assert.match(core, /<dc:title>Sævar &amp; 夜明け<\/dc:title>/u);
    assert.equal(
      core.match(/1980-01-01T00:00:00Z/gu)?.length,
      2,
      "created and modified timestamps are fixed",
    );
    for (const entry of zipEntries(first.payload)) {
      assert.equal(readUint16(first.payload, entry.centralHeaderOffset + 12), 0);
      assert.equal(readUint16(first.payload, entry.centralHeaderOffset + 14), 0x21);
      assert.equal(readUint16(first.payload, entry.localHeaderOffset + 10), 0);
      assert.equal(readUint16(first.payload, entry.localHeaderOffset + 12), 0x21);
    }
  });

  it("rejects an unsupported clean document version", async () => {
    await assert.rejects(
      slateDocxWriter.write({
        schemaVersion: 99,
        blocks: [{ kind: "title", text: "Future document" }],
      } as never),
      (error: unknown) =>
        error instanceof SlateManuscriptExportError &&
        /unsupported clean document schema 99/iu.test(error.message),
    );
  });
});
