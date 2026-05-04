import type { DatabaseSync } from "node:sqlite";
import type { UserMemory } from "@localai/shared";
import type { LlmProvider } from "./providers.ts";
import { decryptJson } from "./security.ts";
import { deleteMemoryById, restoreMemory } from "./memory.ts";
import { validateMemoryCandidates } from "./memory-validation.ts";

type DirectMemoryRow = {
  id: string;
  conversation_id: string | null;
  bot_id: string | null;
  confidence: number;
  source: "direct";
  certainty: number | null;
  source_message_ids: string;
  ciphertext: string;
  iv: string;
  tag: string;
  created_at: string;
};

type InferenceMerge = {
  text: string;
  parentIndices: number[];
  certainty: number;
};

type InferenceResponse = {
  merges?: unknown;
};

type DirectMemoryCandidate = {
  row: DirectMemoryRow;
  text: string;
  sourceMessageIds: string[];
};

type ValidatedInferenceMerge = {
  text: string;
  parents: DirectMemoryCandidate[];
  certainty: number;
};

type EquivalenceMemory = {
  left: string;
  verb: "is" | "are";
  right: string;
};

type FavoriteMemoryFact = {
  subject: string;
  descriptor: string;
};

type PreferenceMemoryFact = {
  verb: string;
  object: string;
};

const INFERENCE_LOOKBACK_LIMIT = 12;
const INFERENCE_MIN_PARENT_COUNT = 2;
const INFERENCE_MIN_CERTAINTY = 0.78;
const TASK_LIKE_MEMORY_PATTERN =
  /^(?:please\s+)?(?:write|draft|compose|create|make|generate|summarize|summarise|explain|help|help\s+me|give\s+me|show\s+me|tell\s+me|find|search|look\s+up|translate|rewrite|edit|review|fix|debug|build|plan)\b/i;

const MEMORY_INFERENCE_PROMPT = `You are a memory analyst. Below are statements someone wrote about themselves. Identify groups that can be combined into ONE more specific fact through simple deduction. Only merge when the combined fact is logically implied (not just thematically related) and you are at least 78% confident.

Output JSON only. No prose.
- No valid merges: {"merges": []}
- One or more merges: {"merges": [{"text": "...", "parentIndices": [1, 2], "certainty": 0.0-1.0}]}
- Preserve the durable personal fact from the parent memories. Do not reduce a merge to only a synonym/equivalence if the parents also say what the user likes, prefers, or considers favorite.

Examples:
- ["Your favorite instrument has black and white keys.", "You like to play the piano."]
  -> {"merges":[{"text":"Your favorite instrument is the piano.","parentIndices":[1,2],"certainty":0.92}]}
- ["Potatoes are your favorite.", "Spuds are your favorite."]
  -> {"merges":[{"text":"Potatoes are spuds, and they are your favorite.","parentIndices":[1,2],"certainty":0.9}]}
- ["You like cheese.", "Your favorite color is blue."]
  -> {"merges":[]}`;

function parseSourceMessageIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function parseJsonPayload(raw: string): InferenceResponse | null {
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
    const parsed = JSON.parse(payload) as InferenceResponse;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeMerge(candidate: unknown): InferenceMerge | null {
  if (!candidate || typeof candidate !== "object") return null;
  const raw = candidate as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  const parentIndices = Array.isArray(raw.parentIndices)
    ? raw.parentIndices.filter((value): value is number => Number.isInteger(value))
    : [];
  const certainty = typeof raw.certainty === "number" && Number.isFinite(raw.certainty)
    ? Math.max(0, Math.min(1, raw.certainty))
    : 0;

  if (!text || parentIndices.length < INFERENCE_MIN_PARENT_COUNT) return null;
  if (certainty < INFERENCE_MIN_CERTAINTY) return null;
  return { text, parentIndices, certainty };
}

function loadDirectMemoryCandidates(
  db: DatabaseSync,
  userId: string,
  botId: string,
  userKey: Buffer
): DirectMemoryCandidate[] {
  const rows = db.prepare(`
    SELECT id, conversation_id, bot_id, confidence, source, certainty, source_message_ids, ciphertext, iv, tag, created_at
    FROM memories
    WHERE user_id = ? AND bot_id = ? AND source = 'direct'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, botId, INFERENCE_LOOKBACK_LIMIT) as DirectMemoryRow[];

  return rows.map((row) => {
    const payload = decryptJson(
      {
        ciphertext: row.ciphertext,
        iv: row.iv,
        tag: row.tag,
      },
      userKey
    ) as { text?: string };

    return {
      row,
      text: payload.text ?? "",
      sourceMessageIds: parseSourceMessageIds(row.source_message_ids),
    };
  }).filter((candidate) => candidate.text.trim().length > 0);
}

function buildInferenceRequest(candidates: DirectMemoryCandidate[]): string {
  const numberedMemories = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.text}`)
    .join("\n");
  return `[Direct memories]\n${numberedMemories}`;
}

function sourceMessageIdUnion(candidates: DirectMemoryCandidate[]): string[] {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    for (const id of candidate.sourceMessageIds) {
      const trimmed = id.trim();
      if (trimmed) ids.add(trimmed);
    }
  }
  return [...ids];
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(text: string): string {
  const trimmed = text.trim().replace(/[.!?]+$/, "");
  if (!trimmed) return "";
  return `${trimmed[0]?.toUpperCase()}${trimmed.slice(1)}.`;
}

function parseFavoriteMemory(text: string): FavoriteMemoryFact | null {
  const normalized = normalizeForComparison(text);
  const match = normalized.match(
    /^(.+?)\s+(?:is|are)\s+your\s+favorite(?:\s+(.+))?$/
  );
  const subject = match?.[1]?.trim();
  if (!subject) return null;
  return {
    subject,
    descriptor: match?.[2]?.trim() ?? "",
  };
}

function parsePreferenceMemory(text: string): PreferenceMemoryFact | null {
  const normalized = normalizeForComparison(text);
  const match = normalized.match(
    /^(?:you|your)\s+(dislike|dislikes|hate|hates|avoid|avoids|like|likes|love|loves|prefer|prefers|want|wants|need|needs|use|uses)\s+(.+)$/
  );
  const verb = match?.[1]?.trim();
  const object = match?.[2]?.trim();
  if (!verb || !object) return null;
  return { verb, object };
}

function preferenceFacts(parents: DirectMemoryCandidate[]): PreferenceMemoryFact[] {
  return parents
    .map((parent) => parsePreferenceMemory(parent.text))
    .filter((fact): fact is PreferenceMemoryFact => fact !== null);
}

function isTaskLikeMemory(text: string): boolean {
  return TASK_LIKE_MEMORY_PATTERN.test(text.trim());
}

function taskMergeWouldDropPreferencePayload(
  mergeText: string,
  parents: DirectMemoryCandidate[]
): boolean {
  return isTaskLikeMemory(mergeText) && preferenceFacts(parents).length > 0;
}

function parseEquivalenceMemory(text: string): EquivalenceMemory | null {
  const normalized = normalizeForComparison(text);
  const match = normalized.match(/^(.+?)\s+(is|are)\s+(.+)$/);
  const left = match?.[1]?.trim();
  const verb = match?.[2];
  const right = match?.[3]?.trim();
  if (!left || !right) return null;
  if (right.includes("your favorite")) return null;
  return {
    left,
    verb: verb === "is" ? "is" : "are",
    right,
  };
}

function favoriteFacts(parents: DirectMemoryCandidate[]): FavoriteMemoryFact[] {
  return parents
    .map((parent) => parseFavoriteMemory(parent.text))
    .filter((fact): fact is FavoriteMemoryFact => fact !== null);
}

function favoriteFactForSubject(
  parents: DirectMemoryCandidate[],
  subject: string
): FavoriteMemoryFact | null {
  const normalizedSubject = normalizeForComparison(subject);
  return favoriteFacts(parents).find((fact) => fact.subject === normalizedSubject) ?? null;
}

function favoritePhrase(descriptor: string): string {
  return descriptor ? `your favorite ${descriptor}` : "your favorite";
}

function preserveFavoritePayload(
  mergeText: string,
  parents: DirectMemoryCandidate[]
): string {
  const equivalence = parseEquivalenceMemory(mergeText);
  if (!equivalence) return mergeText;

  const leftFact = favoriteFactForSubject(parents, equivalence.left);
  const rightFact = favoriteFactForSubject(parents, equivalence.right);
  if (!leftFact || !rightFact || leftFact.descriptor !== rightFact.descriptor) {
    return mergeText;
  }

  const pronoun = equivalence.verb === "is" ? "it is" : "they are";
  return sentenceCase(
    `${equivalence.left} ${equivalence.verb} ${equivalence.right}, and ${pronoun} ${favoritePhrase(leftFact.descriptor)}`
  );
}

function mergePreservesFavoritePayload(
  mergeText: string,
  parents: DirectMemoryCandidate[]
): boolean {
  const facts = favoriteFacts(parents);
  const subjects = new Set(facts.map((fact) => fact.subject));
  if (subjects.size < 2) return true;

  const descriptors = new Set(facts.map((fact) => fact.descriptor));
  if (descriptors.size !== 1) return false;

  const normalizedMerge = normalizeForComparison(mergeText);
  const descriptor = facts[0]?.descriptor ?? "";
  if (!normalizedMerge.includes(favoritePhrase(descriptor))) return false;

  return [...subjects].every((subject) => normalizedMerge.includes(subject));
}

/**
 * Runs a conservative, on-demand LLM synthesis pass for one bot's direct memories.
 * Intended for the Memories panel open path so inference cost is paid only when
 * the user is about to inspect the result.
 */
export async function inferAndStoreBotMemories(
  db: DatabaseSync,
  auxiliaryProvider: LlmProvider,
  userId: string,
  botId: string,
  userKey: Buffer
): Promise<UserMemory[]> {
  const candidates = loadDirectMemoryCandidates(db, userId, botId, userKey);
  if (candidates.length < INFERENCE_MIN_PARENT_COUNT) return [];

  const response = await auxiliaryProvider.generateResponse([
    { role: "system", content: MEMORY_INFERENCE_PROMPT },
    { role: "user", content: buildInferenceRequest(candidates) },
  ]);
  const parsed = parseJsonPayload(response);
  if (!parsed || !Array.isArray(parsed.merges)) return [];

  const merges = parsed.merges
    .map(normalizeMerge)
    .filter((merge): merge is InferenceMerge => merge !== null);
  if (merges.length === 0) return [];

  const created: UserMemory[] = [];
  const consumedParentIds = new Set<string>();
  const validatedMerges: ValidatedInferenceMerge[] = [];

  for (const merge of merges) {
    const parents = merge.parentIndices
      .map((index) => candidates[index - 1])
      .filter((candidate): candidate is DirectMemoryCandidate => candidate !== undefined);
    if (parents.length !== merge.parentIndices.length) continue;
    if (parents.some((parent) => consumedParentIds.has(parent.row.id))) continue;
    const inferredText = preserveFavoritePayload(merge.text, parents);
    if (!mergePreservesFavoritePayload(inferredText, parents)) continue;
    if (taskMergeWouldDropPreferencePayload(inferredText, parents)) continue;

    const validation = await validateMemoryCandidates(auxiliaryProvider, {
      source: "inferred",
      scope: "bot",
      rawContext: `[Parent memories]\n${parents.map((parent) => `- ${parent.text}`).join("\n")}`,
      candidates: [{ text: inferredText, confidence: merge.certainty }],
      existingMemories: candidates.map((candidate) => candidate.text),
    });
    const [validated] = validation.candidates;
    if (!validated) continue;
    validatedMerges.push({
      text: validated.text,
      parents,
      certainty: validated.confidence,
    });
    for (const parent of parents) {
      consumedParentIds.add(parent.row.id);
    }
  }

  if (validatedMerges.length === 0) return [];
  consumedParentIds.clear();

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    for (const merge of validatedMerges) {
      const parents = merge.parents;
      if (parents.some((parent) => consumedParentIds.has(parent.row.id))) continue;

      const inferred = await restoreMemory(db, userId, userKey, {
        conversationId: parents[0]?.row.conversation_id ?? null,
        botId,
        text: merge.text,
        confidence: merge.certainty,
        source: "inferred",
        certainty: merge.certainty,
        sourceMessageIds: sourceMessageIdUnion(parents),
      });
      for (const parent of parents) {
        deleteMemoryById(db, userId, parent.row.id);
        consumedParentIds.add(parent.row.id);
      }
      created.push(inferred);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return created;
}
