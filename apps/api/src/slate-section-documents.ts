import type { DatabaseSync } from "node:sqlite";
import {
  SLATE_SECTION_DOCUMENT_SCHEMA,
  hashSlateSectionDocumentV1,
  slateSectionDocumentToPlainText,
  slateSha256,
  validateSlateSectionDocumentV1,
  type SlateDocumentAnchor,
  type SlateDocumentBlockV1,
  type SlateDocumentNodeV1,
  type SlateSectionDocumentV1,
} from "@localai/shared";
import { randomId } from "./security.ts";

export { SLATE_SECTION_DOCUMENT_SCHEMA } from "@localai/shared";
export type { SlateSectionDocumentV1 } from "@localai/shared";
const MAX_DOCUMENT_JSON_LENGTH = 8_000_000;
const MAX_DOCUMENT_DEPTH = 48;
const MAX_DOCUMENT_NODES = 200_000;

interface SlateDocumentTextNode extends SlateDocumentNodeV1 {
  type: "text";
  text: string;
}

type SlateDocumentBlockNode = SlateDocumentBlockV1;
type SlateDocumentNode = SlateDocumentNodeV1;

export interface SlateSectionDocumentSnapshot {
  document: SlateSectionDocumentV1;
  documentHash: string;
  prose: string;
  proseHash: string;
  sectionRevision: number;
}

export interface SlateSectionAnnotation {
  id: string;
  projectId: string;
  sectionId: string;
  blockId: string;
  anchor: SlateDocumentAnchor;
  kind: "comment" | "note";
  body: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredDocumentRow {
  section_revision: number;
  document_json: string;
  document_hash: string;
  prose_hash: string;
}

function blockId(sectionId: string, ordinal: number, value: string): string {
  return `block-${slateSha256(
    `${SLATE_SECTION_DOCUMENT_SCHEMA}\0${sectionId}\0${ordinal}\0${value}`,
  ).slice(0, 24)}`;
}

function exactProseBlocks(prose: string): Array<{
  text: string;
  trailingSeparator: string;
}> {
  if (!prose) return [];
  const blocks: Array<{ text: string; trailingSeparator: string }> = [];
  let offset = 0;
  const separator = /\n{2,}/gu;
  for (const match of prose.matchAll(separator)) {
    const index = match.index;
    blocks.push({
      text: prose.slice(offset, index),
      trailingSeparator: match[0],
    });
    offset = index + match[0].length;
  }
  blocks.push({ text: prose.slice(offset), trailingSeparator: "" });
  return blocks;
}

function textContent(value: string): SlateDocumentTextNode[] | undefined {
  return value ? [{ type: "text", text: value }] : undefined;
}

/** Creates a deterministic, byte-preserving first rich document from legacy prose. */
export function createSlateSectionDocumentV1(
  sectionId: string,
  prose: string,
  previous?: SlateSectionDocumentV1 | null,
): SlateSectionDocumentV1 {
  const prior = previous?.content ?? [];
  return {
    schema: SLATE_SECTION_DOCUMENT_SCHEMA,
    version: 1,
    type: "doc",
    content: exactProseBlocks(prose).map((block, ordinal) => ({
      type: "paragraph",
      attrs: {
        blockId:
          typeof prior[ordinal]?.attrs?.blockId === "string" &&
          prior[ordinal]!.attrs.blockId.trim()
            ? prior[ordinal]!.attrs.blockId
            : blockId(sectionId, ordinal, block.text),
        trailingSeparator: block.trailingSeparator,
      },
      ...(textContent(block.text) ? { content: textContent(block.text) } : {}),
    })),
  };
}

function assertDocumentShape(value: unknown): asserts value is SlateSectionDocumentV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Slate section document must be an object.");
  }
  const document = value as Record<string, unknown>;
  if (
    document.type !== "doc" ||
    document.version !== 1 ||
    (document.schema !== undefined &&
      document.schema !== SLATE_SECTION_DOCUMENT_SCHEMA) ||
    !Array.isArray(document.content)
  ) {
    throw new Error("Slate section document schema is invalid.");
  }
}

