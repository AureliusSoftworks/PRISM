import {
  stripDebateMysterySpeakerLabelV2,
  validateDebateMysteryStageCuePerformanceV1,
} from "@localai/shared";
import type { DebateMysteryStageCueV1 } from "@localai/shared";

/**
 * Play-time persona performance for the Prosecutor's own lines: a Talk
 * question or a Present prompt. The compiler stays the author of the mystery;
 * the runtime actor may only say the canonical line again in the chosen
 * Prosecutor's voice and idiom, keeping its subject and intent. Everything
 * here is pure so the rails can be pinned without a model in the room.
 */
export type DebateMysteryProsecutionLineKindV1 = "talk_question" | "present_prompt" | "press_question";

/** The deterministic press: quote the sworn words back and demand the rest. */
export function debateMysteryPressQuestionCanonicalTextV1(statementText: string): string {
  let statement = statementText.replace(/\s+/gu, " ").trim();
  if (statement.length >= 2) {
    const first = statement.at(0);
    const last = statement.at(-1);
    if ((first === "\"" && last === "\"") || (first === "“" && last === "”")) statement = statement.slice(1, -1).trim();
  }
  if (!/[.!?]$/u.test(statement)) statement = `${statement}.`;
  return `You said, "${statement}" Is that the whole of it, or is there something you left out?`;
}

export interface DebateMysteryProsecutionCueArgsV1 {
  kind: DebateMysteryProsecutionLineKindV1;
  lineId: string;
  canonicalText: string;
  /** The frozen performance mood of the line, e.g. "probing". */
  mood: string;
  suspectName: string;
  /** What the line is about: the Talk menu label, or the Case File item's title. */
  subjectLabel: string;
  /** Names the performance must keep: the victim, a suspect, a room, an item title. */
  subjectMentions: readonly string[];
  /** The two personas share explicit profile canon and already know each other. */
  familiar: boolean;
  /** Sealed spoilers, checked locally after generation and never sent to a provider. */
  forbiddenDisclosures: readonly string[];
  /** The player's counsel role word: "Prosecutor" by default, "Defense Attorney" in Defense stance. */
  roleLabel?: string;
}

/** Function words and speech verbs that never carry a question's subject. */
const PROSECUTION_KEYWORD_STOPWORDS_V1 = new Set([
  "about", "above", "after", "again", "against", "along", "already", "also", "always",
  "among", "another", "anyone", "anything", "around", "because", "been", "before",
  "being", "between", "both", "came", "come", "could", "does", "doing", "done", "down",
  "during", "each", "either", "else", "even", "ever", "every", "everyone", "everything",
  "from", "gave", "give", "given", "going", "gone", "have", "having", "hear", "heard",
  "here", "hers", "himself", "herself", "into", "itself", "just", "keep", "kept",
  "knew", "know", "known", "like", "look", "looked", "made", "make", "many", "maybe",
  "mean", "meant", "might", "mind", "more", "most", "much", "must", "myself", "need",
  "never", "nothing", "once", "only", "other", "ought", "over", "perhaps", "please",
  "quite", "rather", "really", "right", "said", "same", "says", "seem", "seemed",
  "seems", "shall", "should", "since", "some", "someone", "something", "still", "such",
  "sure", "take", "taken", "tell", "than", "that", "their", "theirs", "them", "then",
  "there", "these", "they", "thing", "things", "think", "this", "those", "though",
  "thought", "through", "told", "very", "want", "wanted", "well", "went", "were",
  "what", "when", "where", "whether", "which", "while", "whom", "whose", "will", "with",
  "within", "without", "would", "your", "yours", "yourself",
]);

function uniqueFragmentsV1(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const fragment = value.replace(/\s+/gu, " ").trim();
    const key = fragment.toLocaleLowerCase();
    if (!fragment || seen.has(key)) continue;
    seen.add(key);
    result.push(fragment);
  }
  return result;
}

/** A name and each of its longer words: "Avery Vale" also accepts "Avery" or "Vale". */
function nameFragmentsV1(name: string): string[] {
  const full = name.replace(/\s+/gu, " ").trim();
  if (!full) return [];
  const words = full.split(" ").filter((word) => word.replace(/[^\p{L}\p{N}]/gu, "").length >= 3);
  return words.length > 1 ? [full, ...words] : [full];
}

/**
 * The content words of a canonical line. A performance must keep at least one
 * of them (or a named subject), so a rewrite cannot drift onto another topic.
 */
