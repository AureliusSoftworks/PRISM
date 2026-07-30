import type { LlmProvider } from "./providers.ts";

const MAX_EVIDENCE_CHARACTERS = 28_000;
const MAX_EVIDENCE_PARAGRAPHS = 24;
const MIN_CONFLICT_CONFIDENCE = 0.92;

const STOP_WORDS = new Set([
  "and",
  "about",
  "after",
  "again",
  "against",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "from",
  "had",
  "has",
  "have",
  "her",
  "hers",
  "him",
  "his",
  "into",
  "its",
  "itself",
  "more",
  "only",
  "our",
  "other",
  "over",
  "same",
  "she",
  "should",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "through",
  "under",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "with",
  "would",
  "you",
  "your",
]);

export interface SlateContinuityEvidenceSection {
  id: string;
  title: string;
  ordinal: number;
  revision: number;
  prose: string;
}

export interface SlateContinuityEvidenceExcerpt {
  sectionId: string;
  sectionTitle: string;
  sectionOrdinal: number;
  sectionRevision: number;
  start: number;
  end: number;
  quote: string;
  score: number;
}

export interface SlateProposalContinuityConflict {
  summary: string;
  explanation: string;
  acceptedQuote: string;
  proposalQuote: string;
  confidence: number;
  evidence: SlateContinuityEvidenceExcerpt;
}

export interface SlateProposalContinuityAudit {
  status: "clear" | "conflict";
  conflicts: SlateProposalContinuityConflict[];
  provider: string;
  model: string | null;
}

function tokens(value: string): string[] {
  return [
    ...new Set(
      value
        .normalize("NFKC")
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}'’-]{3,}/gu)
        ?.filter((token) => !STOP_WORDS.has(token)) ?? [],
    ),
  ];
}

function paragraphs(section: SlateContinuityEvidenceSection): SlateContinuityEvidenceExcerpt[] {
  const result: SlateContinuityEvidenceExcerpt[] = [];
  const pattern = /\S[\s\S]*?(?=\n\s*\n|$)/gu;
  for (const match of section.prose.matchAll(pattern)) {
    const quote = match[0]?.trim();
    if (!quote || match.index === undefined) continue;
    const raw = match[0]!;
    const leading = raw.indexOf(quote);
    const start = match.index + Math.max(0, leading);
    result.push({
      sectionId: section.id,
      sectionTitle: section.title,
      sectionOrdinal: section.ordinal,
      sectionRevision: section.revision,
      start,
      end: start + quote.length,
      quote,
      score: 0,
    });
  }
  return result;
}

/**
 * Selects exact accepted-prose excerpts before any model call. Ranking is
 * deterministic and favors rare lexical overlap, explicit state language, and
 * nearby manuscript order. The model never gets an unbounded manuscript.
 */
