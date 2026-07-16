import { createHash } from "node:crypto";
import {
  currentContinuityProducerVersions,
  type ContinuityProducerVersions,
  type SlateContinuityContextBrief,
  type SlateContinuityEntityKind,
  type SlateContinuityEpistemicStatus,
  type SlateContinuitySourceAnchor,
} from "@localai/shared";

export const SLATE_CONTINUITY_DETERMINISTIC_INDEX_VERSION = 1;
export const DEFAULT_SLATE_CONTEXT_TOKEN_BUDGET = 8_192;

const TITLE_WORD = String.raw`[\p{Lu}][\p{L}\p{M}'’-]*`;
const TITLE_NAME = String.raw`${TITLE_WORD}(?:\s+(?:(?:of|the|and|de|del|van|von)\s+)?${TITLE_WORD}){0,3}`;
const TITLE_NAME_PATTERN = new RegExp(String.raw`\b(${TITLE_NAME})\b`, "gu");
const ALIAS_PATTERN = new RegExp(
  String.raw`\b(${TITLE_NAME}),?\s+(?:is\s+)?(?:also\s+)?(?:known\s+as|called|nicknamed|aka)\s+(?:["“])?((?:the\s+)?${TITLE_NAME})(?:["”])?`,
  "gu",
);
const CLAIM_PATTERN = new RegExp(
  String.raw`^(${TITLE_NAME})\s+(is|are|was|were|has|had|owns?|owned|lives?|lived|knows?|knew|believes?|believed|wants?|wanted|rules?|ruled|guards?|guarded|serves?|served|hates?|hated|loves?|loved|lies?|stood|stands)\s+(.+)$`,
  "u",
);

const SENTENCE_STARTER_WORDS = new Set([
  "a",
  "after",
  "although",
  "an",
  "and",
  "as",
  "at",
  "before",
  "but",
  "by",
  "during",
  "for",
  "from",
  "he",
  "her",
  "his",
  "if",
  "in",
  "it",
  "later",
  "meanwhile",
  "near",
  "of",
  "on",
  "or",
  "she",
  "since",
  "that",
  "the",
  "their",
  "then",
  "they",
  "this",
  "those",
  "through",
  "to",
  "until",
  "when",
  "where",
  "while",
  "with",
]);

const ABBREVIATIONS = new Set([
  "capt",
  "dr",
  "e.g",
  "etc",
  "i.e",
  "jr",
  "lady",
  "lord",
  "mr",
  "mrs",
  "ms",
  "prof",
  "rev",
  "sr",
  "st",
]);

export interface ContinuityTextSource {
  sourceId: string;
  sectionId: string | null;
  sectionRevision: number | null;
  content: string;
}

export interface ContinuityIndexedAnchor extends SlateContinuitySourceAnchor {
  anchorId: string;
  kind: "paragraph" | "sentence";
  text: string;
}

export interface ContinuityTextIndex {
  sourceId: string;
  sectionId: string | null;
  sectionRevision: number | null;
  contentHash: string;
  processingKey: string;
  paragraphs: ContinuityIndexedAnchor[];
  sentences: ContinuityIndexedAnchor[];
}

export interface ContinuityIndexCheckpoint {
  extractionVersion: number;
  processingKey: string;
  contentHash: string;
  paragraphHashes: string[];
  sentenceHashes: string[];
}

export interface ContinuitySourceIndexPlan {
  action: "skip" | "reanchor" | "extract";
  index: ContinuityTextIndex;
  checkpoint: ContinuityIndexCheckpoint;
  changedParagraphs: ContinuityIndexedAnchor[];
  removedParagraphHashes: string[];
  retainedParagraphCount: number;
}

export interface DeterministicEntityCandidate {
  candidateId: string;
  canonicalName: string;
  normalizedName: string;
  kind: SlateContinuityEntityKind;
  aliases: string[];
  confidence: number;
  anchors: SlateContinuitySourceAnchor[];
}

