import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  createSlateDocxManuscriptExport,
  createSlateTextManuscriptExport,
  prepareSlateManuscriptExport,
  renderSlateManuscriptMarkdown,
  serializeSlateExportManifest,
  SlateManuscriptExportError,
  type SlateCleanDocument,
  type SlateExportSource,
} from "../slate-manuscript-export.ts";

const EXPORTED_AT = "2026-07-16T18:30:00.000Z";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function novelSource(): SlateExportSource {
  const sections = [
    {
      id: "scene-crossing",
      parentSectionId: "chapter-river",
      kind: "scene" as const,
      ordinal: 5,
      title: "The Crossing",
      prose: "Þóra crossed the black river. 夜明け waited beyond it.",
      revision: 8,
      direction: "PRIVATE DIRECTION: make this darker",
      provider: "SECRET PROVIDER METADATA",
    },
    {
      id: "act-one",
      parentSectionId: null,
      kind: "act" as const,
      ordinal: 0,
      title: "Act I — Winter",
      prose: "",
      revision: 1,
    },
    {
      id: "scene-keep",
      parentSectionId: "chapter-snow",
      kind: "scene" as const,
      ordinal: 3,
      title: "The Keep",
      prose: "At the keep, Sævar said, “We remember.”",
      revision: 5,
      reviewCircle: "PRIVATE REVIEW: cut the keeper",
    },
    {
      id: "chapter-snow",
      parentSectionId: "act-one",
      kind: "chapter" as const,
      ordinal: 1,
      title: "Chapter One: Snow",
      prose: "",
      revision: 2,
    },
    {
      id: "scene-snowfall",
      parentSectionId: "chapter-snow",
      kind: "scene" as const,
      ordinal: 2,
      title: "Snowfall",
      prose: "Snow fell over Sævar. 🐉\r\n\r\nMara kept walking.",
      revision: 12,
      continuity: "PRIVATE CONTINUITY: dragon is an illusion",
      aiProvenance: "PRIVATE AI PROVENANCE",
    },
    {
      id: "chapter-river",
      parentSectionId: "act-one",
      kind: "chapter" as const,
      ordinal: 4,
      title: "Chapter Two: River",
      prose: "",
      revision: 3,
    },
    {
      id: "act-two",
      parentSectionId: null,
      kind: "act" as const,
      ordinal: 6,
      title: "Act II — Fire",
      prose: "",
      revision: 1,
    },
    {
      id: "chapter-home",
      parentSectionId: "act-two",
      kind: "chapter" as const,
      ordinal: 7,
      title: "Chapter Three: Home",
      prose: "",
      revision: 1,
    },
    {
      id: "scene-return",
      parentSectionId: "chapter-home",
      kind: "scene" as const,
      ordinal: 8,
      title: "Return",
      prose: "Mara came home.",
      revision: 2,
    },
  ];
  return {
    projectId: "book-one",
    title: "The Glass Cycle",
    sections,
  };
}

