import type { LlmProvider, ProviderMessage } from "./providers.ts";

export const LIBRARY_GROUP_SUGGESTION_LIMIT = 3;
export const LIBRARY_GROUP_SUGGESTION_TIMEOUT_MS = 12_000;

export interface LibraryGroupSuggestionCandidate {
  id: string;
  name: string;
  description: string;
  memberNames: readonly string[];
}

function jsonObjectFromResponse(raw: string): Record<string, unknown> | null {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last < first) return null;
  try {
    const value = JSON.parse(raw.slice(first, last + 1)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Never trust a model-selected group id without intersecting server candidates. */
export function parseLibraryGroupSuggestionIds(
  raw: string,
  eligibleIds: ReadonlySet<string>,
): string[] {
  const payload = jsonObjectFromResponse(raw);
  const selected = payload?.groupIds;
  if (!Array.isArray(selected)) return [];
  return Array.from(
    new Set(
      selected.filter(
        (value): value is string =>
          typeof value === "string" && eligibleIds.has(value.trim()),
      ).map((value) => value.trim()),
    ),
  ).slice(0, LIBRARY_GROUP_SUGGESTION_LIMIT);
}

export async function inferLibraryGroupSuggestions(args: {
  provider: LlmProvider;
  bot: { name: string; purpose: string };
  candidates: readonly LibraryGroupSuggestionCandidate[];
  signal: AbortSignal;
}): Promise<string[]> {
  if (args.candidates.length === 0) return [];
  const eligibleIds = new Set(args.candidates.map((candidate) => candidate.id));
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You place a bot into existing PRISM Library groups. Select only fitting IDs from the supplied candidates. Reply with JSON only; do not create groups or explain your choice.",
    },
    {
      role: "user",
      content: JSON.stringify({
        bot: {
          name: args.bot.name.trim().slice(0, 120),
          purpose: args.bot.purpose.trim().slice(0, 600),
        },
        candidates: args.candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name.slice(0, 120),
          description: candidate.description.slice(0, 420),
          members: candidate.memberNames.slice(0, 6).map((name) => name.slice(0, 80)),
        })),
        response: {
          groupIds: "array of 0 to 3 exact candidate IDs",
        },
      }),
    },
  ];
  const raw = await args.provider.generateResponse(messages, {
    temperature: 0.15,
    maxTokens: 100,
    jsonMode: true,
    signal: args.signal,
    usagePurpose: "system_unlabeled",
  });
  return parseLibraryGroupSuggestionIds(raw, eligibleIds);
}
