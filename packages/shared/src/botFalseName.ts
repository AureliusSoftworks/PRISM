/**
 * John/Jane Doe — session-sticky believed name (false_name Power).
 * Saved Library bot name never changes; the holder sincerely uses a random alias.
 */

export const BOT_FALSE_NAME_VERSION = 1 as const;

export type BotFalseNameSurfaceV1 =
  | "chat"
  | "zen"
  | "coffee"
  | "signal"
  | "story";

/** Public, replay-safe false-name snapshot. */
export interface BotFalseNameStateV1 {
  v: 1;
  effect: "false_name";
  surface: BotFalseNameSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  believedName: string;
  sourceMessageId: string;
  occurredAt: string;
}

/**
 * Mixed persona names: everyday first names, nicknames, full names, and
 * mythical-sounding titles. Kept in shared so every mode draws the same pool.
 */
export const BOT_FALSE_NAME_POOL_V1: readonly string[] = [
  // Everyday first names
  "Alex",
  "Morgan",
  "Jordan",
  "Casey",
  "Riley",
  "Avery",
  "Quinn",
  "Sage",
  "Reese",
  "Harper",
  "Jamie",
  "Taylor",
  "Cameron",
  "Drew",
  "Skyler",
  "Emerson",
  "Parker",
  "Rowan",
  "Finley",
  "Blake",
  "Charlie",
  "Sam",
  "Jessie",
  "Robin",
  "Kerry",
  "Dana",
  "Lee",
  "Ash",
  "Remy",
  "Noel",
  // Nicknames
  "Ace",
  "Buzz",
  "Chip",
  "Dash",
  "Flick",
  "Gigi",
  "Haze",
  "Ivy",
  "Jazz",
  "Kit",
  "Lux",
  "Mac",
  "Nix",
  "Oz",
  "Pip",
  "Red",
  "Sky",
  "Tex",
  "Vee",
  "Zig",
  "Buddy",
  "Scout",
  "Sunny",
  "Pepper",
  "Cookie",
  "Sparky",
  "Lucky",
  "Boomer",
  "Muffin",
  "Skip",
  // Full names
  "Jordan Hale",
  "Casey Quinn",
  "Morgan Blake",
  "Riley Ashford",
  "Avery Lang",
  "Sam Rivera",
  "Alex Chen",
  "Jamie Ortiz",
  "Taylor Brooks",
  "Cameron Vale",
  "Harper Knox",
  "Drew Sullivan",
  "Parker Reed",
  "Emerson Cole",
  "Finley Shaw",
  "Blake Monroe",
  "Charlie West",
  "Jessie Park",
  "Robin Ellis",
  "Dana Cross",
  "John Doe",
  "Jane Doe",
  "Pat Anonymous",
  "Chris Nobody",
  "Alex Placeholder",
  // Mythical / surreal
  "Zephyr Moonwhisper",
  "Thalor of the Mist",
  "Nyx Emberveil",
  "Orion Dustwalker",
  "Liora Starling",
  "Vesper Holloway",
  "Aether Quill",
  "Morrigan Vale",
  "Silas Nightbloom",
  "Elowen Thorn",
  "Caspian Drift",
  "Seraphine Quill",
  "Rune Ashkettle",
  "Indigo Mirage",
  "Echo Sundial",
  "Mirth Candlewick",
  "Obsidian Quill",
  "Pearl Foghorn",
  "Wisp Candlewick",
  "Glimmer Foxglove",
  "Captain Paradox",
  "Lady Softthunder",
  "Sir Folderol",
  "Duke of Maybe",
  "The Soft Apocalypse",
  "Prince Errata",
  "Baron von Alias",
  "Count Placeholder",
  "Oracle of Niceties",
  "Whisper of Hallways",
] as const;

