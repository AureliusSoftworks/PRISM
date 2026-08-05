import {
  DEFAULT_COFFEE_SESSION_SETTINGS,
  normalizeCoffeeSessionSettings,
  type CoffeeSessionSettings,
} from "./coffeeSettings.ts";

/** Soft caps for Wield Prism → New Coffee Group invent. */
export const COFFEE_GROUP_SETUP_SUGGESTION_BOT_MIN = 2;
export const COFFEE_GROUP_SETUP_SUGGESTION_BOT_MAX = 5;
export const COFFEE_GROUP_SETUP_SUGGESTION_TOPIC_MIN = 2;
export const COFFEE_GROUP_SETUP_SUGGESTION_TOPIC_MAX = 6;
export const COFFEE_GROUP_SETUP_SUGGESTION_SEAT_COUNT = 5;

export interface CoffeeGroupSetupSuggestionRosterBot {
  id: string;
  name: string;
  personaSnippet?: string;
}

/**
 * Complete Coffee Group draft from Wield Prism on New Coffee Group.
 * Bot ids must come from the supplied Library roster.
 */
export interface CoffeeGroupSetupSuggestionV1 {
  name: string;
  ethos: string;
  /** Occupied seats first, padded to 5 with nulls. */
  groupBotIds: Array<string | null>;
  coffeeSettings: CoffeeSessionSettings;
  starterTopics: string[];
  notes: string;
}

function compactText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").slice(0, maxLength)
    : "";
}

function uniqueRosterIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Normalize a Prism-invented Coffee Group draft against the allowed roster.
 * Returns null when the cast is too thin or cites unknown bots.
 */
export function normalizeCoffeeGroupSetupSuggestionV1(
  value: unknown,
  allowedBotIds: readonly string[],
): CoffeeGroupSetupSuggestionV1 | null {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const allowed = new Set(
    allowedBotIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean),
  );
  if (allowed.size < COFFEE_GROUP_SETUP_SUGGESTION_BOT_MIN) return null;

  const rawBotIds = Array.isArray(source.groupBotIds)
    ? source.groupBotIds
    : Array.isArray(source.botIds)
      ? source.botIds
      : [];
  const chosen = uniqueRosterIds(
    rawBotIds
      .map((entry) => (typeof entry === "string" ? entry : ""))
      .filter((id) => allowed.has(id)),
  ).slice(0, COFFEE_GROUP_SETUP_SUGGESTION_BOT_MAX);
  if (chosen.length < COFFEE_GROUP_SETUP_SUGGESTION_BOT_MIN) return null;

  const groupBotIds: Array<string | null> = [
    ...chosen,
    ...Array.from(
      {
        length: Math.max(
          0,
          COFFEE_GROUP_SETUP_SUGGESTION_SEAT_COUNT - chosen.length,
        ),
      },
      () => null,
    ),
  ].slice(0, COFFEE_GROUP_SETUP_SUGGESTION_SEAT_COUNT);

  const name = compactText(source.name, 80);
  const ethos = compactText(source.ethos, 280);
  if (!name || !ethos) return null;

  const starterTopics = (
    Array.isArray(source.starterTopics) ? source.starterTopics : []
  )
    .map((topic) => compactText(topic, 160))
    .filter(Boolean)
    .slice(0, COFFEE_GROUP_SETUP_SUGGESTION_TOPIC_MAX);
  if (starterTopics.length < COFFEE_GROUP_SETUP_SUGGESTION_TOPIC_MIN) {
    return null;
  }

  const coffeeSettings = normalizeCoffeeSessionSettings({
    ...DEFAULT_COFFEE_SESSION_SETTINGS,
    ...(source.coffeeSettings &&
    typeof source.coffeeSettings === "object" &&
    !Array.isArray(source.coffeeSettings)
      ? source.coffeeSettings
      : {}),
  });

  return {
    name,
    ethos,
    groupBotIds,
    coffeeSettings,
    starterTopics,
    notes: compactText(source.notes, 280),
  };
}
