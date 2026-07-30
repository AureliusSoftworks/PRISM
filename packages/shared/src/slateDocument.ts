export const SLATE_SECTION_DOCUMENT_SCHEMA =
  "prism-slate-section-document-v1" as const;
export const SLATE_SECTION_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const SLATE_SCENE_BREAK_PLAIN_TEXT = "***" as const;

export type SlateDocumentAttributeValue =
  | string
  | number
  | boolean
  | null
  | SlateDocumentAttributeValue[]
  | { [key: string]: SlateDocumentAttributeValue };

export type SlateDocumentAttributesV1 = Record<
  string,
  SlateDocumentAttributeValue
>;

export interface SlateDocumentMarkV1 {
  type: string;
  attrs?: SlateDocumentAttributesV1;
}

/**
 * JSON-safe TipTap/ProseMirror node. Slate owns a deliberately open node
 * contract so editor extensions can add attrs without invalidating stored
 * manuscripts.
 */
export interface SlateDocumentNodeV1 {
  type: string;
  attrs?: SlateDocumentAttributesV1;
  content?: SlateDocumentNodeV1[];
  marks?: SlateDocumentMarkV1[];
  text?: string;
}

/** Every persisted manuscript block carries an editor-stable identity. */
export interface SlateDocumentBlockV1 extends SlateDocumentNodeV1 {
  attrs: SlateDocumentAttributesV1 & {
    blockId: string;
    /**
     * Exact separator inherited from legacy prose. New editor-authored blocks
     * normally omit it and project with the conventional double newline.
     */
    trailingSeparator?: string;
  };
}

/** The authoritative rich document for one focused Slate section. */
export interface SlateSectionDocumentV1 {
  schema: typeof SLATE_SECTION_DOCUMENT_SCHEMA;
  version: typeof SLATE_SECTION_DOCUMENT_SCHEMA_VERSION;
  type: "doc";
  content: SlateDocumentBlockV1[];
}

export interface SlateDocumentPosition {
  blockId: string;
  /** UTF-16 offset inside the block's deterministic plain-text projection. */
  offset: number;
  affinity: "backward" | "forward";
}

/**
 * Source-revision offsets remain mandatory for archive compatibility while
 * block positions keep new selections resilient to edits in nearby blocks.
 */
export interface SlateDocumentAnchor {
  sourceId: string;
  sectionId: string | null;
  sectionRevision: number | null;
  start: number;
  end: number;
  startPosition: SlateDocumentPosition | null;
  endPosition: SlateDocumentPosition | null;
  quoteHash: string;
}

export type SlateDocumentAnnotationKind = "comment" | "note";
export type SlateDocumentAnnotationStatus = "open" | "resolved";

export interface SlateDocumentAnnotationV1 {
  schemaVersion: typeof SLATE_SECTION_DOCUMENT_SCHEMA_VERSION;
  id: string;
  sectionId: string;
  kind: SlateDocumentAnnotationKind;
  anchor: SlateDocumentAnchor;
  body: string;
  status: SlateDocumentAnnotationStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SlateSectionDocumentHashes {
  documentHash: string;
  proseHash: string;
  prose: string;
}

export interface SlateSectionDocumentSnapshotV1
  extends SlateSectionDocumentHashes {
  sectionId: string;
  sectionRevision: number;
  document: SlateSectionDocumentV1;
}

export interface SlateSectionDocumentValidationResult {
  ok: boolean;
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function blockIdFor(node: SlateDocumentNodeV1): string {
  const value = node.attrs?.blockId;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validates only Slate's persistence invariants. TipTap remains responsible
 * for validating extension-specific node and mark schemas.
 */
export function validateSlateSectionDocumentV1(
  value: unknown,
): SlateSectionDocumentValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: ["document must be an object"] };
  }
  if (
    value.schema !== SLATE_SECTION_DOCUMENT_SCHEMA ||
    value.version !== SLATE_SECTION_DOCUMENT_SCHEMA_VERSION
  ) {
    issues.push("unsupported Slate section document schema");
  }
  if (value.type !== "doc") issues.push('document type must be "doc"');
  if (!Array.isArray(value.content)) {
    issues.push("document content must be an array");
    return { ok: false, issues };
  }

