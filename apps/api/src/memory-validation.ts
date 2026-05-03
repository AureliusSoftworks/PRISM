import type { MemoryCandidate } from "./memory-extraction.ts";
import type { LlmProvider, ProviderMessage } from "./providers.ts";

export type MemoryValidationSource = "direct" | "inferred" | "compiled";
export type MemoryValidationScope = "bot" | "global";
export type MemoryValidationDecision = "approve" | "auto_fix" | "reject";

export type MemoryValidationReasonCode =
  | "subject_role_confusion"
  | "assistant_identity_instruction"
  | "task_request_not_memory"
  | "question_fragment"
  | "trailing_conversation_tag"
  | "lost_preference_payload"
  | "contradiction"
  | "low_confidence"
  | "malformed_text"
  | "validator_error";

export interface ValidatedMemoryCandidate extends MemoryCandidate {
  validationStatus: "approved" | "auto_fixed";
  originalText: string;
  reasonCodes: MemoryValidationReasonCode[];
}

export type MemoryValidationStatus = ValidatedMemoryCandidate["validationStatus"];

export interface RejectedMemoryCandidate {
  originalText: string;
  reasonCodes: MemoryValidationReasonCode[];
  notes?: string;
}

export interface MemoryValidationOptions {
  source: MemoryValidationSource;
  scope: MemoryValidationScope;
  rawContext: string;
  candidates: MemoryCandidate[];
  existingMemories?: string[];
}

export interface MemoryValidationOutcome {
  candidates: ValidatedMemoryCandidate[];
  rejected: RejectedMemoryCandidate[];
}

interface CriticResult {
  index: number;
  decision: MemoryValidationDecision;
  text?: string;
  confidence?: number;
  reasonCodes?: unknown[];
  notes?: string;
}

interface CriticPayload {
  results?: unknown;
}

const MEMORY_VALIDATION_SYSTEM_PROMPT = `You are Prism's memory validation critic. Validate proposed saved memories before they are written.

Memories must be durable, concise facts or preferences about the user, written in second person ("You prefer...") or as "The user...".

Return JSON only:
{"results":[{"index":0,"decision":"approve|auto_fix|reject","text":"...","confidence":0.0-1.0,"reasonCodes":["..."],"notes":"optional"}]}

Rules:
- Fix small grammar, typo, pronoun, and subject mistakes.
- If a candidate is really an instruction to the assistant, save it only as a user preference when the source explicitly asks to remember it.
- Reject one-off tasks, questions, ambiguous "you are" statements, malformed text, and low-confidence guesses.
- Never invent new personal facts.
- Preserve the payload of favorites/preferences when merging or rewriting.`;

const TASK_LIKE_MEMORY_PATTERN =
  /^(?:please\s+)?(?:write|draft|compose|create|make|generate|summarize|summarise|explain|help|help\s+me|give\s+me|show\s+me|tell\s+me|find|search|look\s+up|translate|rewrite|edit|review|fix|debug|build|plan)\b/i;

