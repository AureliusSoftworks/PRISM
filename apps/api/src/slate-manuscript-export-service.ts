import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ensureSlateProjectSections } from "./slate-continuity.ts";
import { slateDocxWriter } from "./slate-docx-writer.ts";
import {
  SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION,
  createSlateDocxManuscriptExport,
  createSlateTextManuscriptExport,
  serializeSlateExportManifest,
  SlateManuscriptExportError,
  type SlateExportSection,
  type SlateExportSource,
  type SlateManuscriptExportFormat,
  type SlateManuscriptExportManifest,
  type SlateManuscriptExportScope,
  type SlateResolvedExportScope,
} from "./slate-manuscript-export.ts";

const EXPORT_HISTORY_DEFAULT_LIMIT = 30;
const EXPORT_HISTORY_MAX_LIMIT = 100;
const EXPORT_SECTION_ID_MAX = 240;
const EXPORT_FILENAME_MAX = 160;

interface ProjectRow {
  id: string;
  title: string;
}

interface ExportSectionRow {
  id: string;
  parent_section_id: string | null;
  kind: string;
  ordinal: number;
  title: string;
  prose: string;
  revision: number;
}

interface ExportHistoryRow {
  id: string;
  project_id: string;
  scope_json: string;
  format: string;
  filename: string;
  manifest_json: string;
  created_at: string;
}

export interface SlateManuscriptExportRequest {
  scope: unknown;
  format: unknown;
}

export interface SlateManuscriptExportHistoryEntry {
  id: string;
  projectId: string;
  filename: string;
  createdAt: string;
  manifest: SlateManuscriptExportManifest;
}

export interface SlateManuscriptExportDownload
  extends SlateManuscriptExportHistoryEntry {
  mediaType:
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "text/markdown; charset=utf-8"
    | "text/plain; charset=utf-8";
  payload: Uint8Array;
}

export interface SlateManuscriptExportServiceOptions {
  now?: () => Date;
  id?: () => string;
}

export class SlateManuscriptExportServiceError extends Error {
  readonly status: 400 | 404 | 500;

  constructor(status: 400 | 404 | 500, message: string) {
    super(message);
    this.name = "SlateManuscriptExportServiceError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requestError(message: string): never {
  throw new SlateManuscriptExportServiceError(400, message);
}

function nonemptyString(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") requestError(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized) requestError(`${label} is required.`);
  if (normalized.length > max) requestError(`${label} is too long.`);
  return normalized;
}

function exportFormat(value: unknown): SlateManuscriptExportFormat {
  if (value === "markdown" || value === "text" || value === "docx") return value;
  return requestError("Export format must be markdown, text, or docx.");
}

function exportScope(value: unknown): SlateManuscriptExportScope {
  if (!isRecord(value)) return requestError("Export scope must be an object.");
  if (value.kind === "book") return { kind: "book" };
  if (
    value.kind !== "act" &&
    value.kind !== "chapter" &&
    value.kind !== "scene" &&
    value.kind !== "selection"
  ) {
    return requestError(
      "Export scope must be book, act, chapter, scene, or selection.",
    );
  }
  const sectionId = nonemptyString(
    value.sectionId,
    "Export section id",
    EXPORT_SECTION_ID_MAX,
  );
  if (value.kind !== "selection") return { kind: value.kind, sectionId };
  if (
    !Number.isSafeInteger(value.start) ||
    !Number.isSafeInteger(value.end) ||
    Number(value.start) < 0 ||
    Number(value.end) <= Number(value.start)
  ) {
    return requestError("Selection offsets are invalid.");
  }
  return {
    kind: "selection",
    sectionId,
    start: Number(value.start),
    end: Number(value.end),
  };
}

function projectRow(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): ProjectRow {
  const row = db
    .prepare("SELECT id, title FROM slate_projects WHERE id = ? AND user_id = ?")
    .get(projectId, userId) as ProjectRow | undefined;
  if (!row) {
    throw new SlateManuscriptExportServiceError(404, "Slate project not found.");
  }
  return row;
}

function exportSource(
  db: DatabaseSync,
  userId: string,
  projectId: string,
): SlateExportSource {
  const project = projectRow(db, userId, projectId);
  ensureSlateProjectSections(db, userId, projectId);
  const rows = db
    .prepare(
      `SELECT id, parent_section_id, kind, ordinal, title, prose, revision
         FROM slate_sections
        WHERE project_id = ? AND user_id = ?
        ORDER BY ordinal ASC`,
    )
    .all(projectId, userId) as unknown as ExportSectionRow[];
  const sections = rows.map(
    (row): SlateExportSection => ({
      id: row.id,
      parentSectionId: row.parent_section_id,
      kind:
        row.kind === "act" ||
        row.kind === "chapter" ||
        row.kind === "scene" ||
        row.kind === "imported"
          ? row.kind
          : requestError(`Section ${row.id} has an unsupported export kind.`),
      ordinal: row.ordinal,
      title: row.title,
      prose: row.prose,
      revision: row.revision,
    }),
  );
  return { projectId: project.id, title: project.title, sections };
}

function asciiSlug(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72)
    .replace(/-+$/u, "");
  return normalized || fallback;
}

