export const SLATE_SECTION_DOCUMENT_SCHEMA =
  "prism-slate-section-document-v1" as const;
export const SLATE_SECTION_DOCUMENT_SCHEMA_VERSION = 1 as const;

export interface SlateDocumentNodeV1 {
  type: string;
  attrs?: Record<string, unknown>;
  content?: SlateDocumentNodeV1[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface SlateDocumentBlockV1 extends SlateDocumentNodeV1 {
  attrs: Record<string, unknown> & {
    blockId: string;
    trailingSeparator?: string;
  };
}

export interface SlateSectionDocumentV1 {
  schema: typeof SLATE_SECTION_DOCUMENT_SCHEMA;
  version: typeof SLATE_SECTION_DOCUMENT_SCHEMA_VERSION;
  type: "doc";
  content: SlateDocumentBlockV1[];
}

export interface SlateDocumentPosition {
  blockId: string;
  offset: number;
  affinity: "backward" | "forward";
}

export interface SlateDocumentAnchor {
  sourceId: string;
  sectionId: string;
  sectionRevision: number;
  start: number;
  end: number;
  startPosition: SlateDocumentPosition | null;
  endPosition: SlateDocumentPosition | null;
  quoteHash: string;
}

export interface SlateDocumentAnnotationV1 {
  schemaVersion: 1;
  id: string;
  sectionId: string;
  kind: "comment" | "note";
  anchor: SlateDocumentAnchor;
  body: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export type {
  SlateDocumentNodeV1 as SlateTiptapNode,
  SlateSectionDocumentV1 as SlateTiptapDocument,
};

export type SlateDirectorScope = "beat" | "passage" | "scene";

function paragraphContentForPlainText(value: string): SlateDocumentNodeV1[] {
  if (!value) return [];
  const content: SlateDocumentNodeV1[] = [];
  const lines = value.split("\n");
  lines.forEach((line, index) => {
    if (line) content.push({ type: "text", text: line });
    if (index < lines.length - 1) content.push({ type: "hardBreak" });
  });
  return content;
}

function stableLegacyBlockId(
  sectionId: string,
  ordinal: number,
  text: string,
): string {
  let hash = 2_166_136_261;
  for (const character of `${sectionId}:${ordinal}:${text}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `slate-block-${ordinal}-${(hash >>> 0).toString(36)}`;
}

function exactPlainTextBlocks(
  prose: string,
): Array<{ text: string; trailingSeparator: string }> {
  if (!prose) return [{ text: "", trailingSeparator: "" }];
  const blocks: Array<{ text: string; trailingSeparator: string }> = [];
  let offset = 0;
  for (const match of prose.matchAll(/\n{2,}/gu)) {
    blocks.push({
      text: prose.slice(offset, match.index),
      trailingSeparator: match[0],
    });
    offset = match.index + match[0].length;
  }
  blocks.push({ text: prose.slice(offset), trailingSeparator: "" });
  return blocks;
}

/** Narrow compatibility seam for legacy prose-only section responses. */
export function slatePlainTextToTiptapDocument(
  value: string,
  sectionId = "legacy-section",
  previous?: SlateSectionDocumentV1 | null,
): SlateSectionDocumentV1 {
  return {
    schema: SLATE_SECTION_DOCUMENT_SCHEMA,
    version: SLATE_SECTION_DOCUMENT_SCHEMA_VERSION,
    type: "doc",
    content: exactPlainTextBlocks(value).map((block, ordinal) => {
      const previousBlock = previous?.content[ordinal];
      const attrs = {
        blockId:
          typeof previousBlock?.attrs.blockId === "string" &&
          previousBlock.attrs.blockId
            ? previousBlock.attrs.blockId
            : stableLegacyBlockId(sectionId, ordinal, block.text),
        trailingSeparator: block.trailingSeparator,
      };
      return block.text === "***"
        ? { type: "horizontalRule", attrs }
        : {
            type: "paragraph",
            attrs,
            content: paragraphContentForPlainText(block.text),
          };
    }),
  };
}

function recordAttributes(
  value: unknown,
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      ["string", "number", "boolean"].includes(typeof item) || item === null,
    ),
  ) as Record<string, string | number | boolean | null>;
}

export function slateTiptapJsonToSectionDocument(
  document: {
    type?: string;
    content?: SlateDocumentNodeV1[];
  },
  sectionId: string,
  previous?: SlateSectionDocumentV1 | null,
): SlateSectionDocumentV1 {
  const usedBlockIds = new Set<string>();
  const content = (document.content ?? []).map((node, ordinal) => {
    const rawAttrs = recordAttributes(node.attrs);
    const previousId = previous?.content[ordinal]?.attrs.blockId;
    const requestedId =
      typeof rawAttrs.blockId === "string" && rawAttrs.blockId.trim()
        ? rawAttrs.blockId
        : typeof previousId === "string" && previousId.trim()
          ? previousId
          : stableLegacyBlockId(
              sectionId,
              ordinal,
              node.text ?? node.type,
            );
    const blockId = usedBlockIds.has(requestedId)
      ? stableLegacyBlockId(
          sectionId,
          ordinal,
          `${requestedId}:${node.text ?? node.type}`,
        )
      : requestedId;
    usedBlockIds.add(blockId);
    const existingSeparator = rawAttrs.trailingSeparator;
    const trailingSeparator =
      ordinal === (document.content?.length ?? 0) - 1
        ? ""
        : typeof existingSeparator === "string" && existingSeparator.length > 0
          ? existingSeparator
          : "\n\n";
    return {
      ...node,
      attrs: {
        ...rawAttrs,
        blockId,
        trailingSeparator,
      },
    } as SlateDocumentBlockV1;
  });
  return {
    schema: SLATE_SECTION_DOCUMENT_SCHEMA,
    version: SLATE_SECTION_DOCUMENT_SCHEMA_VERSION,
    type: "doc",
    content:
      content.length > 0
        ? content
        : slatePlainTextToTiptapDocument("", sectionId, previous).content,
  };
}

export function slateTiptapDocumentToPlainText(
  document: SlateSectionDocumentV1,
): string {
  return document.content
    .map((block, index) => {
      const separator = block.attrs.trailingSeparator;
      return `${blockPlainText(block)}${
        typeof separator === "string"
          ? separator
          : index === document.content.length - 1
            ? ""
            : "\n\n"
      }`;
    })
    .join("");
}

function inlinePlainText(node: SlateDocumentNodeV1): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (
    node.type === "horizontalRule" ||
    node.type === "sceneBreak" ||
    node.type === "scene_break"
  ) {
    return "***";
  }
  return (node.content ?? []).map(inlinePlainText).join("");
}

function blockPlainText(node: SlateDocumentNodeV1): string {
  if (
    node.type === "horizontalRule" ||
    node.type === "sceneBreak" ||
    node.type === "scene_break"
  ) {
    return "***";
  }
  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((item) => `- ${blockPlainText(item)}`)
      .join("\n");
  }
  if (node.type === "orderedList") {
    const start =
      typeof node.attrs?.start === "number" ? node.attrs.start : 1;
    return (node.content ?? [])
      .map((item, index) => `${start + index}. ${blockPlainText(item)}`)
      .join("\n");
  }
  if (node.type === "listItem" || node.type === "blockquote") {
    return (node.content ?? []).map(blockPlainText).join("\n\n");
  }
  return inlinePlainText(node);
}

export function slateWordCount(value: string): number {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

export function slateInferredDirectorScope(
  direction: string,
  fallback: SlateDirectorScope,
): SlateDirectorScope {
  const normalized = direction.toLowerCase();
  if (
    /\b(?:scene|chapter|sequence|arrival|departure|confrontation)\b/u.test(
      normalized,
    )
  ) {
    return "scene";
  }
  if (
    /\b(?:passage|paragraph|selection|rewrite|tighten|voice|description)\b/u.test(
      normalized,
    )
  ) {
    return "passage";
  }
  if (
    /\b(?:beat|moment|gesture|line|reaction|exchange|turn)\b/u.test(normalized)
  ) {
    return "beat";
  }
  return fallback;
}

export function slateDirectorWordTarget(scope: SlateDirectorScope): number {
  if (scope === "beat") return 180;
  if (scope === "passage") return 500;
  return 1_200;
}