describe("Slate deterministic manuscript exports", () => {
  it("renders a clean, ordered Unicode book as Markdown with conventional scene breaks", () => {
    const result = createSlateTextManuscriptExport({
      source: novelSource(),
      scope: { kind: "book" },
      format: "markdown",
      exportedAt: EXPORTED_AT,
    });

    assert.equal(
      result.payload,
      [
        "# The Glass Cycle",
        "## Act I — Winter",
        "### Chapter One: Snow",
        "#### Snowfall",
        "Snow fell over Sævar. 🐉\n\nMara kept walking.",
        "* * *",
        "#### The Keep",
        "At the keep, Sævar said, “We remember.”",
        "### Chapter Two: River",
        "#### The Crossing",
        "Þóra crossed the black river. 夜明け waited beyond it.",
        "## Act II — Fire",
        "### Chapter Three: Home",
        "#### Return",
        "Mara came home.\n",
      ].join("\n\n"),
    );
    assert.equal(result.mediaType, "text/markdown; charset=utf-8");
    assert.equal(result.payload.match(/\* \* \*/gu)?.length, 1);
    assert.deepEqual(
      result.manifest.sourceRevisions.map((item) => item.sectionId),
      [
        "act-one",
        "chapter-snow",
        "scene-snowfall",
        "scene-keep",
        "chapter-river",
        "scene-crossing",
        "act-two",
        "chapter-home",
        "scene-return",
      ],
    );
  });

  it("renders plain text without Markdown heading syntax", () => {
    const result = createSlateTextManuscriptExport({
      source: novelSource(),
      scope: { kind: "chapter", sectionId: "chapter-snow" },
      format: "text",
      exportedAt: EXPORTED_AT,
    });

    assert.equal(
      result.payload,
      [
        "The Glass Cycle",
        "Chapter One: Snow",
        "Snowfall",
        "Snow fell over Sævar. 🐉\n\nMara kept walking.",
        "* * *",
        "The Keep",
        "At the keep, Sævar said, “We remember.”\n",
      ].join("\n\n"),
    );
    assert.ok(!result.payload.includes("####"));
    assert.equal(result.manifest.scope.kind, "chapter");
  });

  it("resolves act, chapter, scene, selection, and book scopes independently", () => {
    const source = novelSource();
    const act = prepareSlateManuscriptExport(source, {
      kind: "act",
      sectionId: "act-two",
    });
    const chapter = prepareSlateManuscriptExport(source, {
      kind: "chapter",
      sectionId: "chapter-river",
    });
    const scene = prepareSlateManuscriptExport(source, {
      kind: "scene",
      sectionId: "scene-return",
    });
    const target = source.sections.find((item) => item.id === "scene-snowfall")!;
    const start = target.prose.indexOf("🐉");
    const selection = prepareSlateManuscriptExport(source, {
      kind: "selection",
      sectionId: target.id,
      start,
      end: target.prose.length,
    });
    const book = prepareSlateManuscriptExport(source, { kind: "book" });

    assert.deepEqual(
      act.sourceRevisions.map((item) => item.sectionId),
      ["act-two", "chapter-home", "scene-return"],
    );
    assert.deepEqual(
      chapter.sourceRevisions.map((item) => item.sectionId),
      ["chapter-river", "scene-crossing"],
    );
    assert.deepEqual(scene.sourceRevisions.map((item) => item.sectionId), [
      "scene-return",
    ]);
    assert.match(renderSlateManuscriptMarkdown(selection.document), /🐉\n\nMara kept walking\./u);
    assert.deepEqual(selection.scope, {
      kind: "selection",
      sectionId: "scene-snowfall",
      start,
      end: target.prose.length,
      offsetUnit: "utf16-code-unit",
    });
    assert.equal(book.sourceRevisions.length, source.sections.length);
    assert.equal(
      selection.sourceRevisions[0]?.contentSha256,
      sha256(target.prose),
      "selection provenance hashes the complete source revision",
    );
  });

  it("strictly excludes direction, Continuity, review, and provider metadata", () => {
    const prepared = prepareSlateManuscriptExport(novelSource(), { kind: "book" });
    const result = createSlateTextManuscriptExport({
      source: novelSource(),
      scope: { kind: "book" },
      format: "markdown",
      exportedAt: EXPORTED_AT,
    });
    const observableExport = [
      JSON.stringify(prepared.document),
      result.payload,
      serializeSlateExportManifest(result.manifest),
    ].join("\n");

    assert.ok(!observableExport.includes("PRIVATE DIRECTION"));
    assert.ok(!observableExport.includes("PRIVATE CONTINUITY"));
    assert.ok(!observableExport.includes("PRIVATE REVIEW"));
    assert.ok(!observableExport.includes("PRIVATE AI PROVENANCE"));
    assert.ok(!observableExport.includes("SECRET PROVIDER METADATA"));
    assert.deepEqual(Object.keys(prepared.document).sort(), ["blocks", "schemaVersion"]);
  });

  it("creates repeatable payload and manifest checksums", () => {
    const input = {
      source: novelSource(),
      scope: { kind: "book" } as const,
      format: "markdown" as const,
      exportedAt: EXPORTED_AT,
    };
    const first = createSlateTextManuscriptExport(input);
    const second = createSlateTextManuscriptExport(input);
    const serialized = serializeSlateExportManifest(first.manifest);

    assert.equal(first.payload, second.payload);
    assert.deepEqual(first.manifest, second.manifest);
    assert.equal(first.manifest.payloadSha256, sha256(first.payload));
    assert.equal(
      first.manifest.payloadByteLength,
      new TextEncoder().encode(first.payload).byteLength,
    );
    assert.equal(serialized, serializeSlateExportManifest(second.manifest));
    assert.ok(serialized.endsWith("\n"));
    assert.match(first.manifest.manifestSha256, /^[a-f0-9]{64}$/u);
  });

  it("provides a format-neutral hook for a focused DOCX writer", async () => {
    let received: SlateCleanDocument | null = null;
    const docxBytes = new TextEncoder().encode("deterministic-docx-fixture");
    const result = await createSlateDocxManuscriptExport({
      source: novelSource(),
      scope: { kind: "scene", sectionId: "scene-crossing" },
      exportedAt: EXPORTED_AT,
      writer: {
        write(document) {
          received = document;
          return docxBytes;
        },
      },
    });

    assert.ok(received);
    assert.equal(result.format, "docx");
    assert.equal(
      result.mediaType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.equal(result.manifest.payloadSha256, sha256(docxBytes));
    assert.equal(result.manifest.format, "docx");
    assert.deepEqual(
      received.blocks.map((block) => block.kind),
      ["title", "heading", "prose"],
    );
  });

  it("rejects malformed scopes, hierarchy, Unicode boundaries, and DOCX output", async () => {
    const source = novelSource();
    const emojiSection = source.sections.find(
      (item) => item.id === "scene-snowfall",
    )!;
    const emojiOffset = emojiSection.prose.indexOf("🐉");

    assert.throws(
      () =>
        prepareSlateManuscriptExport(source, {
          kind: "selection",
          sectionId: emojiSection.id,
          start: emojiOffset + 1,
          end: emojiOffset + 2,
        }),
      /surrogate pair/u,
    );
    assert.throws(
      () =>
        prepareSlateManuscriptExport(source, {
          kind: "chapter",
          sectionId: "scene-return",
        }),
      /requires a chapter/u,
    );
    assert.throws(
      () =>
        prepareSlateManuscriptExport(
          {
            ...source,
            sections: [
              ...source.sections,
              {
                id: "duplicate-ordinal",
                parentSectionId: null,
                kind: "scene",
                ordinal: 8,
                title: "Duplicate",
                prose: "No.",
                revision: 0,
              },
            ],
          },
          { kind: "book" },
        ),
      /ordinal 8 is not unique/u,
    );
    await assert.rejects(
      createSlateDocxManuscriptExport({
        source,
        scope: { kind: "book" },
        exportedAt: EXPORTED_AT,
        writer: { write: () => new Uint8Array() },
      }),
      (error: unknown) =>
        error instanceof SlateManuscriptExportError && /empty or invalid/u.test(error.message),
    );
  });
});