const ASSISTANT_IDENTITY_COMMAND_PATTERN =
  /^(?:please\s+)?(?:do\s+not|don't|never)\s+refer\s+to\s+yourself\s+as\s+(?:an?\s+)?ai\b/i;

const USER_PREFERENCE_PATTERN =
  /^(?:you|the user)\s+(?:prefer|prefers|would like|want|wants|need|needs)\b/i;

const VALID_REASON_CODES = new Set<MemoryValidationReasonCode>([
  "subject_role_confusion",
  "assistant_identity_instruction",
  "task_request_not_memory",
  "question_fragment",
  "trailing_conversation_tag",
  "lost_preference_payload",
  "contradiction",
  "low_confidence",
  "malformed_text",
  "validator_error",
]);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseJsonPayload(raw: string): CriticPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let payload = trimmed;
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```$/);
  if (fence?.[1]) {
    payload = fence[1].trim();
  } else {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      payload = trimmed.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(payload) as CriticPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function reasonCodesFrom(rawCodes: unknown[] | undefined): MemoryValidationReasonCode[] {
  const codes = new Set<MemoryValidationReasonCode>();
  for (const code of rawCodes ?? []) {
    if (typeof code === "string" && VALID_REASON_CODES.has(code as MemoryValidationReasonCode)) {
      codes.add(code as MemoryValidationReasonCode);
    }
  }
  return [...codes];
}

function sentenceCase(text: string): string {
  const trimmed = normalizeWhitespace(text).replace(/[.!?]+$/, "");
  if (!trimmed) return "";
  return `${trimmed[0]?.toUpperCase()}${trimmed.slice(1)}.`;
}

function memoryKey(text: string): string | null {
  const normalized = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(
    /^(?:my|your|the user's)\s+(.+?)\s+(?:is|are|was|were)\s+.+$/
  );
  const subject = match?.[1]?.trim();
  if (!subject) return null;
  return /\b(?:favorite|favourite|preferred|default|current|name)\b/.test(subject)
    ? subject
    : null;
}

function contradictsExisting(candidate: MemoryCandidate, existingMemories: string[]): boolean {
  const key = memoryKey(candidate.text);
  if (!key) return false;
  const candidateComparable = candidate.text.toLowerCase();
  return existingMemories.some((memory) => {
    if (memoryKey(memory) !== key) return false;
    return memory.toLowerCase() !== candidateComparable && candidate.confidence < 0.8;
  });
}

function deterministicPreReject(
  candidate: MemoryCandidate,
  existingMemories: string[]
): RejectedMemoryCandidate | null {
  const text = normalizeWhitespace(candidate.text);
  if (!text || text.length < 4) {
    return { originalText: candidate.text, reasonCodes: ["malformed_text"] };
  }
  if (TASK_LIKE_MEMORY_PATTERN.test(text)) {
    return { originalText: candidate.text, reasonCodes: ["task_request_not_memory"] };
  }
  if (contradictsExisting(candidate, existingMemories)) {
    return { originalText: candidate.text, reasonCodes: ["contradiction", "low_confidence"] };
  }
  return null;
}

function normalizeCriticResult(
  result: CriticResult,
  candidate: MemoryCandidate
): ValidatedMemoryCandidate | RejectedMemoryCandidate {
  const reasonCodes = reasonCodesFrom(result.reasonCodes);
  const rawText = typeof result.text === "string" ? result.text : candidate.text;
  const text = sentenceCase(rawText);
  const confidence =
    typeof result.confidence === "number" && Number.isFinite(result.confidence)
      ? Math.min(candidate.confidence, clamp01(result.confidence))
      : candidate.confidence;
  const notes = typeof result.notes === "string" ? result.notes : undefined;

  if (result.decision === "reject") {
    return {
      originalText: candidate.text,
      reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["low_confidence"],
      ...(notes ? { notes } : {}),
    };
  }

  if (!text || text.length < 4) {
    const rejectedReasonCodes: MemoryValidationReasonCode[] = [
      ...new Set<MemoryValidationReasonCode>([...reasonCodes, "malformed_text"]),
    ];
    return {
      originalText: candidate.text,
      reasonCodes: rejectedReasonCodes,
      ...(notes ? { notes } : {}),
    };
  }

  if (
    ASSISTANT_IDENTITY_COMMAND_PATTERN.test(candidate.text) &&
    (!USER_PREFERENCE_PATTERN.test(text) || ASSISTANT_IDENTITY_COMMAND_PATTERN.test(text))
  ) {
    const rejectedReasonCodes: MemoryValidationReasonCode[] = [
      ...new Set<MemoryValidationReasonCode>([
        ...reasonCodes,
        "assistant_identity_instruction",
      ]),
    ];
    return {
      originalText: candidate.text,
      reasonCodes: rejectedReasonCodes,
      ...(notes ? { notes } : {}),
    };
  }

  return {
    text,
    confidence,
    validationStatus: result.decision === "auto_fix" ? "auto_fixed" : "approved",
    originalText: candidate.text,
    reasonCodes,
  };
}

function buildValidationMessages(options: MemoryValidationOptions): ProviderMessage[] {
  return [
    { role: "system", content: MEMORY_VALIDATION_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        source: options.source,
        scope: options.scope,
        rawContext: options.rawContext,
        existingMemories: options.existingMemories ?? [],
        candidates: options.candidates.map((candidate, index) => ({
          index,
          text: candidate.text,
          confidence: candidate.confidence,
        })),
      }),
    },
  ];
}

function malformedRejections(candidates: MemoryCandidate[]): RejectedMemoryCandidate[] {
  return candidates.map((candidate) => ({
    originalText: candidate.text,
    reasonCodes: ["validator_error", "malformed_text"],
  }));
}

/**
 * Runs the LLM critic plus deterministic gates before memory text is persisted.
 * Validation fails closed: malformed critic output results in skipped memories,
 * not silent writes.
 */
export async function validateMemoryCandidates(
  provider: LlmProvider,
  options: MemoryValidationOptions
): Promise<MemoryValidationOutcome> {
  if (options.candidates.length === 0) {
    return { candidates: [], rejected: [] };
  }

  const acceptedBypass: ValidatedMemoryCandidate[] = [];
  const rejected: RejectedMemoryCandidate[] = [];
  const candidatesForCritic: MemoryCandidate[] = [];
  const existingMemories = options.existingMemories ?? [];

  for (let index = 0; index < options.candidates.length; index += 1) {
    const candidate = options.candidates[index];
    if (!candidate) continue;
    const preReject = deterministicPreReject(candidate, existingMemories);
    if (preReject) {
      rejected.push(preReject);
    } else {
      candidatesForCritic.push(candidate);
    }
  }

  if (candidatesForCritic.length === 0) {
    return { candidates: acceptedBypass, rejected };
  }

  let parsed: CriticPayload | null = null;
  try {
    const response = await provider.generateResponse(
      buildValidationMessages({
        ...options,
        candidates: candidatesForCritic,
      }),
      { temperature: 0.1, maxTokens: 700 }
    );
    parsed = parseJsonPayload(response);
  } catch {
    return {
      candidates: acceptedBypass,
      rejected: [...rejected, ...malformedRejections(candidatesForCritic)],
    };
  }

  if (!parsed || !Array.isArray(parsed.results)) {
    return {
      candidates: acceptedBypass,
      rejected: [...rejected, ...malformedRejections(candidatesForCritic)],
    };
  }

  const resultByIndex = new Map<number, CriticResult>();
  for (const rawResult of parsed.results) {
    if (!rawResult || typeof rawResult !== "object") continue;
    const result = rawResult as CriticResult;
    if (!Number.isInteger(result.index)) continue;
    if (
      result.decision !== "approve" &&
      result.decision !== "auto_fix" &&
      result.decision !== "reject"
    ) {
      continue;
    }
    resultByIndex.set(result.index, result);
  }

  const accepted = [...acceptedBypass];
  for (let index = 0; index < candidatesForCritic.length; index += 1) {
    const candidate = candidatesForCritic[index];
    const result = resultByIndex.get(index);
    if (!candidate || !result) {
      rejected.push({
        originalText: candidate?.text ?? "",
        reasonCodes: ["validator_error", "malformed_text"],
      });
      continue;
    }
    const normalized = normalizeCriticResult(result, candidate);
    if ("validationStatus" in normalized) {
      accepted.push(normalized);
    } else {
      rejected.push(normalized);
    }
  }

  return { candidates: accepted, rejected };
}