function validateNode(
  value: unknown,
  state: { count: number },
  depth: number,
  topLevel: boolean,
): SlateDocumentNode {
  if (depth > MAX_DOCUMENT_DEPTH) {
    throw new Error("Slate section document is nested too deeply.");
  }
  state.count += 1;
  if (state.count > MAX_DOCUMENT_NODES) {
    throw new Error("Slate section document has too many nodes.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Slate section document contains an invalid node.");
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.type !== "string" || !raw.type.trim()) {
    throw new Error("Slate section document node type is invalid.");
  }
  const node: Record<string, unknown> = { type: raw.type };
  if (typeof raw.text === "string") node.text = raw.text;
  if (raw.marks !== undefined) {
    if (!Array.isArray(raw.marks)) {
      throw new Error("Slate section document marks are invalid.");
    }
    node.marks = structuredClone(raw.marks);
  }
  if (raw.attrs !== undefined) {
    if (!raw.attrs || typeof raw.attrs !== "object" || Array.isArray(raw.attrs)) {
      throw new Error("Slate section document node attributes are invalid.");
    }
    node.attrs = structuredClone(raw.attrs);
  }
  if (topLevel) {
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    if (typeof attrs.blockId !== "string" || !attrs.blockId.trim()) {
      throw new Error("Every Slate document block needs a stable blockId.");
    }
    if (
      attrs.trailingSeparator !== undefined &&
      typeof attrs.trailingSeparator !== "string"
    ) {
      throw new Error("Slate document block separators must be text.");
    }
    node.attrs = attrs;
  }
  if (raw.content !== undefined) {
    if (!Array.isArray(raw.content)) {
      throw new Error("Slate section document node content is invalid.");
    }
    node.content = raw.content.map((child) =>
      validateNode(child, state, depth + 1, false),
    );
  }
  return node as unknown as SlateDocumentNode;
}

export function normalizeSlateSectionDocument(
  value: unknown,
): SlateSectionDocumentV1 {
  assertDocumentShape(value);
  const state = { count: 0 };
  const document: SlateSectionDocumentV1 = {
    schema: SLATE_SECTION_DOCUMENT_SCHEMA,
    version: 1,
    type: "doc",
    content: value.content.map(
      (node) =>
        validateNode(node, state, 1, true) as SlateDocumentBlockNode,
    ),
  };
  const sharedValidation = validateSlateSectionDocumentV1(document);
  if (!sharedValidation.ok) {
    throw new Error(sharedValidation.issues.join("; "));
  }
  if (JSON.stringify(document).length > MAX_DOCUMENT_JSON_LENGTH) {
    throw new Error("Slate section document is too large.");
  }
  return document;
}

/** Deterministic projection used by Continuity, search, prompts, and exports. */
export function slateSectionDocumentPlainText(
  documentValue: SlateSectionDocumentV1,
): string {
  const document = normalizeSlateSectionDocument(documentValue);
  return slateSectionDocumentToPlainText(document);
}

export function slateSectionDocumentSnapshot(
  documentValue: SlateSectionDocumentV1,
  sectionRevision: number,
): SlateSectionDocumentSnapshot {
  const document = normalizeSlateSectionDocument(documentValue);
  const hashes = hashSlateSectionDocumentV1(document);
  return {
    document,
    documentHash: hashes.documentHash,
    prose: hashes.prose,
    proseHash: hashes.proseHash,
    sectionRevision,
  };
}

export function persistSlateSectionDocumentWithinTransaction(
  db: DatabaseSync,
  input: {
    userId: string;
    projectId: string;
    sectionId: string;
    sectionRevision: number;
    document: SlateSectionDocumentV1;
    now: string;
  },
): SlateSectionDocumentSnapshot {
  const snapshot = slateSectionDocumentSnapshot(
    input.document,
    input.sectionRevision,
  );
  db.prepare(
    `INSERT INTO slate_section_documents
      (section_id, user_id, project_id, schema_version, section_revision,
       document_json, document_hash, prose_hash, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(section_id) DO UPDATE SET
       section_revision = excluded.section_revision,
       document_json = excluded.document_json,
       document_hash = excluded.document_hash,
       prose_hash = excluded.prose_hash,
       updated_at = excluded.updated_at
     WHERE slate_section_documents.user_id = excluded.user_id
       AND slate_section_documents.project_id = excluded.project_id`,
  ).run(
    input.sectionId,
    input.userId,
    input.projectId,
    input.sectionRevision,
    JSON.stringify(snapshot.document),
    snapshot.documentHash,
    snapshot.proseHash,
    input.now,
    input.now,
  );
  return snapshot;
}

/**
 * Lazily creates an exact rich-document checkpoint for legacy section prose.
 * The legacy prose remains untouched and authoritative until the upsert commits.
 */
