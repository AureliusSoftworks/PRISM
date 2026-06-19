import {
  BOT_VOICE_PRESET_LABELS,
  defaultBotPurpose,
  listBotProfileFacts,
  parseStoredBotPrompt,
  type BotMoodKey,
} from "@localai/shared";

export interface CoffeeInfoCardPersona {
  purpose: string;
  highlights: string[];
  facts: string[];
}

export interface CoffeeInfoCardMemoryInput {
  id: string;
  text: string;
  createdAt: string;
  source?: "direct" | "inferred" | "compiled" | "about_you";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function compactVoiceLabel(raw: string): string {
  const trimmed = normalizeWhitespace(raw);
  if (!trimmed) return "Balanced";
  const [left] = trimmed.split(" - ");
  return normalizeWhitespace(left ?? trimmed);
}

function uniqueNonEmptyLines(values: Array<string | undefined | null>, limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");
    if (!normalized) continue;
    const dedupeKey = normalized.toLocaleLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildCoffeeInfoCardPersona(botName: string, systemPrompt: string): CoffeeInfoCardPersona {
  const profile = parseStoredBotPrompt(systemPrompt).fields;
  const purpose = normalizeWhitespace(profile.purpose.statement) || defaultBotPurpose(botName);
  const voice = compactVoiceLabel(
    BOT_VOICE_PRESET_LABELS[profile.core.communicationStyle] ?? "Balanced"
  );
  const highlights = uniqueNonEmptyLines(
    [
      profile.core.traits,
      profile.identity.role,
      profile.identity.background,
      profile.worldview.values,
      profile.core.interests,
      `Voice: ${voice}`,
    ],
    3
  );
  const facts = uniqueNonEmptyLines(
    listBotProfileFacts(profile.facts).map((row) => `${row.label}: ${row.value}`),
    2
  );
  return {
    purpose: purpose || "No persona details yet",
    highlights,
    facts,
  };
}

export function coffeeMoodLabel(mood: BotMoodKey): string {
  switch (mood) {
    case "joyful":
      return "Joyful";
    case "warm":
      return "Warm";
    case "neutral":
      return "Neutral";
    case "guarded":
      return "Guarded";
    case "strained":
      return "Strained";
    default:
      return "Neutral";
  }
}

function createdAtMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export function buildCoffeeRecentMemoryPreview<T extends CoffeeInfoCardMemoryInput>(
  memories: readonly T[],
  limit = 3
): T[] {
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5, Math.floor(limit))) : 3;
  return memories
    .filter((memory) => memory.source !== "about_you")
    .filter((memory) => normalizeWhitespace(memory.text).length > 0)
    .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
    .slice(0, boundedLimit);
}
