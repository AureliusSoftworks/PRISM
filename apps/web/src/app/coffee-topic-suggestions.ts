export type CoffeeStarterTopicsByBotId = Record<string, readonly string[] | undefined>;

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function normalizeCoffeeStarterTopicPool(topics: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const topic of topics) {
    const trimmed = topic.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function coffeeStarterTopicPoolFromByBotId(
  topicsByBotId: CoffeeStarterTopicsByBotId | null | undefined,
  orderedBotIds: readonly (string | null | undefined)[]
): string[] {
  if (!topicsByBotId) return [];
  const ordered = orderedBotIds
    .filter((botId): botId is string => typeof botId === "string" && botId.trim().length > 0)
    .flatMap((botId) => topicsByBotId[botId] ?? []);
  const orderedIds = new Set(
    orderedBotIds.filter((botId): botId is string => typeof botId === "string")
  );
  const remaining = Object.entries(topicsByBotId)
    .filter(([botId]) => !orderedIds.has(botId))
    .flatMap(([, topics]) => topics ?? []);
  return normalizeCoffeeStarterTopicPool([...ordered, ...remaining]);
}

export function pickCoffeeStarterTopicOptions(
  topicPool: readonly string[],
  options: { count?: number; seed?: string | null } = {}
): string[] {
  const count = Math.max(0, Math.floor(options.count ?? 4));
  if (count === 0) return [];
  const normalized = normalizeCoffeeStarterTopicPool(topicPool);
  if (normalized.length <= count) return normalized;
  const seed = options.seed?.trim() || "coffee-starter-topics";
  return normalized
    .map((label, index) => ({
      label,
      score: stableUnitValue(`${seed}:${index}:${label}`),
      index,
    }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, count)
    .map(({ label }) => label);
}
