import { createHash } from "node:crypto";

export const SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION = 1;
export const SLATE_SCENE_BREAK = "* * *";

export type SlateExportSectionKind = "act" | "chapter" | "scene" | "imported";
export type SlateManuscriptExportFormat = "docx" | "markdown" | "text";

/**
 * The export boundary deliberately accepts manuscript fields only. Callers may
 * pass richer section records, but private direction, Continuity, review, and
 * provider metadata have no representation in the clean document model.
 */
export interface SlateExportSection {
  id: string;
  parentSectionId: string | null;
  kind: SlateExportSectionKind;
  ordinal: number;
  title: string;
  prose: string;
  revision: number;
}

export interface SlateExportSource {
  projectId: string;
  title: string;
  sections: readonly SlateExportSection[];
}

export type SlateManuscriptExportScope =
  | { kind: "book" }
  | { kind: "act"; sectionId: string }
  | { kind: "chapter"; sectionId: string }
  | { kind: "scene"; sectionId: string }
  | {
      kind: "selection";
      sectionId: string;
      start: number;
      end: number;
    };

export type SlateCleanDocumentBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "prose"; text: string }
  | { kind: "scene-break" };

/** The format-neutral model consumed by the Markdown, text, and DOCX writers. */
export interface SlateCleanDocument {
  schemaVersion: typeof SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION;
  blocks: readonly SlateCleanDocumentBlock[];
}

export interface SlateExportSourceRevision {
  sectionId: string;
  revision: number;
  contentSha256: string;
}

export type SlateResolvedExportScope =
  | { kind: "book" }
  | { kind: "act"; sectionId: string }
  | { kind: "chapter"; sectionId: string }
  | { kind: "scene"; sectionId: string }
  | {
      kind: "selection";
      sectionId: string;
      start: number;
      end: number;
      offsetUnit: "utf16-code-unit";
    };

export interface SlatePreparedManuscriptExport {
  projectId: string;
  title: string;
  scope: SlateResolvedExportScope;
  sourceRevisions: readonly SlateExportSourceRevision[];
  document: SlateCleanDocument;
}

export interface SlateManuscriptExportManifest {
  schemaVersion: typeof SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION;
  projectId: string;
  title: string;
  scope: SlateResolvedExportScope;
  format: SlateManuscriptExportFormat;
  exportedAt: string;
  sourceRevisions: readonly SlateExportSourceRevision[];
  payloadByteLength: number;
  payloadSha256: string;
  manifestSha256: string;
}

export interface SlateTextManuscriptExport {
  format: "markdown" | "text";
  mediaType: "text/markdown; charset=utf-8" | "text/plain; charset=utf-8";
  payload: string;
  manifest: SlateManuscriptExportManifest;
}

/** Adapter seam for the focused `docx` npm package; no OOXML is maintained here. */
export interface SlateDocxWriter {
  write(document: SlateCleanDocument): Uint8Array | Promise<Uint8Array>;
}

export interface SlateDocxManuscriptExport {
  format: "docx";
  mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  payload: Uint8Array;
  manifest: SlateManuscriptExportManifest;
}

export class SlateManuscriptExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlateManuscriptExportError";
  }
}

function sha256(payload: string | Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizedLabel(value: string, label: string): string {
  const normalized = value.replace(/\r\n?/gu, "\n").replace(/\s*\n\s*/gu, " ").trim();
  if (!normalized) throw new SlateManuscriptExportError(`${label} is required.`);
  return normalized;
}

function normalizedProse(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/^(?:[\t ]*\n)+/u, "")
    .replace(/(?:\n[\t ]*)+$/u, "");
}

function assertUtf16Boundary(value: string, offset: number, label: string): void {
  if (offset <= 0 || offset >= value.length) return;
  const before = value.charCodeAt(offset - 1);
  const after = value.charCodeAt(offset);
  const splitsSurrogatePair =
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff;
  if (splitsSurrogatePair) {
    throw new SlateManuscriptExportError(
      `${label} cannot split a Unicode surrogate pair.`,
    );
  }
}

