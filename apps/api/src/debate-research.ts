import { createHash } from "node:crypto";
import {
  DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT,
  type DebateEvidenceSourceV1,
  type WebSearchResult,
} from "@localai/shared";
import { recordDeveloperTranscriptEvent } from "./usage.ts";

const CROSSREF_WORKS_URL = "https://api.crossref.org/works";
const SEARCH_QUERY_MAX_LENGTH = 500;
const SOURCE_TITLE_MAX_LENGTH = 200;
const SOURCE_SNIPPET_MAX_LENGTH = 800;
const EXCERPT_MATERIAL_MAX_LENGTH = 20_000;
const EXCERPT_MATERIAL_MAX_COUNT = 6;
const EXCERPT_TOTAL_MAX_LENGTH = 48_000;

export type DebateEvidenceExcerptSourceKind =
  | "provider"
  | "crossref"
  | "page"
  | "player"
  | "metadata";

export type DebateEvidenceExcerptSelectionKind =
  | "model"
  | "sentence-fallback"
  | "metadata-only"
  | "player";

export interface DebateEvidenceExcerptMaterial {
  id: string;
  kind: DebateEvidenceExcerptSourceKind;
  text: string;
}

export interface DebateEvidenceExcerptModelSelection {
  excerpt: string;
  provider: string;
  model: string;
}

export interface DebateEvidenceExcerptGenerationRequest {
  motion: string;
  instruction: string;
  materials: readonly DebateEvidenceExcerptMaterial[];
}

export interface GroundedDebateEvidenceExcerpt {
  excerpt: string;
  sourceKind: DebateEvidenceExcerptSourceKind;
  selection: DebateEvidenceExcerptSelectionKind;
  materialHash: string;
  model: { provider: string; model: string } | null;
}

export type DebateEvidenceExcerptGenerator = (
  request: DebateEvidenceExcerptGenerationRequest,
) => Promise<DebateEvidenceExcerptModelSelection | null>;

export type EnrichedDebateEvidenceSourceV1 = DebateEvidenceSourceV1 & {
  excerptSource?: DebateEvidenceExcerptSourceKind;
  excerptSelection?: DebateEvidenceExcerptSelectionKind;
  excerptMaterialHash?: string;
  excerptModel?: { provider: string; model: string } | null;
};

const EXCERPT_STOP_WORDS = new Set([
  "about",
  "after",
  "against",
  "because",
  "before",
  "being",
  "between",
  "could",
  "debate",
  "every",
  "from",
  "have",
  "into",
  "motion",
  "other",
  "should",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "under",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
]);

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function compactText(value: unknown, maxLength: number): string {
  if (Array.isArray(value)) {
    return compactText(
      value.filter((item) => typeof item === "string").join(" "),
      maxLength,
    );
  }
  if (typeof value !== "string") return "";
  const compacted = value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
  return compacted.length > maxLength
    ? compacted.slice(0, maxLength).trimEnd()
    : compacted;
}