function filenameTimestamp(exportedAt: string): string {
  return exportedAt
    .slice(0, 19)
    .replace(/[-:]/gu, "")
    .replace("T", "-");
}

function filenameScopeLabel(
  scope: SlateResolvedExportScope,
  sections: readonly SlateExportSection[],
): string {
  if (scope.kind === "book") return "book";
  const section = sections.find((candidate) => candidate.id === scope.sectionId);
  const structural = asciiSlug(section?.title ?? scope.kind, scope.kind);
  return scope.kind === "selection" ? `${structural}-selection` : structural;
}

function extensionFor(format: SlateManuscriptExportFormat): "docx" | "md" | "txt" {
  if (format === "docx") return "docx";
  if (format === "markdown") return "md";
  return "txt";
}

export function slateManuscriptExportFilename(input: {
  title: string;
  scope: SlateResolvedExportScope;
  sections: readonly SlateExportSection[];
  format: SlateManuscriptExportFormat;
  exportedAt: string;
}): string {
  const rawTitle = asciiSlug(input.title, "slate-manuscript");
  const scope = filenameScopeLabel(input.scope, input.sections);
  const extension = extensionFor(input.format);
  const timestamp = filenameTimestamp(input.exportedAt);
  const suffix = `-${scope}-${timestamp}.${extension}`;
  const title = rawTitle.slice(0, Math.max(1, EXPORT_FILENAME_MAX - suffix.length));
  return `${title.replace(/-+$/u, "") || "slate"}${suffix}`;
}

function exportId(options: SlateManuscriptExportServiceOptions): string {
  const id = (options.id ?? randomUUID)();
  if (!id.trim() || id.length > 240) {
    throw new SlateManuscriptExportServiceError(500, "Export id generator failed.");
  }
  return id;
}

function exportTimestamp(options: SlateManuscriptExportServiceOptions): string {
  const timestamp = (options.now ?? (() => new Date()))();
  if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.valueOf())) {
    throw new SlateManuscriptExportServiceError(500, "Export clock failed.");
  }
  return timestamp.toISOString();
}

