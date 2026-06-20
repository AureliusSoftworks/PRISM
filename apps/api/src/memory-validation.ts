import type { MemoryCandidate } from "./memory-extraction.ts";
import type { LlmProvider, ProviderMessage } from "./providers.ts";

export type MemoryValidationSource = "direct" | "inferred" | "compiled" | "about_you";
export type MemoryValidationScope = "bot" | "global";
export type MemoryValidationDecision = "approve" | "auto_fix" | "reject";

export type MemoryValidationReasonCode =
  | "subject_role_confusion"
  | "assistant_identity_instruction"
  | "task_request_not_memory"
  | "question_fragment"
  | "trailing_conversation_tag"
  | "lost_preference_payload"
  | "figurative_preference"
  | "implausible_literal"
  | "joke_without_stable_signal"
  | "contradiction"
  | "unsafe_judgment"
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
  userDisplayName?: string;
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

Memories must be durable, concise facts or preferences about the user.
For source="direct", write in second person ("You prefer...") or as "The user...".
For source="inferred", bot-perspective relationship impressions are allowed when phrased as calm observations (for example "Lara felt uneasy about the user's tone and wanted clearer boundaries.").

Return JSON only:
{"results":[{"index":0,"decision":"approve|auto_fix|reject","text":"...","confidence":0.0-1.0,"reasonCodes":["..."],"notes":"optional"}]}