export interface DeterministicClaimCandidate {
  candidateId: string;
  subjectName: string;
  subjectNormalizedName: string;
  predicate: string;
  objectName: string | null;
  objectNormalizedName: string | null;
  value: string;
  epistemicStatus: SlateContinuityEpistemicStatus;
  perspectiveNormalizedName: string | null;
  confidence: number;
  anchors: SlateContinuitySourceAnchor[];
}

export interface DeterministicContinuityCandidates {
  entities: DeterministicEntityCandidate[];
  claims: DeterministicClaimCandidate[];
}

export type ContinuityContextCandidateKind =
  | "locked_instruction"
  | "non_negotiable"
  | "writer_direction"
  | "focused_section"
  | "adjacent_section"
  | "due_thread"
  | "knowledge"
  | "relationship"
  | "event"
  | "claim"
  | "entity"
  | "summary";

export interface ContinuityContextCandidate {
  id: string;
  kind: ContinuityContextCandidateKind;
  text: string;
  relevance?: number;
  distance?: number;
  ordinal?: number;
  sectionId?: string;
  required?: boolean;
}

export interface CompiledContinuityContext extends SlateContinuityContextBrief {
  selectedCandidateIds: string[];
  omittedCandidateIds: string[];
  tokenBudget: number;
}

export class ContinuityContextBudgetError extends Error {
  readonly requiredTokenEstimate: number;
  readonly tokenBudget: number;

  constructor(requiredTokenEstimate: number, tokenBudget: number) {
    super(
      `Required Slate context needs approximately ${requiredTokenEstimate} tokens, exceeding the ${tokenBudget}-token budget.`,
    );
    this.name = "ContinuityContextBudgetError";
    this.requiredTokenEstimate = requiredTokenEstimate;
    this.tokenBudget = tokenBudget;
  }
}

export function hashContinuityText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableHash(parts: readonly unknown[]): string {
  return hashContinuityText(JSON.stringify(parts));
}

function trimRange(content: string, start: number, end: number): [number, number] {
  while (start < end && /\s/u.test(content[start]!)) start += 1;
  while (end > start && /\s/u.test(content[end - 1]!)) end -= 1;
  return [start, end];
}

function createAnchor(
  source: ContinuityTextSource,
  kind: "paragraph" | "sentence",
  start: number,
  end: number,
): ContinuityIndexedAnchor {
  const text = source.content.slice(start, end);
  const quoteHash = hashContinuityText(text);
  return {
    anchorId: `${kind}-${stableHash([
      "slate-continuity-anchor-v1",
      source.sourceId,
      source.sectionRevision,
      start,
      end,
      quoteHash,
    ]).slice(0, 24)}`,
    kind,
    text,
    sourceId: source.sourceId,
    sectionId: source.sectionId,
    sectionRevision: source.sectionRevision,
    start,
    end,
    quoteHash,
  };
}

function paragraphRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const separator = /\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/g;
  let start = 0;
  for (const match of content.matchAll(separator)) {
    const [trimmedStart, trimmedEnd] = trimRange(
      content,
      start,
      match.index,
    );
    if (trimmedStart < trimmedEnd) ranges.push([trimmedStart, trimmedEnd]);
    start = match.index + match[0].length;
  }
  const [trimmedStart, trimmedEnd] = trimRange(content, start, content.length);
  if (trimmedStart < trimmedEnd) ranges.push([trimmedStart, trimmedEnd]);
  return ranges;
}

function isSentencePeriod(content: string, sentenceStart: number, index: number): boolean {
  if (content[index] !== ".") return true;
  if (/\d/u.test(content[index - 1] ?? "") && /\d/u.test(content[index + 1] ?? "")) {
    return false;
  }
  const before = content.slice(sentenceStart, index);
  const word = before.match(/([\p{L}]+(?:\.[\p{L}]+)*)$/u)?.[1]?.toLocaleLowerCase();
  if (!word) return true;
  if (ABBREVIATIONS.has(word)) return false;
  if (word.length === 1 && /\p{Lu}/u.test(before.at(-1) ?? "")) return false;
  return true;
}