export async function createSlateManuscriptExport(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  rawRequest: SlateManuscriptExportRequest,
  options: SlateManuscriptExportServiceOptions = {},
): Promise<SlateManuscriptExportDownload> {
  if (!isRecord(rawRequest)) requestError("Export request must be an object.");
  const format = exportFormat(rawRequest.format);
  const scope = exportScope(rawRequest.scope);
  const source = exportSource(db, userId, projectId);
  const exportedAt = exportTimestamp(options);

  let payload: Uint8Array;
  let mediaType: SlateManuscriptExportDownload["mediaType"];
  let manifest: SlateManuscriptExportManifest;
  try {
    if (format === "docx") {
      const generated = await createSlateDocxManuscriptExport({
        source,
        scope,
        exportedAt,
        writer: slateDocxWriter,
      });
      payload = generated.payload;
      mediaType = generated.mediaType;
      manifest = generated.manifest;
    } else {
      const generated = createSlateTextManuscriptExport({
        source,
        scope,
        format,
        exportedAt,
      });
      payload = new TextEncoder().encode(generated.payload);
      mediaType = generated.mediaType;
      manifest = generated.manifest;
    }
  } catch (error) {
    if (error instanceof SlateManuscriptExportError) {
      throw new SlateManuscriptExportServiceError(400, error.message);
    }
    throw error;
  }

  const id = exportId(options);
  const filename = slateManuscriptExportFilename({
    title: source.title,
    scope: manifest.scope,
    sections: source.sections,
    format,
    exportedAt,
  });
  db.prepare(
    `INSERT INTO slate_manuscript_exports
      (id, user_id, project_id, scope_json, format, filename,
       manifest_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    projectId,
    JSON.stringify(manifest.scope),
    format,
    filename,
    serializeSlateExportManifest(manifest),
    exportedAt,
  );

  return {
    id,
    projectId,
    filename,
    createdAt: exportedAt,
    manifest,
    mediaType,
    payload,
  };
}

function parsedJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SlateManuscriptExportServiceError(500, `${label} is corrupt.`);
  }
}

function storedResolvedScope(value: unknown): SlateResolvedExportScope {
  try {
    const scope = exportScope(value);
    return scope.kind === "selection"
      ? { ...scope, offsetUnit: "utf16-code-unit" }
      : scope;
  } catch (error) {
    if (
      error instanceof SlateManuscriptExportServiceError &&
      error.status === 400
    ) {
      throw new SlateManuscriptExportServiceError(500, "Export scope is corrupt.");
    }
    throw error;
  }
}

function storedFormat(value: unknown): SlateManuscriptExportFormat {
  if (value === "markdown" || value === "text" || value === "docx") return value;
  throw new SlateManuscriptExportServiceError(500, "Export format is corrupt.");
}

function storedHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new SlateManuscriptExportServiceError(500, `${label} is corrupt.`);
  }
  return value;
}

function storedManifest(
  row: ExportHistoryRow,
  storedScope: SlateResolvedExportScope,
): SlateManuscriptExportManifest {
  const value = parsedJson(row.manifest_json, "Export manifest");
  if (!isRecord(value)) {
    throw new SlateManuscriptExportServiceError(500, "Export manifest is corrupt.");
  }
  const format = storedFormat(value.format);
  const scope = storedResolvedScope(value.scope);
  if (
    value.schemaVersion !== SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION ||
    value.projectId !== row.project_id ||
    value.exportedAt !== row.created_at ||
    format !== row.format ||
    JSON.stringify(scope) !== JSON.stringify(storedScope) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 180 ||
    !Number.isSafeInteger(value.payloadByteLength) ||
    Number(value.payloadByteLength) < 0 ||
    !Array.isArray(value.sourceRevisions)
  ) {
    throw new SlateManuscriptExportServiceError(500, "Export manifest is corrupt.");
  }
  if (value.sourceRevisions.length > 20_000) {
    throw new SlateManuscriptExportServiceError(500, "Export manifest is corrupt.");
  }
  const sourceRevisions = value.sourceRevisions.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.sectionId !== "string" ||
      !item.sectionId ||
      !Number.isSafeInteger(item.revision) ||
      Number(item.revision) < 0
    ) {
      throw new SlateManuscriptExportServiceError(500, "Export manifest is corrupt.");
    }
    return {
      sectionId: item.sectionId,
      revision: Number(item.revision),
      contentSha256: storedHash(item.contentSha256, "Export source checksum"),
    };
  });
  return {
    schemaVersion: SLATE_MANUSCRIPT_EXPORT_SCHEMA_VERSION,
    projectId: row.project_id,
    title: value.title,
    scope,
    format,
    exportedAt: row.created_at,
    sourceRevisions,
    payloadByteLength: Number(value.payloadByteLength),
    payloadSha256: storedHash(value.payloadSha256, "Export payload checksum"),
    manifestSha256: storedHash(value.manifestSha256, "Export manifest checksum"),
  };
}

function historyLimit(value: number | undefined): number {
  if (value === undefined) return EXPORT_HISTORY_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > EXPORT_HISTORY_MAX_LIMIT) {
    return requestError(
      `Export history limit must be between 1 and ${EXPORT_HISTORY_MAX_LIMIT}.`,
    );
  }
  return value;
}

export function listSlateManuscriptExportHistory(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  limit?: number,
): SlateManuscriptExportHistoryEntry[] {
  projectRow(db, userId, projectId);
  const rows = db
    .prepare(
      `SELECT id, project_id, scope_json, format, filename, manifest_json, created_at
         FROM slate_manuscript_exports
        WHERE user_id = ? AND project_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(userId, projectId, historyLimit(limit)) as unknown as ExportHistoryRow[];
  return rows.map((row) => {
    if (!/^[a-z0-9][a-z0-9._-]{0,159}$/u.test(row.filename)) {
      throw new SlateManuscriptExportServiceError(500, "Export filename is corrupt.");
    }
    const scope = storedResolvedScope(parsedJson(row.scope_json, "Export scope"));
    return {
      id: row.id,
      projectId: row.project_id,
      filename: row.filename,
      createdAt: row.created_at,
      manifest: storedManifest(row, scope),
    };
  });
}