  const seenBlockIds = new Set<string>();
  value.content.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.type !== "string") {
      issues.push(`block ${index} must be a typed node`);
      return;
    }
    const node = candidate as unknown as SlateDocumentNodeV1;
    const blockId = blockIdFor(node);
    if (!blockId) {
      issues.push(`block ${index} is missing attrs.blockId`);
    } else if (seenBlockIds.has(blockId)) {
      issues.push(`duplicate block id: ${blockId}`);
    } else {
      seenBlockIds.add(blockId);
    }
    if (node.text !== undefined && typeof node.text !== "string") {
      issues.push(`block ${index} has invalid text`);
    }
    if (node.content !== undefined && !Array.isArray(node.content)) {
      issues.push(`block ${index} has invalid content`);
    }
  });
  return { ok: issues.length === 0, issues };
}

export function isSlateSectionDocumentV1(
  value: unknown,
): value is SlateSectionDocumentV1 {
  return validateSlateSectionDocumentV1(value).ok;
}

function projectInlineNode(node: SlateDocumentNodeV1): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (
    node.type === "sceneBreak" ||
    node.type === "scene_break" ||
    node.type === "horizontalRule"
  ) {
    const label = node.attrs?.label;
    return typeof label === "string" && label
      ? label
      : SLATE_SCENE_BREAK_PLAIN_TEXT;
  }
  return (node.content ?? []).map(projectInlineNode).join("");
}

function projectBlockNode(node: SlateDocumentNodeV1): string {
  if (
    node.type === "sceneBreak" ||
    node.type === "scene_break" ||
    node.type === "horizontalRule"
  ) {
    const label = node.attrs?.label;
    return typeof label === "string" && label
      ? label
      : SLATE_SCENE_BREAK_PLAIN_TEXT;
  }
  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((item) => `- ${projectBlockNode(item)}`)
      .join("\n");
  }
  if (node.type === "orderedList") {
    const startValue = node.attrs?.start;
    const start =
      typeof startValue === "number" && Number.isInteger(startValue)
        ? startValue
        : 1;
    return (node.content ?? [])
      .map((item, index) => `${start + index}. ${projectBlockNode(item)}`)
      .join("\n");
  }
  if (node.type === "listItem" || node.type === "blockquote") {
    return (node.content ?? []).map(projectBlockNode).join("\n\n");
  }
  return (node.content ?? []).map(projectInlineNode).join("");
}

/**
 * Produces the only plain-text projection used by prompts, Continuity, search,
 * and clean exports. Marks, comments, and formatting attrs are intentionally
 * absent, so formatting-only edits cannot look like prose changes.
 */
export function slateSectionDocumentToPlainText(
  document: SlateSectionDocumentV1,
): string {
  return document.content
    .map((block, index) => {
      const separator = block.attrs.trailingSeparator;
      return `${projectBlockNode(block)}${
        typeof separator === "string"
          ? separator
          : index === document.content.length - 1
            ? ""
            : "\n\n"
      }`;
    })
    .join("");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Slate document JSON cannot contain non-finite numbers");
    }
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Slate document must contain only JSON-safe values");
}

const SHA256_ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
  0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
  0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
  0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Portable synchronous SHA-256 keeps hashes identical in Node, browsers, and
 * local archive tools without introducing a runtime crypto dependency.
 */
export function slateSha256(value: string): string {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f,
    0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const left = schedule[index - 15] ?? 0;
      const right = schedule[index - 2] ?? 0;
      const sigma0 =
        rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 =
        rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      schedule[index] =
        ((schedule[index - 16] ?? 0) +
          sigma0 +
          (schedule[index - 7] ?? 0) +
          sigma1) >>>
        0;
    }

    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;

    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 =
        (h +
          sum1 +
          choose +
          (SHA256_ROUND_CONSTANTS[index] ?? 0) +
          (schedule[index] ?? 0)) >>>
        0;
      const sum0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = ((state[0] ?? 0) + a) >>> 0;
    state[1] = ((state[1] ?? 0) + b) >>> 0;
    state[2] = ((state[2] ?? 0) + c) >>> 0;
    state[3] = ((state[3] ?? 0) + d) >>> 0;
    state[4] = ((state[4] ?? 0) + e) >>> 0;
    state[5] = ((state[5] ?? 0) + f) >>> 0;
    state[6] = ((state[6] ?? 0) + g) >>> 0;
    state[7] = ((state[7] ?? 0) + h) >>> 0;
  }

  return Array.from(state)
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

export function hashSlateSectionDocumentV1(
  document: SlateSectionDocumentV1,
): SlateSectionDocumentHashes {
  const validation = validateSlateSectionDocumentV1(document);
  if (!validation.ok) {
    throw new TypeError(validation.issues.join("; "));
  }
  const prose = slateSectionDocumentToPlainText(document);
  return {
    documentHash: slateSha256(canonicalJson(document)),
    proseHash: slateSha256(prose),
    prose,
  };
}
