import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION,
  SLATE_SCENE_BREAK,
  SlateManuscriptExportError,
  type SlateCleanDocument,
  type SlateCleanDocumentBlock,
  type SlateDocxWriter,
} from "./slate-manuscript-export.ts";

const FIXED_CORE_TIMESTAMP = "1980-01-01T00:00:00Z";
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_FILE_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_DOS_EPOCH_DATE = 0x0021;

function xmlText(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function deterministicCoreProperties(title: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `<dc:title>${xmlText(title)}</dc:title>`,
    "<dc:creator>PRISM Slate</dc:creator>",
    "<cp:lastModifiedBy>PRISM Slate</cp:lastModifiedBy>",
    "<cp:revision>1</cp:revision>",
    `<dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_CORE_TIMESTAMP}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_CORE_TIMESTAMP}</dcterms:modified>`,
    "</cp:coreProperties>",
  ].join("");
}

function headingFor(level: 1 | 2 | 3): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}

function proseParagraphs(text: string): Paragraph[] {
  return text
    .split(/\n{2,}/u)
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      return new Paragraph({
        children: lines.map(
          (line, index) =>
            new TextRun({ text: line, ...(index > 0 ? { break: 1 } : {}) }),
        ),
        spacing: { after: 160, line: 276 },
        widowControl: true,
      });
    });
}

function paragraphsForBlock(block: SlateCleanDocumentBlock): Paragraph[] {
  if (block.kind === "title") {
    return [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: [new TextRun(block.text)],
      }),
    ];
  }
  if (block.kind === "heading") {
    return [
      new Paragraph({
        heading: headingFor(block.level),
        keepNext: true,
        children: [new TextRun(block.text)],
      }),
    ];
  }
  if (block.kind === "scene-break") {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [new TextRun(SLATE_SCENE_BREAK)],
      }),
    ];
  }
  return proseParagraphs(block.text);
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

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new SlateManuscriptExportError("The DOCX writer produced an invalid ZIP archive.");
}

/**
 * JSZip assigns wall-clock timestamps to archive entries. OOXML does not need
 * them, so pin both central and local ZIP headers to the DOS epoch. The file
 * contents and CRCs remain untouched.
 */
function normalizeZipEntryTimestamps(payload: Uint8Array): Uint8Array {
  const bytes = Uint8Array.from(payload);
  const endOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUint16(bytes, endOffset + 10);
  const centralDirectoryOffset = readUint32(bytes, endOffset + 16);
  if (entryCount === 0xffff) {
    throw new SlateManuscriptExportError("ZIP64 DOCX output is not supported.");
  }

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, cursor) !== ZIP_CENTRAL_FILE_HEADER) {
      throw new SlateManuscriptExportError(
        "The DOCX writer produced an invalid central directory.",
      );
    }
    writeUint16(bytes, cursor + 12, 0);
    writeUint16(bytes, cursor + 14, ZIP_DOS_EPOCH_DATE);

    const localHeaderOffset = readUint32(bytes, cursor + 42);
    if (readUint32(bytes, localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new SlateManuscriptExportError(
        "The DOCX writer produced an invalid local file header.",
      );
    }
    writeUint16(bytes, localHeaderOffset + 10, 0);
    writeUint16(bytes, localHeaderOffset + 12, ZIP_DOS_EPOCH_DATE);

    const fileNameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return bytes;
}

function documentTitle(document: SlateCleanDocument): string {
  const title = document.blocks.find((block) => block.kind === "title");
  if (!title || title.kind !== "title" || !title.text.trim()) {
    throw new SlateManuscriptExportError("A DOCX export requires a document title.");
  }
  return title.text;
}

export const slateDocxWriter: SlateDocxWriter = {
  async write(cleanDocument) {
    if (cleanDocument.schemaVersion !== SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION) {
      throw new SlateManuscriptExportError(
        `Unsupported clean document schema ${cleanDocument.schemaVersion}.`,
      );
    }
    const title = documentTitle(cleanDocument);
    const children = cleanDocument.blocks.flatMap(paragraphsForBlock);
    const document = new Document({
      title,
      creator: "PRISM Slate",
      lastModifiedBy: "PRISM Slate",
      revision: 1,
      sections: [{ children }],
    });
    const packed = await Packer.toBuffer(document, false, [
      {
        path: "docProps/core.xml",
        data: deterministicCoreProperties(title),
      },
    ]);
    return normalizeZipEntryTimestamps(packed);
  },
};
