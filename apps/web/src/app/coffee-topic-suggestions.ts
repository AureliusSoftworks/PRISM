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

export function formatCoffeeStarterTopicsClipboardText(args: {
  groupName?: string | null;
  groupId?: string | null;
  topicsByBotId?: CoffeeStarterTopicsByBotId | null;
  orderedBotIds?: readonly (string | null | undefined)[];
  botNamesById?: Readonly<Record<string, string | undefined>>;
}): string | null {
  const topicsByBotId = args.topicsByBotId;
  if (!topicsByBotId) return null;

  const orderedBotIds: string[] = [];
  const seenBotIds = new Set<string>();
  for (const botId of args.orderedBotIds ?? []) {
    const trimmed = typeof botId === "string" ? botId.trim() : "";
    if (!trimmed || seenBotIds.has(trimmed)) continue;
    seenBotIds.add(trimmed);
    orderedBotIds.push(trimmed);
  }
  const remainingBotIds = Object.keys(topicsByBotId)
    .filter((botId) => !seenBotIds.has(botId))
    .sort((a, b) => {
      const aName = args.botNamesById?.[a]?.trim() || a;
      const bName = args.botNamesById?.[b]?.trim() || b;
      return aName.localeCompare(bName);
    });
  const botIds = [...orderedBotIds, ...remainingBotIds];
  const sections: string[] = [];

  for (const botId of botIds) {
    const topics = normalizeCoffeeStarterTopicPool(topicsByBotId[botId] ?? []);
    if (topics.length === 0) continue;
    const name = args.botNamesById?.[botId]?.replace(/\s+/g, " ").trim();
    const label = name && name !== botId ? `${name} (${botId})` : botId;
    sections.push(
      [`${label}:`, ...topics.map((topic, index) => `${index + 1}. ${topic}`)].join("\n")
    );
  }

  if (sections.length === 0) return null;
  const lines = ["PRISM Coffee Group starter topics"];
  const groupName = args.groupName?.replace(/\s+/g, " ").trim();
  const groupId = args.groupId?.replace(/\s+/g, " ").trim();
  if (groupName) lines.push(`Group: ${groupName}`);
  if (groupId) lines.push(`Group ID: ${groupId}`);
  lines.push("", ...sections.map((section) => `${section}\n`));
  return lines.join("\n").trimEnd();
}