function sentenceRanges(
  content: string,
  paragraphStart: number,
  paragraphEnd: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let sentenceStart = paragraphStart;
  while (sentenceStart < paragraphEnd && /\s/u.test(content[sentenceStart]!)) {
    sentenceStart += 1;
  }

  let index = sentenceStart;
  while (index < paragraphEnd) {
    if (
      (content[index] === "." || content[index] === "!" || content[index] === "?") &&
      isSentencePeriod(content, sentenceStart, index)
    ) {
      let end = index + 1;
      while (end < paragraphEnd && /[.!?]/u.test(content[end]!)) end += 1;
      while (end < paragraphEnd && /["'’”)\]}]/u.test(content[end]!)) end += 1;
      if (end === paragraphEnd || /\s/u.test(content[end]!)) {
        const [trimmedStart, trimmedEnd] = trimRange(content, sentenceStart, end);
        if (trimmedStart < trimmedEnd) ranges.push([trimmedStart, trimmedEnd]);
        sentenceStart = end;
        while (sentenceStart < paragraphEnd && /\s/u.test(content[sentenceStart]!)) {
          sentenceStart += 1;
        }
        index = sentenceStart;
        continue;
      }
    }
    index += 1;
  }

  const [trimmedStart, trimmedEnd] = trimRange(content, sentenceStart, paragraphEnd);
  if (trimmedStart < trimmedEnd) ranges.push([trimmedStart, trimmedEnd]);
  return ranges;
}

export function buildContinuityTextIndex(
  source: ContinuityTextSource,
  extractionVersion = SLATE_CONTINUITY_DETERMINISTIC_INDEX_VERSION,
): ContinuityTextIndex {
  if (!source.sourceId.trim()) throw new Error("Continuity source ID is required.");
  if (!Number.isInteger(extractionVersion) || extractionVersion < 1) {
    throw new Error("Continuity extraction version must be a positive integer.");
  }
  const contentHash = hashContinuityText(source.content);
  const paragraphs = paragraphRanges(source.content).map(([start, end]) =>
    createAnchor(source, "paragraph", start, end),
  );
  const sentences = paragraphs.flatMap((paragraph) =>
    sentenceRanges(source.content, paragraph.start, paragraph.end).map(([start, end]) =>
      createAnchor(source, "sentence", start, end),
    ),
  );
  return {
    sourceId: source.sourceId,
    sectionId: source.sectionId,
    sectionRevision: source.sectionRevision,
    contentHash,
    processingKey: stableHash([
      "slate-continuity-index-v1",
      extractionVersion,
      source.sourceId,
      source.sectionId,
      source.sectionRevision,
      contentHash,
    ]),
    paragraphs,
    sentences,
  };
}

function occurrenceKeys(hashes: readonly string[]): string[] {
  const counts = new Map<string, number>();
  return hashes.map((hash) => {
    const occurrence = (counts.get(hash) ?? 0) + 1;
    counts.set(hash, occurrence);
    return `${hash}:${occurrence}`;
  });
}

export function planContinuitySourceIndex(
  source: ContinuityTextSource,
  previous: ContinuityIndexCheckpoint | null = null,
  extractionVersion = SLATE_CONTINUITY_DETERMINISTIC_INDEX_VERSION,
): ContinuitySourceIndexPlan {
  const index = buildContinuityTextIndex(source, extractionVersion);
  const paragraphHashes = index.paragraphs.map((paragraph) => paragraph.quoteHash);
  const checkpoint: ContinuityIndexCheckpoint = {
    extractionVersion,
    processingKey: index.processingKey,
    contentHash: index.contentHash,
    paragraphHashes,
    sentenceHashes: index.sentences.map((sentence) => sentence.quoteHash),
  };

  if (previous?.processingKey === checkpoint.processingKey) {
    return {
      action: "skip",
      index,
      checkpoint,
      changedParagraphs: [],
      removedParagraphHashes: [],
      retainedParagraphCount: paragraphHashes.length,
    };
  }

  const priorKeys = new Set(occurrenceKeys(previous?.paragraphHashes ?? []));
  const nextKeys = occurrenceKeys(paragraphHashes);
  const nextKeySet = new Set(nextKeys);
  const changedParagraphs = index.paragraphs.filter(
    (_paragraph, paragraphIndex) => !priorKeys.has(nextKeys[paragraphIndex]!),
  );
  const removedParagraphHashes = occurrenceKeys(previous?.paragraphHashes ?? [])
    .filter((key) => !nextKeySet.has(key))
    .map((key) => key.slice(0, key.lastIndexOf(":")));
  const retainedParagraphCount = paragraphHashes.length - changedParagraphs.length;
  const sameSemanticContent =
    previous !== null &&
    previous.extractionVersion === extractionVersion &&
    previous.contentHash === checkpoint.contentHash;

  return {
    action: sameSemanticContent ? "reanchor" : "extract",
    index,
    checkpoint,
    changedParagraphs,
    removedParagraphHashes,
    retainedParagraphCount,
  };
}

export function normalizeContinuityName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function isPlausibleEntityName(name: string): boolean {
  const normalized = normalizeContinuityName(name);
  if (!normalized || SENTENCE_STARTER_WORDS.has(normalized)) return false;
  return /\p{L}/u.test(name);
}

function inferEntityKind(name: string, sentence: string, offset: number): SlateContinuityEntityKind {
  const normalized = normalizeContinuityName(name);
  const prefix = sentence.slice(Math.max(0, offset - 16), offset).toLocaleLowerCase();
  if (
    /(?:city|castle|citadel|forest|harbor|island|keep|mountain|palace|river|sea|station|tower|village|watch)$/u.test(
      normalized,
    ) ||
    /(?:\bin|\bat|\bfrom|\bnear|\bthrough|\bto)\s*$/u.test(prefix)
  ) {
    return "location";
  }
  if (/(?:council|guild|guard|house|order|tribe)$/u.test(normalized)) return "group";
  if (/(?:amulet|blade|book|crown|key|ring|scepter|ship|sword)$/u.test(normalized)) {
    return "object";
  }
  if (/(?:law|magic|oath|prophecy|rule)$/u.test(normalized)) return "world_rule";
  return "character";
}

function baseAnchor(anchor: ContinuityIndexedAnchor): SlateContinuitySourceAnchor {
  return {
    sourceId: anchor.sourceId,
    sectionId: anchor.sectionId,
    sectionRevision: anchor.sectionRevision,
    start: anchor.start,
    end: anchor.end,
    quoteHash: anchor.quoteHash,
  };
}

function claimPredicate(verb: string): {
  predicate: string;
  epistemicStatus: SlateContinuityEpistemicStatus;
} {
  const normalized = verb.toLocaleLowerCase();
  if (["is", "are", "was", "were", "stands", "stood", "lies"].includes(normalized)) {
    return { predicate: "state", epistemicStatus: "fact" };
  }
  if (["has", "had", "own", "owns", "owned"].includes(normalized)) {
    return { predicate: "possesses", epistemicStatus: "fact" };
  }
  if (["live", "lives", "lived"].includes(normalized)) {
    return { predicate: "location", epistemicStatus: "fact" };
  }
  if (["know", "knows", "knew"].includes(normalized)) {
    return { predicate: "knows", epistemicStatus: "fact" };
  }
  if (["believe", "believes", "believed"].includes(normalized)) {
    return { predicate: "believes", epistemicStatus: "belief" };
  }
  if (["want", "wants", "wanted"].includes(normalized)) {
    return { predicate: "wants", epistemicStatus: "intention" };
  }
  return { predicate: normalized.replace(/(?:ed|s)$/u, ""), epistemicStatus: "fact" };
}

function exactObjectName(value: string): string | null {
  const withoutRelation = value
    .replace(/^(?:in|at|to|from|of|near|inside|outside|beyond|under|over)\s+/iu, "")
    .replace(/[.!?]+$/u, "")
    .trim();
  const match = withoutRelation.match(new RegExp(String.raw`^(${TITLE_NAME})$`, "u"));
  return match?.[1] ?? null;
}

export function extractDeterministicContinuityCandidates(
  source: ContinuityTextSource,
): DeterministicContinuityCandidates {
  const index = buildContinuityTextIndex(source);
  const entities = new Map<
    string,
    {
      canonicalName: string;
      kind: SlateContinuityEntityKind;
      aliases: Map<string, string>;
      anchors: Map<string, SlateContinuitySourceAnchor>;
    }
  >();
  const aliasToCanonical = new Map<string, string>();

  const ensureEntity = (
    canonicalName: string,
    sentence: ContinuityIndexedAnchor,
    localOffset: number,
  ) => {
    const normalizedName = normalizeContinuityName(canonicalName);
    if (!isPlausibleEntityName(canonicalName)) return null;
    const existing = entities.get(normalizedName);
    if (existing) {
      existing.anchors.set(sentence.anchorId, baseAnchor(sentence));
      return existing;
    }
    const created = {
      canonicalName: canonicalName.trim(),
      kind: inferEntityKind(canonicalName, sentence.text, localOffset),
      aliases: new Map<string, string>(),
      anchors: new Map([[sentence.anchorId, baseAnchor(sentence)]]),
    };
    entities.set(normalizedName, created);
    return created;
  };

  for (const sentence of index.sentences) {
    ALIAS_PATTERN.lastIndex = 0;
    for (const match of sentence.text.matchAll(ALIAS_PATTERN)) {
      const canonicalName = match[1]!.trim();
      const alias = match[2]!.trim();
      const entity = ensureEntity(canonicalName, sentence, match.index);
      if (!entity) continue;
      const aliasNormalized = normalizeContinuityName(alias);
      if (aliasNormalized !== normalizeContinuityName(canonicalName)) {
        entity.aliases.set(aliasNormalized, alias);
        const canonicalNormalized = normalizeContinuityName(canonicalName);
        aliasToCanonical.set(aliasNormalized, canonicalNormalized);
        const aliasWithoutArticle = aliasNormalized.replace(/^(?:a|an|the)\s+/u, "");
        if (aliasWithoutArticle !== aliasNormalized) {
          aliasToCanonical.set(aliasWithoutArticle, canonicalNormalized);
        }
      }
    }
  }

  for (const sentence of index.sentences) {
    TITLE_NAME_PATTERN.lastIndex = 0;
    for (const match of sentence.text.matchAll(TITLE_NAME_PATTERN)) {
      const mentionedName = match[1]!.trim();
      if (!isPlausibleEntityName(mentionedName)) continue;
      const mentionedNormalized = normalizeContinuityName(mentionedName);
      const canonicalNormalized = aliasToCanonical.get(mentionedNormalized);
      if (canonicalNormalized) {
        entities.get(canonicalNormalized)?.anchors.set(sentence.anchorId, baseAnchor(sentence));
        continue;
      }
      ensureEntity(mentionedName, sentence, match.index);
    }
  }

  const claims: DeterministicClaimCandidate[] = [];
  for (const sentence of index.sentences) {
    const claimText = sentence.text
      .replace(/^["'‘“]+/u, "")
      .replace(/[.!?"'’”]+$/u, "")
      .trim();
    const match = claimText.match(CLAIM_PATTERN);
    if (!match) continue;
    const rawSubjectName = match[1]!.trim();
    const rawSubjectNormalized = normalizeContinuityName(rawSubjectName);
    const subjectNormalizedName = aliasToCanonical.get(rawSubjectNormalized) ?? rawSubjectNormalized;
    const subject = entities.get(subjectNormalizedName);
    if (!subject) continue;
    const { predicate, epistemicStatus } = claimPredicate(match[2]!);
    const value = match[3]!.trim();
    const rawObjectName = exactObjectName(value);
    const rawObjectNormalized = rawObjectName
      ? normalizeContinuityName(rawObjectName)
      : null;
    const objectNormalizedName = rawObjectNormalized
      ? (aliasToCanonical.get(rawObjectNormalized) ?? rawObjectNormalized)
      : null;
    const objectName = objectNormalizedName
      ? (entities.get(objectNormalizedName)?.canonicalName ?? rawObjectName)
      : null;
    const anchor = baseAnchor(sentence);
    claims.push({
      candidateId: `claim-${stableHash([
        "slate-continuity-exact-claim-v1",
        anchor.sourceId,
        anchor.sectionRevision,
        anchor.start,
        anchor.quoteHash,
        subjectNormalizedName,
        predicate,
        objectNormalizedName,
        value,
        epistemicStatus,
      ]).slice(0, 24)}`,
      subjectName: subject.canonicalName,
      subjectNormalizedName,
      predicate,
      objectName,
      objectNormalizedName,
      value,
      epistemicStatus,
      perspectiveNormalizedName:
        epistemicStatus === "belief" || epistemicStatus === "intention"
          ? subjectNormalizedName
          : null,
      confidence: 0.98,
      anchors: [anchor],
    });
  }

  return {
    entities: [...entities.entries()]
      .map(([normalizedName, entity]) => ({
        candidateId: `entity-${stableHash([
          "slate-continuity-entity-candidate-v1",
          source.sourceId,
          normalizedName,
        ]).slice(0, 24)}`,
        canonicalName: entity.canonicalName,
        normalizedName,
        kind: entity.kind,
        aliases: [...entity.aliases.values()].sort((left, right) =>
          left.localeCompare(right),
        ),
        confidence: entity.aliases.size > 0 || entity.anchors.size > 1 ? 0.96 : 0.82,
        anchors: [...entity.anchors.values()].sort((left, right) => left.start - right.start),
      }))
      .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName)),
    claims: claims.sort((left, right) => left.anchors[0]!.start - right.anchors[0]!.start),
  };
}

export function estimateContinuityTokens(value: string): number {
  if (!value) return 0;
  return Math.max(1, Math.ceil(Buffer.byteLength(value, "utf8") / 4));
}

const CONTEXT_PRIORITY: Record<ContinuityContextCandidateKind, number> = {
  locked_instruction: 0,
  non_negotiable: 1,
  writer_direction: 2,
  focused_section: 3,
  adjacent_section: 4,
  due_thread: 5,
  knowledge: 6,
  relationship: 7,
  event: 8,
  claim: 9,
  entity: 10,
  summary: 11,
};

const CONTEXT_LABEL: Record<ContinuityContextCandidateKind, string> = {
  locked_instruction: "LOCK",
  non_negotiable: "NON-NEGOTIABLE",
  writer_direction: "DIRECTION",
  focused_section: "FOCUS",
  adjacent_section: "ADJACENT",
  due_thread: "DUE THREAD",
  knowledge: "CHARACTER KNOWLEDGE",
  relationship: "RELATIONSHIP",
  event: "EVENT",
  claim: "CANON",
  entity: "ENTITY",
  summary: "SUMMARY",
};

function isRequiredContextCandidate(candidate: ContinuityContextCandidate): boolean {
  return (
    candidate.required === true ||
    candidate.kind === "locked_instruction" ||
    candidate.kind === "non_negotiable" ||
    candidate.kind === "writer_direction" ||
    candidate.kind === "focused_section"
  );
}

function normalizedScore(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value!));
}

function compareContextCandidates(
  left: ContinuityContextCandidate,
  right: ContinuityContextCandidate,
): number {
  const required = Number(isRequiredContextCandidate(right)) - Number(isRequiredContextCandidate(left));
  if (required !== 0) return required;
  const priority = CONTEXT_PRIORITY[left.kind] - CONTEXT_PRIORITY[right.kind];
  if (priority !== 0) return priority;
  const relevance = normalizedScore(right.relevance) - normalizedScore(left.relevance);
  if (relevance !== 0) return relevance;
  const distance = Math.abs(left.distance ?? Number.MAX_SAFE_INTEGER) - Math.abs(right.distance ?? Number.MAX_SAFE_INTEGER);
  if (distance !== 0) return distance;
  const ordinal = (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER);
  if (ordinal !== 0) return ordinal;
  return left.id.localeCompare(right.id);
}

function contextLine(candidate: ContinuityContextCandidate): string {
  return `[${CONTEXT_LABEL[candidate.kind]}] ${candidate.text.trim()}`;
}

function uniqueInOrder(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function compileContinuityContextBrief(args: {
  projectId: string;
  sectionId: string;
  sectionRevision: number;
  candidates: ContinuityContextCandidate[];
  tokenBudget?: number;
  producerVersions?: ContinuityProducerVersions;
}): CompiledContinuityContext {
  const tokenBudget = args.tokenBudget ?? DEFAULT_SLATE_CONTEXT_TOKEN_BUDGET;
  if (!Number.isInteger(tokenBudget) || tokenBudget < 1) {
    throw new Error("Slate context token budget must be a positive integer.");
  }
  if (!Number.isInteger(args.sectionRevision) || args.sectionRevision < 0) {
    throw new Error("Slate section revision must be a non-negative integer.");
  }
  const seen = new Set<string>();
  const candidates = args.candidates
    .map((candidate) => ({ ...candidate, id: candidate.id.trim(), text: candidate.text.trim() }))
    .filter((candidate) => candidate.id && candidate.text)
    .sort(compareContextCandidates);
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      throw new Error(`Slate context candidate ID "${candidate.id}" is duplicated.`);
    }
    seen.add(candidate.id);
  }

  const header = `Slate Continuity brief\nFocus: ${args.sectionId} @ revision ${args.sectionRevision}`;
  const required = candidates.filter(isRequiredContextCandidate);
  const requiredText = [header, ...required.map(contextLine)].join("\n");
  const requiredTokenEstimate = estimateContinuityTokens(requiredText);
  if (requiredTokenEstimate > tokenBudget) {
    throw new ContinuityContextBudgetError(requiredTokenEstimate, tokenBudget);
  }

  const selected = [...required];
  let renderedBrief = requiredText;
  for (const candidate of candidates) {
    if (isRequiredContextCandidate(candidate)) continue;
    const proposed = `${renderedBrief}\n${contextLine(candidate)}`;
    if (estimateContinuityTokens(proposed) <= tokenBudget) {
      selected.push(candidate);
      renderedBrief = proposed;
    }
  }
  const selectedIds = new Set(selected.map((candidate) => candidate.id));
  const omitted = candidates.filter((candidate) => !selectedIds.has(candidate.id));
  const producerVersions = args.producerVersions ?? currentContinuityProducerVersions();

  return {
    projectId: args.projectId,
    sectionId: args.sectionId,
    sectionRevision: args.sectionRevision,
    adjacentSectionIds: uniqueInOrder(
      selected
        .filter((candidate) => candidate.kind === "adjacent_section")
        .map((candidate) => candidate.sectionId ?? candidate.id),
    ),
    relevantClaimIds: selected
      .filter((candidate) => candidate.kind === "claim")
      .map((candidate) => candidate.id),
    relevantEntityIds: selected
      .filter((candidate) => candidate.kind === "entity")
      .map((candidate) => candidate.id),
    relevantEventIds: selected
      .filter((candidate) => candidate.kind === "event")
      .map((candidate) => candidate.id),
    relevantRelationshipIds: selected
      .filter((candidate) => candidate.kind === "relationship")
      .map((candidate) => candidate.id),
    relevantKnowledgeStateIds: selected
      .filter((candidate) => candidate.kind === "knowledge")
      .map((candidate) => candidate.id),
    dueThreadIds: selected
      .filter((candidate) => candidate.kind === "due_thread")
      .map((candidate) => candidate.id),
    lockedInstructions: selected
      .filter((candidate) => candidate.kind === "locked_instruction")
      .map((candidate) => candidate.text),
    renderedBrief,
    tokenEstimate: estimateContinuityTokens(renderedBrief),
    sourceFingerprint: stableHash([
      "slate-continuity-context-v1",
      args.projectId,
      args.sectionId,
      args.sectionRevision,
      producerVersions,
      selected.map((candidate) => [candidate.id, candidate.kind, candidate.text]),
    ]),
    producerVersions,
    selectedCandidateIds: selected.map((candidate) => candidate.id),
    omittedCandidateIds: omitted.map((candidate) => candidate.id),
    tokenBudget,
  };
}