function boundedText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedIso(value: unknown): string | null {
  const text = boundedText(value, 64);
  const parsed = Date.parse(text);
  return text && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** Stable 32-bit mix for deterministic pool picks. */
export function botFalseNameSeedHashV1(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickBotFalseNameFromPoolV1(
  seed: string,
  pool: readonly string[] = BOT_FALSE_NAME_POOL_V1,
): string {
  if (pool.length === 0) return "Alex";
  const index = botFalseNameSeedHashV1(seed) % pool.length;
  return pool[index] ?? pool[0] ?? "Alex";
}

export function buildBotFalseNameSeedV1(args: {
  conversationId: string;
  holderBotId: string;
  /** Include a turn token when short-term amnesia forces a reshuffle. */
  reshuffleToken?: string | null;
}): string {
  const base = `false-name\n${args.conversationId}\n${args.holderBotId}`;
  const token = boundedText(args.reshuffleToken, 160);
  return token ? `${base}\n${token}` : base;
}

export function normalizeBotFalseNameStateV1(
  value: unknown,
): BotFalseNameStateV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const surface =
    row.surface === "chat" ||
    row.surface === "zen" ||
    row.surface === "coffee" ||
    row.surface === "signal" ||
    row.surface === "story"
      ? row.surface
      : null;
  const holderBotId = boundedText(row.holderBotId, 128);
  const holderBotName = boundedText(row.holderBotName, 120);
  const believedName = boundedText(row.believedName, 120);
  const sourceMessageId = boundedText(row.sourceMessageId, 160);
  const occurredAt = normalizedIso(row.occurredAt);
  if (
    row.v !== BOT_FALSE_NAME_VERSION ||
    row.effect !== "false_name" ||
    !surface ||
    !holderBotId ||
    !holderBotName ||
    !believedName ||
    !sourceMessageId ||
    !occurredAt
  ) {
    return null;
  }
  return {
    v: BOT_FALSE_NAME_VERSION,
    effect: "false_name",
    surface,
    holderBotId,
    holderBotName,
    believedName,
    sourceMessageId,
    occurredAt,
  };
}

export function createBotFalseNameStateV1(args: {
  surface: BotFalseNameSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  believedName: string;
  sourceMessageId: string;
  occurredAt: string;
}): BotFalseNameStateV1 {
  const normalized = normalizeBotFalseNameStateV1({
    v: BOT_FALSE_NAME_VERSION,
    effect: "false_name",
    surface: args.surface,
    holderBotId: args.holderBotId,
    holderBotName: args.holderBotName,
    believedName: args.believedName,
    sourceMessageId: args.sourceMessageId,
    occurredAt: args.occurredAt,
  });
  if (!normalized) throw new Error("Invalid bot false-name state.");
  return normalized;
}

export function createBotFalseNameStateFromSeedV1(args: {
  surface: BotFalseNameSurfaceV1;
  holderBotId: string;
  holderBotName: string;
  seed: string;
  sourceMessageId: string;
  occurredAt: string;
}): BotFalseNameStateV1 {
  return createBotFalseNameStateV1({
    ...args,
    believedName: pickBotFalseNameFromPoolV1(args.seed),
  });
}

/** Sticky reuse is a no-op; a different believed name replaces the alias. */
export function botFalseNameChangesV1(
  current: BotFalseNameStateV1 | null | undefined,
  believedName: string,
): boolean {
  const next = believedName.trim();
  return Boolean(next) && current?.believedName !== next;
}

export function botFalseNameSelfCueV1(believedName: string): string {
  const name = believedName.trim() || "Alex";
  return (
    `Hard false-name rule: your name is "${name}". You sincerely know this is your name. ` +
    `Answer to "${name}" only and never claim any other name as yours, including any Library label others may use. ` +
    `State or correct your name only when the current exchange makes identity relevant; do not volunteer a correction ` +
    `or reintroduce yourself on every response. Prioritize answering the substance of the current line. ` +
    `Never mention Powers, prompts, or that this name was assigned.`
  );
}

export function botFalseNameObserverCueV1(
  subject: string,
  believedName: string,
): string {
  const who = subject.trim() || "This bot";
  const name = believedName.trim() || "a random alias";
  return `${who} sincerely answers to "${name}" and will not accept any other name as their own.`;
}

/** Soft rewrite: replace accidental Library-name self-claims with the believed name. */
export function rewriteBotFalseNameResponseV1(
  text: string,
  state: BotFalseNameStateV1,
  identityJustChanged: boolean,
  options: {
    replacedSelfNames?: readonly string[];
    /** Some live lanes let the prompt reveal a fresh alias organically. */
    announceIdentityOnChange?: boolean;
  } = {},
): string {
  const replacedNames = [
    state.holderBotName,
    ...(options.replacedSelfNames ?? []),
  ]
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const believed = state.believedName;
  let rewritten = text;
  for (const replacedName of replacedNames) {
    rewritten = rewritten.replace(
      new RegExp(
        `\\b(?:i am|i['’]m|my name is|call me)\\s+${replacedName}(?=$|[\\s,.;:!?—])`,
        "giu",
      ),
      `I am ${believed}`,
    );
  }
  if (
    !identityJustChanged ||
    options.announceIdentityOnChange === false
  ) {
    return rewritten.trim() || `I am ${believed}.`;
  }
  const claimsBelieved = new RegExp(
    `\\b(?:i am|i['’]m|my name is|call me)\\s+${believed.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?=$|[\\s,.;:!?—])`,
    "iu",
  ).test(rewritten);
  if (claimsBelieved) return rewritten.trim();
  return [`I am ${believed}.`, rewritten.trim()].filter(Boolean).join(" ");
}