export function ensureSlateSectionDocument(
  db: DatabaseSync,
  input: {
    userId: string;
    projectId: string;
    sectionId: string;
  },
): SlateSectionDocumentSnapshot {
  const section = db
    .prepare(
      `SELECT revision, prose FROM slate_sections
        WHERE id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(input.sectionId, input.projectId, input.userId) as
    | { revision: number; prose: string }
    | undefined;
  if (!section) throw new Error("Slate section not found.");
  const stored = db
    .prepare(
      `SELECT section_revision, document_json, document_hash, prose_hash
         FROM slate_section_documents
        WHERE section_id = ? AND project_id = ? AND user_id = ?`,
    )
    .get(input.sectionId, input.projectId, input.userId) as
    | StoredDocumentRow
    | undefined;
  if (stored) {
    try {
      const document = normalizeSlateSectionDocument(
        JSON.parse(stored.document_json) as unknown,
      );
      const snapshot = slateSectionDocumentSnapshot(
        document,
        Number(stored.section_revision),
      );
      if (
        stored.document_hash === snapshot.documentHash &&
        stored.prose_hash === snapshot.proseHash &&
        snapshot.prose === section.prose &&
        Number(stored.section_revision) === Number(section.revision)
      ) {
        return snapshot;
      }
    } catch {
      // Regenerate below from the exact authoritative prose.
    }
  }
  const previous = stored
    ? (() => {
        try {
          return normalizeSlateSectionDocument(
            JSON.parse(stored.document_json) as unknown,
          );
        } catch {
          return null;
        }
      })()
    : null;
  const document = createSlateSectionDocumentV1(
    input.sectionId,
    section.prose,
    previous,
  );
  const now = new Date().toISOString();
  return persistSlateSectionDocumentWithinTransaction(db, {
    ...input,
    sectionRevision: Number(section.revision),
    document,
    now,
  });
}

function annotationFromRow(row: {
  id: string;
  project_id: string;
  section_id: string;
  block_id: string;
  anchor_json: string;
  kind: string;
  body: string;
  resolved: number;
  created_at: string;
  updated_at: string;
}): SlateSectionAnnotation {
  let anchor = {} as SlateDocumentAnchor;
  try {
    const parsed = JSON.parse(row.anchor_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      anchor = parsed as unknown as SlateDocumentAnchor;
    }
  } catch {
    // Preserve a readable empty anchor if a legacy row is malformed.
  }
  return {
    id: row.id,
    projectId: row.project_id,
    sectionId: row.section_id,
    blockId: row.block_id,
    anchor,
    kind: row.kind === "comment" ? "comment" : "note",
    body: row.body,
    resolved: row.resolved === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function annotationText(
  value: unknown,
  label: string,
  maximum: number,
  required = true,
): string {
  if (typeof value !== "string") {
    if (required) throw new Error(`${label} is required.`);
    return "";
  }
  const text = value.normalize("NFKC").trim();
  if (required && !text) throw new Error(`${label} is required.`);
  if (text.length > maximum) throw new Error(`${label} is too long.`);
  return text;
}

function assertSectionBlock(
  snapshot: SlateSectionDocumentSnapshot,
  blockIdValue: unknown,
): string {
  const blockIdValueText = annotationText(
    blockIdValue,
    "Annotation block id",
    180,
  );
  if (
    !snapshot.document.content.some(
      (block) => block.attrs.blockId === blockIdValueText,
    )
  ) {
    throw new Error("Annotation block was not found in the current section.");
  }
  return blockIdValueText;
}

function normalizeAnnotationAnchor(
  value: unknown,
  sectionId: string,
  blockIdValue: string,
  sectionRevision: number,
  fallbackSourceId: string,
): SlateDocumentAnchor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Annotation anchor must be an object.");
  }
  const anchor = value as Record<string, unknown>;
  const sourceId =
    typeof anchor.sourceId === "string" && anchor.sourceId.trim()
      ? annotationText(anchor.sourceId, "Annotation source id", 240)
      : fallbackSourceId;
  const anchorSectionId =
    anchor.sectionId === null
      ? null
      : annotationText(anchor.sectionId, "Annotation section id", 240);
  if (anchorSectionId !== sectionId) {
    throw new Error("Annotation anchor belongs to another section.");
  }
  const anchorRevision = Number(anchor.sectionRevision);
  if (
    !Number.isInteger(anchorRevision) ||
    anchorRevision < 0 ||
    anchorRevision !== sectionRevision
  ) {
    throw new Error("Annotation anchor is stale for this section revision.");
  }
  const start = Number(anchor.start);
  const end = Number(anchor.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error("Annotation source offsets are invalid.");
  }
  const position = (
    raw: unknown,
    label: string,
  ): SlateDocumentAnchor["startPosition"] => {
    if (raw === null) return null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`${label} is invalid.`);
    }
    const record = raw as Record<string, unknown>;
    const positionBlockId = annotationText(
      record.blockId,
      `${label} block id`,
      180,
    );
    const offset = Number(record.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error(`${label} offset is invalid.`);
    }
    return {
      blockId: positionBlockId,
      offset,
      affinity: record.affinity === "backward" ? "backward" : "forward",
    };
  };
  const startPosition = position(anchor.startPosition, "Annotation start position");
  const endPosition = position(anchor.endPosition, "Annotation end position");
  if (startPosition && startPosition.blockId !== blockIdValue) {
    throw new Error("Annotation block id must match its start position.");
  }
  return {
    sourceId,
    sectionId: anchorSectionId,
    sectionRevision: anchorRevision,
    start,
    end,
    startPosition,
    endPosition,
    quoteHash: annotationText(anchor.quoteHash, "Annotation quote hash", 160),
  };
}

export function listSlateSectionAnnotations(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
): SlateSectionAnnotation[] {
  ensureSlateSectionDocument(db, { userId, projectId, sectionId });
  return (
    db
      .prepare(
        `SELECT id, project_id, section_id, block_id, anchor_json, kind, body,
                resolved, created_at, updated_at
           FROM slate_section_annotations
          WHERE user_id = ? AND project_id = ? AND section_id = ?
          ORDER BY resolved ASC, created_at ASC, id ASC`,
      )
      .all(userId, projectId, sectionId) as Array<{
      id: string;
      project_id: string;
      section_id: string;
      block_id: string;
      anchor_json: string;
      kind: string;
      body: string;
      resolved: number;
      created_at: string;
      updated_at: string;
    }>
  ).map(annotationFromRow);
}

export function createSlateSectionAnnotation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
  input: Record<string, unknown>,
): SlateSectionAnnotation {
  const idempotencyKey = annotationText(
    input.idempotencyKey,
    "Annotation idempotency key",
    240,
  );
  const existing = db
    .prepare(
      `SELECT id, project_id, section_id, block_id, anchor_json, kind, body,
              resolved, created_at, updated_at
         FROM slate_section_annotations
        WHERE user_id = ? AND project_id = ? AND idempotency_key = ?`,
    )
    .get(userId, projectId, idempotencyKey) as
    | Parameters<typeof annotationFromRow>[0]
    | undefined;
  if (existing) {
    if (existing.section_id !== sectionId) {
      throw new Error("Annotation idempotency key belongs to another section.");
    }
    return annotationFromRow(existing);
  }
  const document = ensureSlateSectionDocument(db, {
    userId,
    projectId,
    sectionId,
  });
  const blockIdValue = assertSectionBlock(document, input.blockId);
  const source = db
    .prepare(
      `SELECT id FROM slate_continuity_sources
        WHERE user_id = ? AND project_id = ? AND section_id = ?
          AND source_revision = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
    )
    .get(userId, projectId, sectionId, document.sectionRevision) as
    | { id: string }
    | undefined;
  const anchor = normalizeAnnotationAnchor(
    input.anchor,
    sectionId,
    blockIdValue,
    document.sectionRevision,
    source?.id ?? `document:${sectionId}:revision:${document.sectionRevision}`,
  );
  const kind = input.kind === "comment" ? "comment" : input.kind === "note" ? "note" : null;
  if (!kind) throw new Error("Annotation kind must be comment or note.");
  const body = annotationText(input.body, "Annotation body", 32_000, false);
  const now = new Date().toISOString();
  const id = randomId();
  db.prepare(
    `INSERT INTO slate_section_annotations
      (id, user_id, project_id, section_id, block_id, anchor_json, kind, body,
       resolved, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    id,
    userId,
    projectId,
    sectionId,
    blockIdValue,
    JSON.stringify(anchor),
    kind,
    body,
    idempotencyKey,
    now,
    now,
  );
  return listSlateSectionAnnotations(db, userId, projectId, sectionId).find(
    (annotation) => annotation.id === id,
  )!;
}

export function updateSlateSectionAnnotation(
  db: DatabaseSync,
  userId: string,
  projectId: string,
  sectionId: string,
  annotationId: string,
  input: Record<string, unknown>,
): SlateSectionAnnotation {
  annotationText(
    input.idempotencyKey,
    "Annotation idempotency key",
    240,
  );
  const current = db
    .prepare(
      `SELECT id, project_id, section_id, block_id, anchor_json, kind, body,
              resolved, created_at, updated_at
         FROM slate_section_annotations
        WHERE id = ? AND user_id = ? AND project_id = ? AND section_id = ?`,
    )
    .get(annotationId, userId, projectId, sectionId) as
    | Parameters<typeof annotationFromRow>[0]
    | undefined;
  if (!current) throw new Error("Slate section annotation not found.");
  const body = Object.hasOwn(input, "body")
    ? annotationText(input.body, "Annotation body", 32_000, false)
    : current.body;
  const resolved = Object.hasOwn(input, "resolved")
    ? input.resolved === true
    : current.resolved === 1;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE slate_section_annotations
        SET body = ?, resolved = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND project_id = ? AND section_id = ?`,
  ).run(
    body,
    resolved ? 1 : 0,
    now,
    annotationId,
    userId,
    projectId,
    sectionId,
  );
  return annotationFromRow({ ...current, body, resolved: resolved ? 1 : 0, updated_at: now });
}
