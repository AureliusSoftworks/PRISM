/**
 * Stage Action Director — deterministic `*action*` planning for Coffee, Signal, and Zen.
 *
 * Plans before the existing speaker call (80% Director / 20% persona invite),
 * never issues a model request of its own, and validates one short third-person beat.
 */

export const STAGE_ACTION_PLAN_VERSION = 1 as const;
export const STAGE_ACTION_VERSION = 1 as const;
export const STAGE_ACTION_PERSONA_INVITE_CHANCE = 0.2;
export const STAGE_ACTION_MIN_WORDS = 2;
export const STAGE_ACTION_MAX_WORDS = 8;
export const STAGE_ACTION_MAX_CHARS = 80;
export const STAGE_ACTION_RECENT_LIMIT = 8;

export type StageActionLaneV1 = "coffee" | "signal" | "zen";
export type StageActionSourceV1 = "director" | "llm" | "power";
export type StageActionCategoryV1 =
  | "neutral"
  | "warm"
  | "judgemental"
  | "guarded"
  | "restless"
  | "cup"
  | "gesture"
  | "power";

export type StageActionMoodHintV1 =
  | "neutral"
  | "warm"
  | "joyful"
  | "guarded"
  | "strained"
  | "amused"
  | "stern"
  | "attentive"
  | "waiting"
  | "confused";

export type StageActionExclusionV1 =
  | "player_authored"
  | "producer_authored"
  | "social_silence"
  | "crosstalk_reclaim"
  | "power_silence"
  | "power_interruption"
  | "canonical_silence"
  | "kickoff"
  | "opening"
  | "closing"
  | "poll"
  | "departure"
  | "required_wrap"
  | "direct_player_obligation"
  | "producer_control"
  | "listener_reaction"
  | "live_action_owned";

export type StageActionPlanV1 =
  | {
      v: typeof STAGE_ACTION_PLAN_VERSION;
      decision: "excluded";
      reason: StageActionExclusionV1;
      seed: string;
    }
  | {
      v: typeof STAGE_ACTION_PLAN_VERSION;
      decision: "director";
      seed: string;
      invitePersona: false;
    }
  | {
      v: typeof STAGE_ACTION_PLAN_VERSION;
      decision: "persona_invite";
      seed: string;
      invitePersona: true;
    };

export interface StageActionV1 {
  v: typeof STAGE_ACTION_VERSION;
  name: "stageAction";
  source: StageActionSourceV1;
  category: StageActionCategoryV1;
  action: string;
  seed: string;
  lane: StageActionLaneV1;
}

export interface CoffeeStageActionPayload {
  v: 1;
  name: "coffeeStageAction";
  source: StageActionSourceV1;
  category: StageActionCategoryV1;
  action: string;
  seed: string;
}

export interface ZenStageActionPayload {
  v: 1;
  name: "zenStageAction";
  source: StageActionSourceV1;
  category: StageActionCategoryV1;
  action: string;
  seed: string;
}

interface WeightedStageActionEntry {
  category: StageActionCategoryV1;
  action: string;
  weight: number;
}

const NEUTRAL_ACTIONS: readonly WeightedStageActionEntry[] = [
  { category: "neutral", action: "tilts their head", weight: 3 },
  { category: "neutral", action: "shifts in their seat", weight: 2 },
  { category: "neutral", action: "glances aside briefly", weight: 2 },
  { category: "neutral", action: "straightens slightly", weight: 2 },
  { category: "neutral", action: "lets a beat pass", weight: 1 },
  { category: "cup", action: "turns the cup once", weight: 1 },
  { category: "cup", action: "nudges the cup closer", weight: 1 },
] as const;

const WARM_ACTIONS: readonly WeightedStageActionEntry[] = [
  { category: "warm", action: "softens their expression", weight: 3 },
  { category: "warm", action: "offers a small smile", weight: 3 },
  { category: "warm", action: "leans in a little", weight: 2 },
  { category: "warm", action: "nods with patience", weight: 2 },
  { category: "warm", action: "settles more comfortably", weight: 1 },
] as const;