function compactUnboundedText(value: unknown): string {
  if (Array.isArray(value)) {
    return compactUnboundedText(
      value.filter((item) => typeof item === "string").join(" "),
    );
  }
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function wordSafeBound(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const bounded = value.slice(0, maxLength + 1);
  const lastBoundary = Math.max(
    bounded.lastIndexOf(" ", maxLength),
    bounded.lastIndexOf("\n", maxLength),
  );
  return (lastBoundary > 0 ? bounded.slice(0, lastBoundary) : value.slice(0, maxLength))
    .trimEnd()
    .replace(/[,:;\-–—]+$/u, "")
    .trimEnd();
}

function sentenceCandidates(value: string): string[] {
  const compacted = compactUnboundedText(value);
  if (!compacted) return [];
  return (compacted.match(/[^.!?]+(?:[.!?]+(?:[”’"')\]]+)?(?=\s|$)|$)/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceIsComplete(value: string): boolean {
  return /[.!?](?:[”’"')\]]*)$/u.test(value.trim());
}

/**
 * Produces a bounded display excerpt without the old mid-word clipping.
 * Complete sentences are preferred; sentence-less provider metadata falls
 * back to a word boundary so the source remains reviewable.
 */
export function completeSentenceDebateEvidenceExcerpt(
  value: unknown,
  maxLength = SOURCE_SNIPPET_MAX_LENGTH,
): string {
  const compacted = compactUnboundedText(value);
  if (!compacted) return "";
  if (compacted.length <= maxLength) return compacted;
  const complete = sentenceCandidates(compacted).filter(sentenceIsComplete);
  let excerpt = "";
  for (const sentence of complete) {
    const candidate = excerpt ? `${excerpt} ${sentence}` : sentence;
    if (candidate.length > maxLength) break;
    excerpt = candidate;
  }
  return excerpt || wordSafeBound(compacted, maxLength);
}

function materialHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function boundedExcerptMaterials(
  materials: readonly DebateEvidenceExcerptMaterial[],
): DebateEvidenceExcerptMaterial[] {
  const bounded: DebateEvidenceExcerptMaterial[] = [];
  let remaining = EXCERPT_TOTAL_MAX_LENGTH;
  for (const material of materials.slice(0, EXCERPT_MATERIAL_MAX_COUNT)) {
    if (remaining <= 0) break;
    const text = wordSafeBound(
      compactUnboundedText(material.text),
      Math.min(EXCERPT_MATERIAL_MAX_LENGTH, remaining),
    );
    if (!text) continue;
    bounded.push({ id: material.id, kind: material.kind, text });
    remaining -= text.length;
  }
  return bounded;
}

function motionTerms(motion: string): Set<string> {
  return new Set(
    compactUnboundedText(motion)
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]{4,}/gu)
      ?.filter((term) => !EXCERPT_STOP_WORDS.has(term)) ?? [],
  );
}

function exactSentenceQuote(
  candidateRaw: string,
  materials: readonly DebateEvidenceExcerptMaterial[],
): { excerpt: string; material: DebateEvidenceExcerptMaterial } | null {
  const candidate = compactUnboundedText(candidateRaw);
  if (!candidate || candidate.length > SOURCE_SNIPPET_MAX_LENGTH) return null;
  for (const material of materials) {
    const sentences = sentenceCandidates(material.text);
    for (let index = 0; index < sentences.length; index += 1) {
      for (let count = 1; count <= 2 && index + count <= sentences.length; count += 1) {
        const excerpt = sentences.slice(index, index + count).join(" ");
        if (
          excerpt === candidate &&
          sentenceIsComplete(excerpt) &&
          material.text.includes(excerpt)
        ) {
          return { excerpt, material };
        }
      }
    }
  }
  return null;
}

function relevantSentenceFallback(
  motion: string,
  materials: readonly DebateEvidenceExcerptMaterial[],
): { excerpt: string; material: DebateEvidenceExcerptMaterial } {
  const terms = motionTerms(motion);
  const ranked = materials.flatMap((material, materialIndex) =>
    sentenceCandidates(material.text)
      .filter(
        (sentence) =>
          sentenceIsComplete(sentence) &&
          sentence.length <= SOURCE_SNIPPET_MAX_LENGTH,
      )
      .map((sentence, sentenceIndex) => {
        const sentenceTerms = motionTerms(sentence);
        const overlap = [...terms].filter((term) => sentenceTerms.has(term)).length;
        return { material, materialIndex, sentence, sentenceIndex, overlap };
      }),
  );
  ranked.sort(
    (left, right) =>
      right.overlap - left.overlap ||
      left.materialIndex - right.materialIndex ||
      left.sentenceIndex - right.sentenceIndex,
  );
  const best = ranked[0];
  if (best) return { excerpt: best.sentence, material: best.material };
  const material = materials[0]!;
  return {
    excerpt: completeSentenceDebateEvidenceExcerpt(material.text),
    material,
  };
}

/**
 * Validates a model suggestion against the bounded materials it saw. A model
 * can rank source prose, but it cannot rewrite it: only one or two exact,
 * contiguous source sentences are accepted. Any failure deterministically
 * falls back to the most motion-relevant complete sentence.
 */
export function selectGroundedDebateEvidenceExcerpt(args: {
  motion: string;
  materials: readonly DebateEvidenceExcerptMaterial[];
  modelSelection?: DebateEvidenceExcerptModelSelection | null;
}): GroundedDebateEvidenceExcerpt {
  const materials = boundedExcerptMaterials(args.materials);
  if (materials.length === 0) {
    return {
      excerpt: "",
      sourceKind: "player",
      selection: "player",
      materialHash: materialHash(""),
      model: null,
    };
  }
  const exact = args.modelSelection
    ? exactSentenceQuote(args.modelSelection.excerpt, materials)
    : null;
  if (exact && args.modelSelection) {
    return {
      excerpt: exact.excerpt,
      sourceKind: exact.material.kind,
      selection: "model",
      materialHash: materialHash(exact.material.text),
      model: {
        provider: args.modelSelection.provider,
        model: args.modelSelection.model,
      },
    };
  }
  const fallback = relevantSentenceFallback(args.motion, materials);
  const metadataOnly = fallback.material.kind === "metadata";
  return {
    excerpt: fallback.excerpt,
    sourceKind: fallback.material.kind,
    selection: metadataOnly ? "metadata-only" : "sentence-fallback",
    materialHash: materialHash(fallback.material.text),
    model: null,
  };
}

/**
 * Narrow orchestration seam for the Debate route. The caller owns lane
 * selection and privacy gating; omitting generate performs no model request.
 */
export async function enrichDebateEvidenceSourceExcerpt(args: {
  source: DebateEvidenceSourceV1;
  motion: string;
  materials: readonly DebateEvidenceExcerptMaterial[];
  generate?: DebateEvidenceExcerptGenerator;
}): Promise<EnrichedDebateEvidenceSourceV1> {
  const materials = boundedExcerptMaterials(args.materials);
  let modelSelection: DebateEvidenceExcerptModelSelection | null = null;
  if (args.generate) {
    try {
      modelSelection = await args.generate({
        motion: compactText(args.motion, SEARCH_QUERY_MAX_LENGTH),
        instruction:
          "Return one or two complete, contiguous sentences copied exactly from one supplied material. Choose the facts most useful for arguing the motion. Do not paraphrase, join nonadjacent text, or add commentary.",
        materials,
      });
    } catch {
      // Selection is assistive; source material still yields a deterministic fallback.
      modelSelection = null;
    }
  }
  const selected = selectGroundedDebateEvidenceExcerpt({
    motion: args.motion,
    materials,
    modelSelection,
  });
  return {
    ...args.source,
    snippet: selected.excerpt,
    excerptSource: selected.sourceKind,
    excerptSelection: selected.selection,
    excerptMaterialHash: selected.materialHash,
    excerptModel: selected.model,
  };
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function yearFromDateParts(value: unknown): string | null {
  const row = readRecord(value);
  const dateParts = row?.["date-parts"];
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) return null;
  const year = dateParts[0][0];
  return typeof year === "number" && Number.isFinite(year)
    ? String(Math.trunc(year))
    : null;
}

function scholarPublishedAt(row: Record<string, unknown>): string | null {
  return (
    yearFromDateParts(row["published-print"]) ??
    yearFromDateParts(row["published-online"]) ??
    yearFromDateParts(row.published) ??
    yearFromDateParts(row.issued)
  );
}

function scholarAuthors(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const names = value
    .slice(0, 3)
    .map((author) => {
      const row = readRecord(author);
      if (!row) return "";
      return compactText([row.given, row.family], 80);
    })
    .filter(Boolean);
  if (value.length > names.length && names.length > 0) names.push("et al.");
  return names.join(", ");
}

function scholarSnippet(row: Record<string, unknown>): string {
  const abstract = completeSentenceDebateEvidenceExcerpt(row.abstract);
  if (abstract) return abstract;
  const details = [
    scholarAuthors(row.author),
    compactText(row["container-title"], 120),
    compactText(row.publisher, 120),
  ].filter(Boolean);
  return completeSentenceDebateEvidenceExcerpt(details.join(" · "));
}

function normalizeScholarWork(
  value: unknown,
  index: number,
): DebateEvidenceSourceV1 | null {
  const row = readRecord(value);
  if (!row) return null;
  const title = compactText(row.title, SOURCE_TITLE_MAX_LENGTH);
  const doi = compactText(row.DOI, 240);
  const url = doi
    ? safeHttpUrl(`https://doi.org/${doi}`)
    : safeHttpUrl(row.URL);
  if (!title || !url) return null;
  const abstract = completeSentenceDebateEvidenceExcerpt(row.abstract);
  const snippet = abstract || scholarSnippet(row);
  const materialKind: DebateEvidenceExcerptSourceKind = abstract
    ? "crossref"
    : "metadata";
  const selected = selectGroundedDebateEvidenceExcerpt({
    motion: "",
    materials: [{ id: `scholar-${index + 1}`, kind: materialKind, text: snippet }],
  });
  return {
    id: `scholar-${index + 1}`,
    title,
    url,
    snippet,
    publishedAt: scholarPublishedAt(row),
    excerptSource: materialKind,
    excerptSelection: abstract ? "sentence-fallback" : "metadata-only",
    excerptMaterialHash: selected.materialHash,
    excerptModel: null,
  } as EnrichedDebateEvidenceSourceV1;
}

export function debateEvidenceSourcesFromWebResults(
  results: readonly WebSearchResult[],
): DebateEvidenceSourceV1[] {
  const seenUrls = new Set<string>();
  const sources: DebateEvidenceSourceV1[] = [];
  for (const result of results) {
    const url = safeHttpUrl(result.url);
    if (!result.title.trim() || !url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const snippet = completeSentenceDebateEvidenceExcerpt(result.snippet);
    const selected = selectGroundedDebateEvidenceExcerpt({
      motion: "",
      materials: [{ id: `brave-${sources.length + 1}`, kind: "provider", text: snippet }],
    });
    sources.push({
      id: `brave-${sources.length + 1}`,
      title: compactText(result.title, SOURCE_TITLE_MAX_LENGTH),
      url,
      snippet,
      publishedAt: compactText(result.publishedAt, 80) || null,
      excerptSource: "provider",
      excerptSelection: "sentence-fallback",
      excerptMaterialHash: selected.materialHash,
      excerptModel: null,
    } as EnrichedDebateEvidenceSourceV1);
    if (sources.length >= DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT) break;
  }
  return sources;
}

export function normalizeCrossrefScholarResults(
  responseBody: unknown,
): DebateEvidenceSourceV1[] {
  const root = readRecord(responseBody);
  const message = readRecord(root?.message);
  const items = Array.isArray(message?.items) ? message.items : [];
  const seenUrls = new Set<string>();
  const sources: DebateEvidenceSourceV1[] = [];
  for (const item of items) {
    const source = normalizeScholarWork(item, sources.length);
    if (!source || seenUrls.has(source.url)) continue;
    seenUrls.add(source.url);
    sources.push(source);
    if (sources.length >= DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT) break;
  }
  if (sources.length === 0) {
    throw new Error("Scholar Search returned no usable results.");
  }
  return sources;
}

export async function searchScholarWithCrossref(args: {
  query: string;
  signal?: AbortSignal;
}): Promise<DebateEvidenceSourceV1[]> {
  const startedAt = Date.now();
  const query = compactText(args.query, SEARCH_QUERY_MAX_LENGTH);
  if (!query) throw new Error("Scholar Search query cannot be empty.");
  const url = new URL(CROSSREF_WORKS_URL);
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", String(DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT));
  const diagnosticRequest = { method: "GET", url: url.toString(), query };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: args.signal,
    });
  } catch (error) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      error: args.signal?.aborted
        ? "Scholar Search was aborted by the caller."
        : "Scholar Search could not reach Crossref.",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
  if (!response.ok) {
    const message = `Scholar Search failed with HTTP ${response.status}.`;
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      error: message,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(message);
  }
  const rawOutput = await response.json();
  try {
    const parsedOutput = normalizeCrossrefScholarResults(rawOutput);
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      rawOutput,
      parsedOutput,
      streaming: false,
      durationMs: Date.now() - startedAt,
    });
    return parsedOutput;
  } catch (error) {
    recordDeveloperTranscriptEvent({
      kind: "search",
      purpose: "debate_scholar_search",
      provider: "crossref",
      model: "works",
      request: diagnosticRequest,
      rawOutput,
      error:
        error instanceof Error
          ? error.message
          : "Scholar Search result parsing failed.",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