export function selectSlateProposalContinuityEvidence(args: {
  sections: SlateContinuityEvidenceSection[];
  focusedSectionId: string;
  /**
   * When replacing a passage, accepted prose outside the exact replacement
   * span remains evidence—even when it lives in the focused section.
   */
  focusedReplacementRange?: { start: number; end: number } | null;
  candidateText: string;
  direction?: string;
  maxCharacters?: number;
  maxParagraphs?: number;
}): SlateContinuityEvidenceExcerpt[] {
  const candidateTokens = new Set(
    tokens(`${args.direction ?? ""}\n${args.candidateText}`),
  );
  const candidates = args.sections.flatMap((section) => {
    if (!section.prose.trim()) return [];
    if (section.id !== args.focusedSectionId) return paragraphs(section);
    const replacement = args.focusedReplacementRange;
    if (
      !replacement ||
      replacement.start < 0 ||
      replacement.end <= replacement.start
    ) {
      return [];
    }
    return paragraphs(section).flatMap((excerpt) => {
      if (
        excerpt.end <= replacement.start ||
        excerpt.start >= replacement.end
      ) {
        return [excerpt];
      }
      const retained: SlateContinuityEvidenceExcerpt[] = [];
      const addSlice = (start: number, end: number): void => {
        const raw = section.prose.slice(start, end);
        const quote = raw.trim();
        if (!quote) return;
        const leading = raw.indexOf(quote);
        const exactStart = start + Math.max(0, leading);
        retained.push({
          sectionId: section.id,
          sectionTitle: section.title,
          sectionOrdinal: section.ordinal,
          sectionRevision: section.revision,
          start: exactStart,
          end: exactStart + quote.length,
          quote,
          score: 0,
        });
      };
      if (excerpt.start < replacement.start) {
        addSlice(excerpt.start, Math.min(excerpt.end, replacement.start));
      }
      if (excerpt.end > replacement.end) {
        addSlice(Math.max(excerpt.start, replacement.end), excerpt.end);
      }
      return retained;
    });
  });
  if (candidates.length === 0) return [];

  const documentFrequency = new Map<string, number>();
  for (const excerpt of candidates) {
    for (const token of tokens(excerpt.quote)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const focusOrdinal =
    args.sections.find((section) => section.id === args.focusedSectionId)
      ?.ordinal ?? 0;
  for (const excerpt of candidates) {
    const excerptTokens = tokens(excerpt.quote);
    const lexical = excerptTokens.reduce((score, token) => {
      if (!candidateTokens.has(token)) return score;
      const frequency = documentFrequency.get(token) ?? 1;
      return score + 1 + Math.log1p(candidates.length / frequency);
    }, 0);
    const stateBoost =
      /\b(?:is|are|was|were|has|have|had|lost|gone|dead|alive|removed|destroyed|broken|sealed|opened|closed|knows|learned|forgot)\b/iu.test(
        excerpt.quote,
      )
        ? 0.35
        : 0;
    const distance = Math.abs(focusOrdinal - excerpt.sectionOrdinal);
    excerpt.score = lexical + stateBoost + 1 / Math.max(1, distance);
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      Math.abs(focusOrdinal - left.sectionOrdinal) -
        Math.abs(focusOrdinal - right.sectionOrdinal) ||
      left.sectionOrdinal - right.sectionOrdinal ||
      left.start - right.start,
  );
  const maximumCharacters = Math.max(
    1_000,
    Math.min(
      80_000,
      args.maxCharacters ?? MAX_EVIDENCE_CHARACTERS,
    ),
  );
  const maximumParagraphs = Math.max(
    1,
    Math.min(64, args.maxParagraphs ?? MAX_EVIDENCE_PARAGRAPHS),
  );
  const selected: SlateContinuityEvidenceExcerpt[] = [];
  let usedCharacters = 0;
  for (const candidate of candidates) {
    if (selected.length >= maximumParagraphs) break;
    if (
      selected.length > 0 &&
      usedCharacters + candidate.quote.length > maximumCharacters
    ) {
      continue;
    }
    selected.push(candidate);
    usedCharacters += candidate.quote.length;
  }
  return selected.sort(
    (left, right) =>
      left.sectionOrdinal - right.sectionOrdinal || left.start - right.start,
  );
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/u);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function boundedString(
  value: unknown,
  maximum: number,
): string | null {
  if (typeof value !== "string") return null;
  const result = value.normalize("NFKC").trim();
  return result && result.length <= maximum ? result : null;
}

export function validateSlateProposalContinuityAudit(args: {
  raw: string;
  candidateText: string;
  evidence: SlateContinuityEvidenceExcerpt[];
  provider: string;
  model: string | null;
}): SlateProposalContinuityAudit {
  const parsed = parseJsonObject(args.raw);
  const rows = Array.isArray(parsed?.conflicts)
    ? parsed.conflicts.slice(0, 4)
    : [];
  const conflicts: SlateProposalContinuityConflict[] = [];
  for (const value of rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const summary = boundedString(row.summary, 240);
    const explanation = boundedString(row.explanation, 800);
    const acceptedQuote = boundedString(row.acceptedQuote, 1_600);
    const proposalQuote = boundedString(row.proposalQuote, 1_600);
    const confidence =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : null;
    const evidence = acceptedQuote
      ? args.evidence.find((item) => item.quote.includes(acceptedQuote))
      : null;
    if (
      !summary ||
      !explanation ||
      !acceptedQuote ||
      !proposalQuote ||
      confidence === null ||
      confidence < MIN_CONFLICT_CONFIDENCE ||
      !evidence ||
      !args.candidateText.includes(proposalQuote)
    ) {
      continue;
    }
    conflicts.push({
      summary,
      explanation,
      acceptedQuote,
      proposalQuote,
      confidence,
      evidence,
    });
  }
  return {
    status: conflicts.length > 0 ? "conflict" : "clear",
    conflicts,
    provider: args.provider,
    model: args.model,
  };
}

export async function auditSlateProposalContinuity(args: {
  provider: LlmProvider;
  model: string;
  candidateKind: "writer_direction" | "composer_proposal";
  candidateText: string;
  evidence: SlateContinuityEvidenceExcerpt[];
  signal?: AbortSignal;
}): Promise<SlateProposalContinuityAudit> {
  if (args.evidence.length === 0 || !args.candidateText.trim()) {
    return {
      status: "clear",
      conflicts: [],
      provider: args.provider.name,
      model: args.model,
    };
  }
  const raw = await args.provider.generateResponse(
    [
      {
        role: "system",
        content: [
          "You are Continuity, Slate's strict fiction consistency auditor.",
          "Find only material, high-confidence contradictions between accepted manuscript evidence and the candidate.",
          "Do not flag new information, figurative language, differing beliefs, mysteries, unreliable narration, dreams, flashbacks, or intentionally unresolved ambiguity.",
          "Object presence/state, identity, chronology, character knowledge, causal impossibility, and locked facts may conflict.",
          "Every finding must quote both inputs exactly. Return JSON only and no hidden reasoning.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "audit_slate_continuity_candidate",
          candidateKind: args.candidateKind,
          acceptedEvidence: args.evidence.map((item) => ({
            sectionId: item.sectionId,
            sectionTitle: item.sectionTitle,
            sectionOrdinal: item.sectionOrdinal,
            sectionRevision: item.sectionRevision,
            quote: item.quote,
          })),
          candidate: args.candidateText,
          responseShape: {
            conflicts: [
              {
                summary: "short material conflict",
                explanation: "bounded explicit rationale",
                acceptedQuote: "exact substring from accepted evidence",
                proposalQuote: "exact substring from candidate",
                confidence: 0.98,
              },
            ],
          },
        }),
      },
    ],
    {
      model: args.model,
      temperature: 0,
      maxTokens: 1_200,
      jsonMode: true,
      usagePurpose: "slate_shape",
      signal: args.signal,
    },
  );
  return validateSlateProposalContinuityAudit({
    raw,
    candidateText: args.candidateText,
    evidence: args.evidence,
    provider: args.provider.name,
    model: args.provider.diagnosticModel?.trim() || args.model,
  });
}