const JUDGEMENTAL_ACTIONS: readonly WeightedStageActionEntry[] = [
  { category: "judgemental", action: "raises an eyebrow", weight: 4 },
  { category: "judgemental", action: "narrows their eyes", weight: 3 },
  { category: "judgemental", action: "gives a pointed look", weight: 3 },
  { category: "judgemental", action: "judges the table in silence", weight: 2 },
  { category: "judgemental", action: "stifles a scoff", weight: 2 },
  { category: "judgemental", action: "presses their lips thin", weight: 2 },
] as const;

const GUARDED_ACTIONS: readonly WeightedStageActionEntry[] = [
  { category: "guarded", action: "folds their arms", weight: 3 },
  { category: "guarded", action: "holds still a moment", weight: 2 },
  { category: "guarded", action: "keeps their face even", weight: 2 },
  { category: "guarded", action: "pulls back slightly", weight: 2 },
  { category: "guarded", action: "watches without committing", weight: 1 },
] as const;

const RESTLESS_ACTIONS: readonly WeightedStageActionEntry[] = [
  { category: "restless", action: "drums their fingers once", weight: 3 },
  { category: "restless", action: "shifts their weight", weight: 2 },
  { category: "restless", action: "glances toward the door", weight: 2 },
  { category: "restless", action: "taps the table lightly", weight: 2 },
  { category: "restless", action: "rolls a shoulder", weight: 1 },
] as const;