Rules:
- Fix small grammar, typo, pronoun, and subject mistakes.
- If a candidate is really an instruction to the assistant, save it only as a user preference when the source explicitly asks to remember it.
- Review the raw user context for jokes, sarcasm, metaphors, and impossible literal claims before approving a memory.
- If a literal candidate is figurative but reveals a stable preference, rewrite it to the underlying preference and use reasonCodes ["figurative_preference"].
- If a joke has no stable user preference or fact, reject it with reasonCodes ["joke_without_stable_signal"].
- If a literal claim is implausible and no useful preference can be inferred, reject it with reasonCodes ["implausible_literal"].
- Reject one-off tasks, questions, ambiguous "you are" statements, malformed text, and low-confidence guesses.
- For source="compiled", reject whole assistant replies, instructions, code snippets, and multi-step answers instead of saving them as facts.
- Reject insulting, shaming, diagnosing, threatening, or punitive user labels and use reasonCodes ["unsafe_judgment"].
- If userDisplayName is provided and the memory is about the human user, write the final memory with that name (for example, "Jared prefers..."). If the memory is about a bot/persona, keep the existing second-person framing.
- Never invent new personal facts.
- Preserve the payload of favorites/preferences when merging or rewriting.`;

const TASK_LIKE_MEMORY_PATTERN =
  /^(?:please\s+)?(?:write|draft|compose|create|make|generate|summarize|summarise|explain|help|help\s+me|give\s+me|show\s+me|tell\s+me|find|search|look\s+up|translate|rewrite|edit|review|fix|debug|build|plan)\b/i;

const ASSISTANT_IDENTITY_COMMAND_PATTERN =
  /^(?:please\s+)?(?:do\s+not|don't|never)\s+refer\s+to\s+yourself\s+as\s+(?:an?\s+)?ai\b/i;

const USER_PREFERENCE_PATTERN =
  /^(?:you|the user)\s+(?:prefer|prefers|would like|want|wants|need|needs)\b/i;

const COMPILED_MEMORY_MAX_TEXT_LENGTH = 240;

const COMPILED_MEMORY_ANSWER_SHAPE_PATTERN =
  /(```|`[^`]+`|\b(?:in powershell|from (?:the )?(?:cli|console|terminal)|hit enter|run this|use this command|open explorer|here(?:'s| is) how|step \d+|first,|next,|finally,)\b|^\s*(?:to|if you want to|you can|use|run|open|click|select|type|enter)\s+)/i;

const UNSAFE_JUDGMENT_PATTERN =
  /\b(?:worthless|pathetic|disgusting|subhuman|idiot|moron|stupid|deranged|crazy|insane|psycho|hate\s+you|kill|harm|punish|ban(?:ned)?\s+you|never\s+talk\s+to\s+you)\b/i;

const VALID_REASON_CODES = new Set<MemoryValidationReasonCode>([
  "subject_role_confusion",
  "assistant_identity_instruction",
  "task_request_not_memory",
  "question_fragment",
  "trailing_conversation_tag",
  "lost_preference_payload",
  "figurative_preference",
  "implausible_literal",
  "joke_without_stable_signal",
  "contradiction",
  "unsafe_judgment",
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

function stripListPrefix(text: string): string {
  return text
    .replace(/^(?:[-*•\u2022]\s*)+/u, "")
    .replace(/^\d+[.):-]\s*/u, "")
    .trim();
}

function toSecondPersonVerb(verb: string): string {
  const lower = verb.toLowerCase();
  const irregular = new Map<string, string>([
    ["is", "are"],
    ["was", "were"],
    ["has", "have"],
    ["does", "do"],
  ]);
  const irregularMatch = irregular.get(lower);
  if (irregularMatch) return irregularMatch;
  if (lower.endsWith("ies") && lower.length > 3) {
    return `${lower.slice(0, -3)}y`;
  }
  if (/(ches|shes|sses|xes|zes|oes)$/.test(lower) && lower.length > 2) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith("s") && lower.length > 1) {
    return lower.slice(0, -1);
  }
  return lower;
}

function normalizeSecondPersonLead(text: string, singularSubject: boolean): string {
  if (!singularSubject) return text;
  const lead = text.match(
    /^You\s+(?:(always|usually|often|sometimes|generally|typically|currently|really)\s+)?([A-Za-z']+)(.*)$/u
  );
  if (!lead) return text;
  const adverb = lead[1] ? `${lead[1]} ` : "";
  const verb = toSecondPersonVerb(lead[2] ?? "");
  const rest = lead[3] ?? "";
  return `You ${adverb}${verb}${rest}`.replace(/\s+/g, " ").trim();
}

function looksLikeThirdPersonSingularVerb(word: string): boolean {
  const lower = word.toLowerCase();
  if (["is", "was", "has", "does"].includes(lower)) return true;
  return lower.endsWith("s");
}

function displayNameLeadPattern(displayName: string | undefined): RegExp | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  const firstName = trimmed.split(/\s+/)[0]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstName ? new RegExp(`^${firstName}\\b`, "iu") : null;
}

function canonicalizeMemoryPerspective(text: string, userDisplayName?: string): string {
  let normalized = stripListPrefix(normalizeWhitespace(text));
  if (!normalized) return normalized;

  const userNameLead = displayNameLeadPattern(userDisplayName);
  let singularSubject = false;
  let perspectiveRewritten = false;
  if (/^(?:the user|user)\b/i.test(normalized)) {
    normalized = normalized.replace(/^(?:the user|user)\b/i, "You");
    singularSubject = true;
    perspectiveRewritten = true;
  } else if (/^(?:he|she)\b/i.test(normalized)) {
    normalized = normalized.replace(/^(?:he|she)\b/i, "You");
    singularSubject = true;
    perspectiveRewritten = true;
  } else if (/^they\b/i.test(normalized)) {
    normalized = normalized.replace(/^they\b/i, "You");
    perspectiveRewritten = true;
  } else {
    const nameLead = normalized.match(
      /^([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,2})\s+([a-z][a-z'-]*)(.*)$/u
    );
    if (nameLead) {
      const name = (nameLead[1] ?? "").trim();
      const leadVerb = (nameLead[2] ?? "").trim();
      const reservedLead = /^(?:You|The|A|An|My|Your|I|We)$/u.test(name);
      if (userNameLead?.test(name)) {
        return normalized;
      }
      if (!reservedLead && looksLikeThirdPersonSingularVerb(leadVerb)) {
        normalized = `You ${nameLead[2] ?? ""}${nameLead[3] ?? ""}`
          .replace(/\s+/g, " ")
          .trim();
        singularSubject = true;
        perspectiveRewritten = true;
      }
    }
  }

  normalized = normalizeSecondPersonLead(normalized, singularSubject);
  if (perspectiveRewritten) {
    normalized = normalized
      .replace(/\bhis\b/gi, "your")
      .replace(/\bher\b/gi, "your")
      .replace(/\btheir\b/gi, "your")
      .replace(/\bhim\b/gi, "you")
      .replace(/\bthem\b/gi, "you");
  }
  return normalized;
}

export function normalizeMemoryDisplayText(text: string, userDisplayName?: string): string {
  return sentenceCase(canonicalizeMemoryPerspective(text, userDisplayName));
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
  if (
    /^you\s+(?:prefer|want)(?:\s+to)?\s+be\s+(?:called|referred\s+to\s+as)\s+.+$/.test(
      normalized
    )
  ) {
    return "preferred-name";
  }
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
  existingMemories: string[],
  source: MemoryValidationSource
): RejectedMemoryCandidate | null {
  const text = normalizeWhitespace(candidate.text);
  if (!text || text.length < 4) {
    return { originalText: candidate.text, reasonCodes: ["malformed_text"] };
  }
  if (
    source === "compiled" &&
    (text.length > COMPILED_MEMORY_MAX_TEXT_LENGTH ||
      COMPILED_MEMORY_ANSWER_SHAPE_PATTERN.test(text))
  ) {
    return { originalText: candidate.text, reasonCodes: ["task_request_not_memory"] };
  }
  if (source === "inferred" && UNSAFE_JUDGMENT_PATTERN.test(text)) {
    return { originalText: candidate.text, reasonCodes: ["unsafe_judgment"] };
  }
  if (TASK_LIKE_MEMORY_PATTERN.test(text)) {
    return { originalText: candidate.text, reasonCodes: ["task_request_not_memory"] };
  }
  if (contradictsExisting(candidate, existingMemories)) {
    return { originalText: candidate.text, reasonCodes: ["contradiction", "low_confidence"] };
  }
  return null;
}

function isCanonicalPreferredNameMemory(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^you\s+(?:prefer|want)(?:\s+to)?\s+be\s+(?:called|referred\s+to\s+as)\s+.+$/.test(
    normalized
  );
}

function deterministicPreApprove(
  candidate: MemoryCandidate,
  source: MemoryValidationSource,
  userDisplayName?: string
): ValidatedMemoryCandidate | null {
  if (
    source === "inferred" &&
    (candidate.category === "user" || candidate.category === "bot_relation") &&
    candidate.confidence <= 0.72
  ) {
    return {
      ...candidate,
      text:
        candidate.category === "user"
          ? normalizeMemoryDisplayText(candidate.text, userDisplayName)
          : sentenceCase(candidate.text),
      validationStatus: "approved",
      originalText: candidate.text,
      reasonCodes: [],
    };
  }
  if (source !== "direct" || candidate.confidence < 0.95) return null;
  const text = normalizeMemoryDisplayText(candidate.text, userDisplayName);
  if (!isCanonicalPreferredNameMemory(text)) return null;
  return {
    ...candidate,
    text,
    validationStatus: "approved",
    originalText: candidate.text,
    reasonCodes: [],
  };
}

function normalizeCriticResult(
  result: CriticResult,
  candidate: MemoryCandidate,
  userDisplayName?: string
): ValidatedMemoryCandidate | RejectedMemoryCandidate {
  const reasonCodes = reasonCodesFrom(result.reasonCodes);
  const rawText = typeof result.text === "string" ? result.text : candidate.text;
  const text = normalizeMemoryDisplayText(rawText, userDisplayName);
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
        userDisplayName: options.userDisplayName,
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
  auxiliaryProvider: LlmProvider,
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
    const preReject = deterministicPreReject(candidate, existingMemories, options.source);
    if (preReject) {
      rejected.push(preReject);
      continue;
    }
    const preApprove = deterministicPreApprove(
      candidate,
      options.source,
      options.userDisplayName
    );
    if (preApprove) {
      acceptedBypass.push(preApprove);
    } else {
      candidatesForCritic.push(candidate);
    }
  }

  if (candidatesForCritic.length === 0) {
    return { candidates: acceptedBypass, rejected };
  }

  let parsed: CriticPayload | null = null;
  try {
    const response = await auxiliaryProvider.generateResponse(
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
    const normalized = normalizeCriticResult(result, candidate, options.userDisplayName);
    if ("validationStatus" in normalized) {
      accepted.push(normalized);
    } else {
      rejected.push(normalized);
    }
  }

  return { candidates: accepted, rejected };
}