function validateAndOrderSections(
  sections: readonly SlateExportSection[],
): SlateExportSection[] {
  const byId = new Map<string, SlateExportSection>();
  const ordinals = new Set<number>();
  const kinds = new Set<SlateExportSectionKind>([
    "act",
    "chapter",
    "scene",
    "imported",
  ]);

  for (const section of sections) {
    if (!section.id.trim()) {
      throw new SlateManuscriptExportError("Every export section needs an id.");
    }
    if (byId.has(section.id)) {
      throw new SlateManuscriptExportError(`Duplicate section id: ${section.id}.`);
    }
    if (!Number.isSafeInteger(section.ordinal) || section.ordinal < 0) {
      throw new SlateManuscriptExportError(
        `Section ${section.id} has an invalid ordinal.`,
      );
    }
    if (ordinals.has(section.ordinal)) {
      throw new SlateManuscriptExportError(
        `Section ordinal ${section.ordinal} is not unique.`,
      );
    }
    if (!Number.isSafeInteger(section.revision) || section.revision < 0) {
      throw new SlateManuscriptExportError(
        `Section ${section.id} has an invalid revision.`,
      );
    }
    if (!kinds.has(section.kind)) {
      throw new SlateManuscriptExportError(
        `Section ${section.id} has an unsupported kind.`,
      );
    }
    byId.set(section.id, section);
    ordinals.add(section.ordinal);
  }

  for (const section of sections) {
    if (
      section.parentSectionId !== null &&
      !byId.has(section.parentSectionId)
    ) {
      throw new SlateManuscriptExportError(
        `Section ${section.id} has an unknown parent.`,
      );
    }
    const visited = new Set<string>();
    let cursor: SlateExportSection | undefined = section;
    while (cursor?.parentSectionId) {
      if (visited.has(cursor.id)) {
        throw new SlateManuscriptExportError("Section hierarchy contains a cycle.");
      }
      visited.add(cursor.id);
      cursor = byId.get(cursor.parentSectionId);
    }
  }

  return [...sections].sort(
    (left, right) =>
      left.ordinal - right.ordinal || compareCodeUnits(left.id, right.id),
  );
}

function sectionIsDescendantOf(
  section: SlateExportSection,
  ancestorId: string,
  byId: ReadonlyMap<string, SlateExportSection>,
): boolean {
  let parentId = section.parentSectionId;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = byId.get(parentId)?.parentSectionId ?? null;
  }
  return false;
}

function resolveSections(
  ordered: readonly SlateExportSection[],
  scope: SlateManuscriptExportScope,
): { sections: SlateExportSection[]; scope: SlateResolvedExportScope } {
  if (scope.kind === "book") return { sections: [...ordered], scope };

  const byId = new Map(ordered.map((section) => [section.id, section]));
  const target = byId.get(scope.sectionId);
  if (!target) {
    throw new SlateManuscriptExportError(
      `Export section ${scope.sectionId} was not found.`,
    );
  }

  if (scope.kind === "selection") {
    if (
      !Number.isSafeInteger(scope.start) ||
      !Number.isSafeInteger(scope.end) ||
      scope.start < 0 ||
      scope.end <= scope.start ||
      scope.end > target.prose.length
    ) {
      throw new SlateManuscriptExportError("Selection offsets are invalid.");
    }
    assertUtf16Boundary(target.prose, scope.start, "Selection start");
    assertUtf16Boundary(target.prose, scope.end, "Selection end");
    return {
      sections: [{ ...target, prose: target.prose.slice(scope.start, scope.end) }],
      scope: { ...scope, offsetUnit: "utf16-code-unit" },
    };
  }

  const expectedKind = scope.kind;
  const validSceneTarget =
    expectedKind === "scene" &&
    (target.kind === "scene" || target.kind === "imported");
  if (target.kind !== expectedKind && !validSceneTarget) {
    throw new SlateManuscriptExportError(
      `Export scope ${scope.kind} requires a ${scope.kind} section.`,
    );
  }
  if (scope.kind === "scene") return { sections: [target], scope };

  return {
    sections: ordered.filter(
      (section) =>
        section.id === target.id || sectionIsDescendantOf(section, target.id, byId),
    ),
    scope,
  };
}

function headingLevel(kind: SlateExportSectionKind): 1 | 2 | 3 {
  if (kind === "act" || kind === "imported") return 1;
  if (kind === "chapter") return 2;
  return 3;
}