const STAGE_ACTION_BLOCK_RE = /\*+([^*\n]+?)\*+/u;
const LEADING_STAGE_ACTION_RE = /^\s*\*+([^*\n]+?)\*+\s*/u;
const THIRD_PERSON_VERB_RE = /^[a-z]+(?:s|es|ies)\b/iu;
const FIRST_PERSON_RE = /^(?:i|i'm|im|i've|id|i'd)\b/iu;
const ING_START_RE = /^[a-z]+ing\b/iu;

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function wordCount(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}

function normalizeParticipantName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Full names plus short tokens so "on Ian" matches "Identity Crisis Ian". */
function participantNameBanList(value: string): string[] {
  const normalized = normalizeParticipantName(value);
  if (!normalized) return [];
  const tokens = normalized
    .split(/\s+/u)
    .filter(
      (token) =>
        token.length >= 3 &&
        !/^(?:a|an|the|and|or|of|for|to|from|with|bot|host|guest)$/u.test(token),
    );
  return [...new Set([normalized, ...tokens])];
}

/**
 * Replay-stable pre-generation plan. Call after speaker selection and exclusions,
 * before building the speaker prompt for the existing generation chain.
 */
export function planStageActionV1(args: {
  lane: StageActionLaneV1;
  seed: string;
  exclusions?: readonly StageActionExclusionV1[];
  personaInviteChance?: number;
}): StageActionPlanV1 {
  const seed = normalizeWhitespace(args.seed).slice(0, 160);
  const exclusion = args.exclusions?.find(Boolean);
  if (!seed) {
    return {
      v: STAGE_ACTION_PLAN_VERSION,
      decision: "excluded",
      reason: exclusion ?? "canonical_silence",
      seed: "",
    };
  }
  if (exclusion) {
    return {
      v: STAGE_ACTION_PLAN_VERSION,
      decision: "excluded",
      reason: exclusion,
      seed,
    };
  }
  const chance = Math.max(
    0,
    Math.min(1, args.personaInviteChance ?? STAGE_ACTION_PERSONA_INVITE_CHANCE),
  );
  if (stableUnit(`${seed}:persona-invite`) < chance) {
    return {
      v: STAGE_ACTION_PLAN_VERSION,
      decision: "persona_invite",
      seed,
      invitePersona: true,
    };
  }
  return {
    v: STAGE_ACTION_PLAN_VERSION,
    decision: "director",
    seed,
    invitePersona: false,
  };
}

function poolForMood(
  moodHint: StageActionMoodHintV1 | null | undefined,
): readonly WeightedStageActionEntry[] {
  switch (moodHint) {
    case "warm":
    case "joyful":
    case "amused":
      return [...WARM_ACTIONS, ...NEUTRAL_ACTIONS];
    case "guarded":
    case "stern":
      return [...GUARDED_ACTIONS, ...JUDGEMENTAL_ACTIONS, ...NEUTRAL_ACTIONS];
    case "strained":
    case "confused":
      return [...RESTLESS_ACTIONS, ...GUARDED_ACTIONS, ...NEUTRAL_ACTIONS];
    case "attentive":
    case "waiting":
    case "neutral":
    default:
      return [
        ...NEUTRAL_ACTIONS,
        ...JUDGEMENTAL_ACTIONS,
        ...WARM_ACTIONS,
        ...RESTLESS_ACTIONS,
      ];
  }
}

function laneAllowsCupActions(lane: StageActionLaneV1): boolean {
  return lane === "coffee";
}

/**
 * Selects one deterministic scripted action, skipping recent repeats when possible.
 */
export function selectScriptedStageActionV1(args: {
  lane: StageActionLaneV1;
  seed: string;
  moodHint?: StageActionMoodHintV1 | null;
  recentActions?: readonly string[];
  allowCupActions?: boolean;
  source?: Exclude<StageActionSourceV1, "llm">;
  categoryOverride?: StageActionCategoryV1;
  actionOverride?: string;
}): StageActionV1 | null {
  const seed = normalizeWhitespace(args.seed).slice(0, 160);
  if (!seed) return null;

  if (args.actionOverride) {
    const validated = validateStageActionTextV1({
      action: args.actionOverride,
      lane: args.lane,
    });
    if (!validated) return null;
    return {
      v: STAGE_ACTION_VERSION,
      name: "stageAction",
      source: args.source ?? "power",
      category: args.categoryOverride ?? "power",
      action: validated,
      seed,
      lane: args.lane,
    };
  }

  const allowCup = args.allowCupActions ?? laneAllowsCupActions(args.lane);
  const pool = poolForMood(args.moodHint).filter((entry) => {
    if (entry.category === "cup" && !allowCup) return false;
    return true;
  });
  if (pool.length === 0) return null;

  const recent = new Set(
    (args.recentActions ?? [])
      .map((action) => normalizeWhitespace(action).toLocaleLowerCase())
      .filter(Boolean)
      .slice(0, STAGE_ACTION_RECENT_LIMIT),
  );
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  const target = stableUnit(`${seed}:director-action`) * totalWeight;
  let cursor = 0;
  let startIndex = 0;
  for (let index = 0; index < pool.length; index += 1) {
    cursor += pool[index]!.weight;
    if (cursor >= target) {
      startIndex = index;
      break;
    }
  }

  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(startIndex + offset) % pool.length]!;
    if (recent.has(candidate.action.toLocaleLowerCase())) continue;
    return {
      v: STAGE_ACTION_VERSION,
      name: "stageAction",
      source: args.source ?? "director",
      category: candidate.category,
      action: candidate.action,
      seed,
      lane: args.lane,
    };
  }

  const fallback = pool[startIndex]!;
  return {
    v: STAGE_ACTION_VERSION,
    name: "stageAction",
    source: args.source ?? "director",
    category: fallback.category,
    action: fallback.action,
    seed,
    lane: args.lane,
  };
}

/**
 * Validates one short third-person stage action. Rejects spoken lines, first-person
 * narration, and current-participant/user names. Proper nouns for established
 * companions/props (e.g. Rupert) are allowed.
 */