export function debateMysteryProsecutionKeywordFragmentsV1(text: string): string[] {
  return uniqueFragmentsV1(
    (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [])
      .map((word) => word.replace(/['’-]+$/u, ""))
      .filter((word) => word.length >= 4 && !PROSECUTION_KEYWORD_STOPWORDS_V1.has(word.toLocaleLowerCase())),
  );
}

export function buildDebateMysteryProsecutionStageCueV1(
  args: DebateMysteryProsecutionCueArgsV1,
): DebateMysteryStageCueV1 {
  const canonicalText = args.canonicalText.replace(/\s+/gu, " ").trim();
  const mentions = uniqueFragmentsV1([
    ...args.subjectMentions.flatMap(nameFragmentsV1),
    ...debateMysteryProsecutionKeywordFragmentsV1(canonicalText),
  ]);
  const mood = args.mood.replace(/\s+/gu, " ").trim() || "probing";
  const roleLabel = args.roleLabel?.replace(/\s+/gu, " ").trim() || "Prosecutor";
  const objective = args.kind === "talk_question"
    ? `Ask ${args.suspectName} about ${args.subjectLabel} in this ${roleLabel}'s own voice and idiom. Keep the canonical question's subject and intent; add nothing to the case.`
    : args.kind === "press_question"
      ? `Press ${args.suspectName} on ${args.subjectLabel} in this ${roleLabel}'s own voice and idiom: challenge exactly the quoted words and demand the full account. Add nothing to the case.`
      : `Put ${args.subjectLabel} to ${args.suspectName} in this ${roleLabel}'s own voice and idiom, naming the item exactly. Keep the canonical line's intent; add nothing to the case.`;
  const exitCondition = args.kind === "talk_question"
    ? `Hand the floor to ${args.suspectName} for their answer.`
    : args.kind === "press_question"
      ? `Wait for ${args.suspectName} to answer the press.`
      : `Wait for ${args.suspectName}'s reaction to the item.`;
  return {
    version: 1,
    // The id keeps its persisted "prosecution" prefix in every stance.
    id: `stage-cue:prosecution:${args.kind}:${args.lineId}`,
    objective,
    emotionalState: `${mood}; ${
      args.familiar
        ? "speaks to someone they already know, without rehearsing that history"
        : "speaks to a stranger under investigation, without inventing familiarity"
    }.`,
    knownFactIds: ["canonical-line", "subject"],
    allowedFacts: [
      {
        id: "canonical-line",
        statement: canonicalText,
        mentionFragments: [],
        required: false,
      },
      {
        id: "subject",
        statement: `The line is about ${args.subjectLabel}.`,
        mentionFragments: mentions,
        required: mentions.length > 0,
      },
    ],
    requiredBeats: [],
    forbiddenDisclosures: uniqueFragmentsV1(args.forbiddenDisclosures),
    contradictionTrigger: null,
    exitCondition,
    deterministicFallbackText: canonicalText,
    maxCharacters: Math.min(320, Math.max(140, canonicalText.length * 2)),
  };
}

export interface DebateMysteryProsecutionPerformanceValidationV1 {
  valid: boolean;
  /** The cleaned performance: no speaker label, no leading stage direction, no wrapping quotes. */
  text: string;
  errors: string[];
  /** The actor handed the canonical line back unchanged; keep it, do not retry. */
  unchanged: boolean;
}

function looseTextV1(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function stripWrappingQuotesV1(value: string): string {
  const text = value.trim();
  if (text.length < 2) return text;
  const first = text.at(0);
  const last = text.at(-1);
  const matched =
    (first === "\"" && last === "\"") ||
    (first === "“" && last === "”") ||
    (first === "‘" && last === "’");
  return matched ? text.slice(1, -1).trim() : text;
}

/**
 * Accepts a performance only inside the cue's rails: it keeps a named subject
 * or a content word of the canonical line, discloses nothing sealed, stays
 * within length, and, for a Talk question, still asks a question. Labels and
 * stage directions a model likes to add are removed rather than rejected.
 */
export function validateDebateMysteryProsecutionPerformanceV1(args: {
  cue: DebateMysteryStageCueV1;
  kind: DebateMysteryProsecutionLineKindV1;
  text: string;
  canonicalText: string;
  speakerNames: readonly string[];
}): DebateMysteryProsecutionPerformanceValidationV1 {
  let text = stripDebateMysterySpeakerLabelV2(
    args.text.replace(/\s+/gu, " ").trim(),
    [...args.speakerNames, "Prosecutor", "Investigator", "Defense Attorney", "Defense", "Counsel"],
  );
  text = stripWrappingQuotesV1(text.replace(/^\*[^*]{1,160}\*\s*/u, "").trim());
  const errors: string[] = [];
  if (text.length < 6) errors.push("The performed line is too short.");
  if ((args.kind === "talk_question" || args.kind === "press_question") && !/\?["”’']?$/u.test(text)) {
    errors.push("The line must still end with a question mark.");
  }
  const shared = validateDebateMysteryStageCuePerformanceV1({ cue: args.cue, text });
  errors.push(...shared.errors);
  const unchanged = looseTextV1(text) === looseTextV1(args.canonicalText);
  return {
    valid: errors.length === 0 && !unchanged,
    text: shared.normalizedText || text,
    errors: unchanged ? [...errors, "The performance repeats the canonical line."] : errors,
    unchanged,
  };
}