export function prepareSlateManuscriptExport(
  source: SlateExportSource,
  requestedScope: SlateManuscriptExportScope,
): SlatePreparedManuscriptExport {
  const projectId = normalizedLabel(source.projectId, "Project id");
  const title = normalizedLabel(source.title, "Project title");
  const ordered = validateAndOrderSections(source.sections);
  const resolved = resolveSections(ordered, requestedScope);
  const blocks: SlateCleanDocumentBlock[] = [{ kind: "title", text: title }];
  let priorLeafHadProse = false;

  for (const section of resolved.sections) {
    const sectionTitle = normalizedLabel(section.title, `Section ${section.id} title`);
    const prose = normalizedProse(section.prose);
    const leaf = section.kind === "scene" || section.kind === "imported";

    if (!leaf) priorLeafHadProse = false;
    if (leaf && prose.trim().length > 0 && priorLeafHadProse) {
      blocks.push({ kind: "scene-break" });
    }
    blocks.push({
      kind: "heading",
      level: headingLevel(section.kind),
      text: sectionTitle,
    });
    if (prose.length > 0) blocks.push({ kind: "prose", text: prose });
    if (leaf && prose.trim().length > 0) priorLeafHadProse = true;
  }

  const originalById = new Map(ordered.map((section) => [section.id, section]));
  const sourceRevisions = resolved.sections.map((section) => {
    const original = originalById.get(section.id)!;
    return {
      sectionId: original.id,
      revision: original.revision,
      contentSha256: sha256(original.prose),
    };
  });

  return {
    projectId,
    title,
    scope: resolved.scope,
    sourceRevisions,
    document: {
      schemaVersion: SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION,
      blocks,
    },
  };
}

export function renderSlateManuscriptMarkdown(
  document: SlateCleanDocument,
): string {
  const parts = document.blocks.map((block) => {
    if (block.kind === "title") return `# ${block.text}`;
    if (block.kind === "heading") {
      return `${"#".repeat(block.level + 1)} ${block.text}`;
    }
    if (block.kind === "scene-break") return SLATE_SCENE_BREAK;
    return block.text;
  });
  return parts.length === 0 ? "" : `${parts.join("\n\n")}\n`;
}

export function renderSlateManuscriptText(document: SlateCleanDocument): string {
  const parts = document.blocks.map((block) =>
    block.kind === "scene-break" ? SLATE_SCENE_BREAK : block.text,
  );
  return parts.length === 0 ? "" : `${parts.join("\n\n")}\n`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareCodeUnits);
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function normalizedTimestamp(exportedAt: string): string {
  const timestamp = new Date(exportedAt);
  if (!Number.isFinite(timestamp.valueOf())) {
    throw new SlateManuscriptExportError("Export timestamp is invalid.");
  }
  return timestamp.toISOString();
}

function manifestFor(
  prepared: SlatePreparedManuscriptExport,
  format: SlateManuscriptExportFormat,
  exportedAt: string,
  payload: string | Uint8Array,
): SlateManuscriptExportManifest {
  const bytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const body = {
    schemaVersion: SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION,
    projectId: prepared.projectId,
    title: prepared.title,
    scope: prepared.scope,
    format,
    exportedAt: normalizedTimestamp(exportedAt),
    sourceRevisions: prepared.sourceRevisions,
    payloadByteLength: bytes.byteLength,
    payloadSha256: sha256(bytes),
  } as const;
  return { ...body, manifestSha256: sha256(stableJson(body)) };
}

export function serializeSlateExportManifest(
  manifest: SlateManuscriptExportManifest,
): string {
  return `${stableJson(manifest)}\n`;
}

export function createSlateTextManuscriptExport(input: {
  source: SlateExportSource;
  scope: SlateManuscriptExportScope;
  format: "markdown" | "text";
  exportedAt: string;
}): SlateTextManuscriptExport {
  const prepared = prepareSlateManuscriptExport(input.source, input.scope);
  const payload =
    input.format === "markdown"
      ? renderSlateManuscriptMarkdown(prepared.document)
      : renderSlateManuscriptText(prepared.document);
  return {
    format: input.format,
    mediaType:
      input.format === "markdown"
        ? "text/markdown; charset=utf-8"
        : "text/plain; charset=utf-8",
    payload,
    manifest: manifestFor(prepared, input.format, input.exportedAt, payload),
  };
}

export async function createSlateDocxManuscriptExport(input: {
  source: SlateExportSource;
  scope: SlateManuscriptExportScope;
  exportedAt: string;
  writer: SlateDocxWriter;
}): Promise<SlateDocxManuscriptExport> {
  const prepared = prepareSlateManuscriptExport(input.source, input.scope);
  const payload = await input.writer.write(prepared.document);
  if (!(payload instanceof Uint8Array) || payload.byteLength === 0) {
    throw new SlateManuscriptExportError(
      "The DOCX writer returned an empty or invalid document.",
    );
  }
  return {
    format: "docx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    payload,
    manifest: manifestFor(prepared, "docx", input.exportedAt, payload),
  };
}