export function validateStageActionTextV1(args: {
  action: string;
  lane: StageActionLaneV1;
  participantNames?: readonly string[];
  userDisplayName?: string | null;
}): string | null {
  let action = normalizeWhitespace(args.action);
  action = action.replace(/^\*+|\*+$/gu, "").trim();
  action = action.replace(/[.!?\u2026;:,]+$/u, "").trim();
  if (!action || action.length > STAGE_ACTION_MAX_CHARS) return null;
  const words = wordCount(action);
  if (words < STAGE_ACTION_MIN_WORDS || words > STAGE_ACTION_MAX_WORDS) return null;
  if (FIRST_PERSON_RE.test(action) || ING_START_RE.test(action)) return null;
  if (!THIRD_PERSON_VERB_RE.test(action)) return null;
  if (/["""'''「」]/u.test(action)) return null;

  const banned = new Set<string>();
  for (const name of args.participantNames ?? []) {
    for (const token of participantNameBanList(name)) banned.add(token);
  }
  for (const token of participantNameBanList(args.userDisplayName ?? "")) {
    banned.add(token);
  }

  if (banned.size > 0) {
    const lowered = normalizeParticipantName(action);
    for (const name of banned) {
      if (!name) continue;
      if (
        lowered === name ||
        lowered.startsWith(`${name} `) ||
        lowered.endsWith(` ${name}`) ||
        lowered.includes(` ${name} `)
      ) {
        return null;
      }
    }
  }

  return action;
}

export function replyAlreadyHasStageAction(text: string): boolean {
  return STAGE_ACTION_BLOCK_RE.test(text);
}

/**
 * Extracts the first leading physical `*action*` and returns the remaining spoken text.
 */
export function extractLeadingStageActionV1(args: {
  text: string;
  lane: StageActionLaneV1;
  participantNames?: readonly string[];
  userDisplayName?: string | null;
}): { action: string; spokenText: string } | null {
  const raw = typeof args.text === "string" ? args.text : "";
  const match = raw.match(LEADING_STAGE_ACTION_RE);
  if (!match) return null;
  const action = validateStageActionTextV1({
    action: match[1] ?? "",
    lane: args.lane,
    participantNames: args.participantNames,
    userDisplayName: args.userDisplayName,
  });
  if (!action) return null;
  const spokenText = normalizeWhitespace(raw.slice(match[0].length));
  return { action, spokenText };
}

/**
 * Extracts the first valid `*action*` anywhere in the reply and strips all stage-action blocks
 * from the spoken remainder. Prefer leading extraction when the prompt asks for a leading beat.
 */
export function extractAndStripStageActionV1(args: {
  text: string;
  lane: StageActionLaneV1;
  participantNames?: readonly string[];
  userDisplayName?: string | null;
}): { action: string | null; spokenText: string } {
  const raw = typeof args.text === "string" ? args.text : "";
  const leading = extractLeadingStageActionV1(args);
  if (leading) {
    return {
      action: leading.action,
      spokenText: leading.spokenText,
    };
  }

  let firstValid: string | null = null;
  const spokenText = normalizeWhitespace(
    raw.replace(new RegExp(STAGE_ACTION_BLOCK_RE.source, "gu"), (full, inner) => {
      if (firstValid) return " ";
      const validated = validateStageActionTextV1({
        action: String(inner ?? ""),
        lane: args.lane,
        participantNames: args.participantNames,
        userDisplayName: args.userDisplayName,
      });
      if (validated) {
        firstValid = validated;
        return " ";
      }
      return full;
    }),
  );
  return { action: firstValid, spokenText };
}

export function stageActionSpeechOnlyPromptV1(lane: StageActionLaneV1): string {
  const laneLabel =
    lane === "coffee" ? "Coffee" : lane === "signal" ? "Signal" : "Zen";
  return [
    `${laneLabel} stage-direction format for this turn:`,
    "Write spoken words only. Do not wrap gestures, expressions, or body language in asterisks.",
    "Do not open with a `*action*`. Ordinary emphasis must stay as plain words.",
  ].join("\n");
}

export function stageActionPersonaInvitePromptV1(lane: StageActionLaneV1): string {
  const laneLabel =
    lane === "coffee" ? "Coffee" : lane === "signal" ? "Signal" : "Zen";
  const namingRule =
    lane === "coffee"
      ? "Do not name another current table participant or the user inside the action; established personal companions or signature props from your own persona are allowed."
      : lane === "signal"
        ? "Do not name yourself, your co-host, or the player inside the action; keep the beat short, physical, and self-contained."
        : "You may address the user as `you` when it fits a simple presence beat.";
  return [
    `${laneLabel} stage-direction format for this invited turn:`,
    "Prefer opening with one short 2-8 word third-person `*action*` that uses your unique body, wardrobe, signature objects, or established companions, then the spoken line.",
    "Example shape: `*taps a claw on the table* That is optimistic.` Keep the action brief and self-contained.",
    "Every action must begin with a third-person present verb ending in `s` (not `I`, not an `-ing` form).",
    namingRule,
    "Do not invent impossible anatomy or wardrobe. Do not use asterisks for ordinary spoken emphasis.",
  ].join("\n");
}

export function formatStageActionDisplayText(action: string): string {
  const normalized = normalizeWhitespace(action).replace(/^\*+|\*+$/gu, "").trim();
  return normalized ? `*${normalized}*` : "";
}

export function normalizeStageActionV1(value: unknown): StageActionV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== STAGE_ACTION_VERSION || row.name !== "stageAction") return null;
  const source =
    row.source === "director" || row.source === "llm" || row.source === "power"
      ? row.source
      : null;
  const category =
    row.category === "neutral" ||
    row.category === "warm" ||
    row.category === "judgemental" ||
    row.category === "guarded" ||
    row.category === "restless" ||
    row.category === "cup" ||
    row.category === "gesture" ||
    row.category === "power"
      ? row.category
      : null;
  const lane =
    row.lane === "coffee" || row.lane === "signal" || row.lane === "zen"
      ? row.lane
      : null;
  const action =
    typeof row.action === "string" ? normalizeWhitespace(row.action) : "";
  const seed = typeof row.seed === "string" ? normalizeWhitespace(row.seed).slice(0, 160) : "";
  if (!source || !category || !lane || !action || action.length > STAGE_ACTION_MAX_CHARS || !seed) {
    return null;
  }
  return {
    v: STAGE_ACTION_VERSION,
    name: "stageAction",
    source,
    category,
    action,
    seed,
    lane,
  };
}

export function normalizeCoffeeStageActionPayload(
  value: unknown,
): CoffeeStageActionPayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || row.name !== "coffeeStageAction") return undefined;
  const source =
    row.source === "director" || row.source === "llm" || row.source === "power"
      ? row.source
      : null;
  const category =
    row.category === "neutral" ||
    row.category === "warm" ||
    row.category === "judgemental" ||
    row.category === "guarded" ||
    row.category === "restless" ||
    row.category === "cup" ||
    row.category === "gesture" ||
    row.category === "power"
      ? row.category
      : null;
  const action =
    typeof row.action === "string" ? normalizeWhitespace(row.action) : "";
  const seed = typeof row.seed === "string" ? normalizeWhitespace(row.seed).slice(0, 160) : "";
  if (!source || !category || !action || action.length > STAGE_ACTION_MAX_CHARS || !seed) {
    return undefined;
  }
  return {
    v: 1,
    name: "coffeeStageAction",
    source,
    category,
    action,
    seed,
  };
}

export function normalizeZenStageActionPayload(
  value: unknown,
): ZenStageActionPayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || row.name !== "zenStageAction") return undefined;
  const source =
    row.source === "director" || row.source === "llm" || row.source === "power"
      ? row.source
      : null;
  const category =
    row.category === "neutral" ||
    row.category === "warm" ||
    row.category === "judgemental" ||
    row.category === "guarded" ||
    row.category === "restless" ||
    row.category === "cup" ||
    row.category === "gesture" ||
    row.category === "power"
      ? row.category
      : null;
  const action =
    typeof row.action === "string" ? normalizeWhitespace(row.action) : "";
  const seed = typeof row.seed === "string" ? normalizeWhitespace(row.seed).slice(0, 160) : "";
  if (!source || !category || !action || action.length > STAGE_ACTION_MAX_CHARS || !seed) {
    return undefined;
  }
  return {
    v: 1,
    name: "zenStageAction",
    source,
    category,
    action,
    seed,
  };
}

export function coffeeStageActionFromStageAction(
  action: StageActionV1,
): CoffeeStageActionPayload {
  return {
    v: 1,
    name: "coffeeStageAction",
    source: action.source,
    category: action.category,
    action: action.action,
    seed: action.seed,
  };
}

export function zenStageActionFromStageAction(
  action: StageActionV1,
): ZenStageActionPayload {
  return {
    v: 1,
    name: "zenStageAction",
    source: action.source,
    category: action.category,
    action: action.action,
    seed: action.seed,
  };
}

/**
 * Resolves the final action after generation: keep a valid model action when present,
 * otherwise fill from the Director when the plan was eligible.
 */
export function resolveFinalStageActionV1(args: {
  plan: StageActionPlanV1;
  lane: StageActionLaneV1;
  replyText: string;
  moodHint?: StageActionMoodHintV1 | null;
  recentActions?: readonly string[];
  participantNames?: readonly string[];
  userDisplayName?: string | null;
  allowCupActions?: boolean;
  postGenerationExclusions?: readonly StageActionExclusionV1[];
  powerAction?: { cue: string; frequency?: "occasional" | "frequent" } | null;
}): { action: StageActionV1 | null; spokenText: string } {
  const postExclusion = args.postGenerationExclusions?.find(Boolean);
  if (args.plan.decision === "excluded" || postExclusion) {
    const stripped = extractAndStripStageActionV1({
      text: args.replyText,
      lane: args.lane,
      participantNames: args.participantNames,
      userDisplayName: args.userDisplayName,
    });
    return {
      action: null,
      spokenText: stripped.spokenText || normalizeWhitespace(args.replyText),
    };
  }

  if (args.powerAction?.cue) {
    const power = selectScriptedStageActionV1({
      lane: args.lane,
      seed: `${args.plan.seed}:power-action`,
      actionOverride: args.powerAction.cue,
      source: "power",
      categoryOverride: "power",
    });
    if (power) {
      const stripped = extractAndStripStageActionV1({
        text: args.replyText,
        lane: args.lane,
        participantNames: args.participantNames,
        userDisplayName: args.userDisplayName,
      });
      return {
        action: power,
        spokenText: stripped.spokenText || normalizeWhitespace(args.replyText),
      };
    }
  }

  const extracted = extractAndStripStageActionV1({
    text: args.replyText,
    lane: args.lane,
    participantNames: args.participantNames,
    userDisplayName: args.userDisplayName,
  });
  if (extracted.action) {
    return {
      action: {
        v: STAGE_ACTION_VERSION,
        name: "stageAction",
        source: "llm",
        category: "gesture",
        action: extracted.action,
        seed: args.plan.seed,
        lane: args.lane,
      },
      spokenText: extracted.spokenText,
    };
  }

  const director = selectScriptedStageActionV1({
    lane: args.lane,
    seed: args.plan.seed,
    moodHint: args.moodHint,
    recentActions: args.recentActions,
    allowCupActions: args.allowCupActions,
    source: "director",
  });
  return {
    action: director,
    spokenText: extracted.spokenText || normalizeWhitespace(args.replyText),
  };
}
